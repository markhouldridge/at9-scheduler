'use strict';

const { layout, layoutText } = require('./layout');

// **Welcome to At9** — to somebody who has just verified their own account.
//
//   Trigger    the first authenticated request carrying a verified token
//   Recipient  the new account holder
//   Template   account-welcome
//
// ⚠️ **Sent exactly once, ever.** The claim is a `user_settings` row taken
// before publishing, so two app launches racing at sign-in produce one email —
// see `sendWelcomeEmailOnce` in the webservice.
//
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
    // From At9, about an At9 account. Full brand.
    variant: 'at9',
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
    appPrompt: {
      label: 'Get the app',
      body: 'You can do both from this one account — nothing to set up twice. Open the app and pick whichever fits.',
    },
    note: null,
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

module.exports = { welcome };
