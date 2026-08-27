'use strict';

const { layout, layoutText } = require('./layout');

// **Offers** — the marketing email.
//
//   Trigger    nothing in production yet; see below
//   Recipient  people whose `marketing_emails` setting is 'true'
//   Template   account-offers
//
// ⚠️ **The only email carrying an unsubscribe link**, and the only one that
// may. Transactional mail must never offer one — it would invite somebody to
// opt out of the confirmation for a booking they have paid for.
//
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
    variant: 'at9',
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

module.exports = { offers };
