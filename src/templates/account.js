'use strict';

const { layout, layoutText } = require('./layout');

// Account emails — messages about the person's relationship with **At9**,
// rather than with a business.
//
// ⚠️ **This is the one place the platform is allowed to be the sender**, and it
// is the exception that the rule in `templates/customer.js` exists to protect.
// Booking and customer mail carries the business's name in the header band
// because the recipient booked with a salon, not with us; here there is no
// business — the person signed up to At9 and verified an At9 address, so an
// email branded by anyone else would be the confusing one.
//
// Nothing here reads the database. A welcome needs a name and an address, both
// of which the webservice had in hand at the moment it decided to send.

// --- Welcome ---------------------------------------------------------------
// Sent **once**, when a newly registered person first reaches the service with
// a verified email address. See `getUserForFirebaseUserId` in the webservice
// for the once-only claim.
//
// ## Why it is written in two halves
//
// At9 is two products behind one sign-up: a customer books, a provider takes
// bookings. Which one a new account is has not been asked at this point and
// often is not settled — a salon owner books their own haircut elsewhere.
//
// So the email does not guess. It states both cases, labelled with the sentence
// the reader would use about themselves ("I'm a customer" / "I run a business"),
// and lets them read the half that applies. A welcome that assumed wrong would
// spend its one paragraph explaining the wrong product.
//
// Kept to a sentence or two each. This is read once, in an inbox, by somebody
// who has just finished signing up and wants to get on with it.
const welcome = (account) => {
  const name = account.name || 'there';
  const parts = {
    preheader: 'Book with a business, or take bookings for your own.',
    statusLabel: 'Welcome',
    heading: `Welcome to At9, ${name}`,
    intro:
      'Your email address is confirmed, so your account is ready. At9 keeps bookings in one place — the ones you make, and the ones you take. Here is the short version.',
    details: [
      {
        label: "I'm a customer",
        value:
          'Search for a business in the app and book in a few taps. Everything you have booked — past, upcoming and cancelled — sits under Bookings, where you can also message the business or cancel.',
      },
      {
        label: 'I run a business',
        value:
          'Add your rooms, tables, classes, events or services, set when you are open, and share your booking link. Bookings arrive in your schedule as they happen, and your customers get confirmations automatically.',
      },
    ],
    note: 'You can do both from this one account — nothing to set up twice. Open the app and pick whichever fits.',
    footerNote:
      'You are receiving this because you created an At9 account. At9 is the booking system small businesses use to manage rooms, tables, classes, events and appointments.',
    // The header band. At9 by name here, deliberately — see the note above.
    orgName: 'At9',
  };
  return {
    subject: 'Welcome to At9',
    html: layout(parts),
    text: layoutText(parts),
  };
};

// --- Offers ----------------------------------------------------------------
// **The only marketing email, and the only one carrying an unsubscribe link.**
//
// ⚠️ **Nothing sends this in production yet.** It exists so the unsubscribe
// chain is provable end to end — a sysop can send themselves one from the Test
// section, click the link, and watch the flag change. Without it the unsubscribe
// route, the website page and the token would all be untested code waiting for a
// campaign that has not been written.
//
// Two rules whatever eventually sends it must keep:
//
//   * **Only to people whose `marketing_emails` setting is 'true'.** Absent
//     means no. Most rows in `users` are people a provider typed in who never
//     signed up to anything, and mailing them is the breach.
//   * **Always with an `unsubscribeUrl`.** It is a parameter rather than a
//     fixture so transactional mail does not get one, which means a marketing
//     send that forgets it produces a legal problem and no error.
const offers = (account) => {
  const parts = {
    preheader: 'What is new in At9.',
    statusLabel: 'Offers',
    heading: `Hello ${account.name || 'there'}`,
    intro:
      'A short note about what is new in At9 — new features, and the occasional offer. We keep these rare and we do not share your address with anyone.',
    details: [
      {
        label: 'What is new',
        value:
          'This is a sample. Whatever is actually worth telling you about goes here.',
      },
    ],
    note: 'You can turn these off at any time in the app, under Account, or with the link below.',
    footerNote:
      'You are receiving this because you asked for offers from At9. You will still get emails about your bookings — those are not marketing and cannot be switched off.',
    orgName: 'At9',
    // The whole point of this template.
    unsubscribeUrl: account.unsubscribeUrl || null,
  };
  return {
    subject: 'What is new in At9',
    html: layout(parts),
    text: layoutText(parts),
  };
};

const TEMPLATES = {
  'account.welcome': welcome,
  'account.offers': offers,
};

// Stable template names — the Grafana email panel groups by these, so renaming
// one silently splits its history.
const TEMPLATE_NAMES = {
  'account.welcome': 'account-welcome',
  'account.offers': 'account-offers',
};

// Builds the email for an event, or null when that event has no template.
const buildAccountEmail = (event, account) => {
  const build = TEMPLATES[event];
  if (!build) return null;
  return { ...build(account), template: TEMPLATE_NAMES[event] };
};

module.exports = { buildAccountEmail, TEMPLATE_NAMES, welcome, offers };
