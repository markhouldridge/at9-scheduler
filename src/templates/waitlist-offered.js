'use strict';

const { layout, layoutText } = require('./layout');
const { providerAccent } = require('./brand-colours');
const {
  buildDetails,
  contactLine,
  formatDate,
  formatTime,
} = require('./booking-details');

// **A place has come up** — to the customer holding the offer.
//
//   Trigger    `waitlist.offered`
//   Recipient  the longest-waiting person on the list
//   Template   waitlist-offered
//
// ⚠️ **The place is being held while they decide.** Capacity counts a live
// offer exactly like a booking, so nobody can take it out from under them —
// that rule is what the whole waiting-list model rests on, and it is why this
// email has a deadline at all.
//
// The one email with a deadline in it. The deadline is the whole point — a
// place is being held, and it goes to the next person if this one lapses — so
// it appears in the preheader, the intro, the detail block and the closing
// line rather than being mentioned once.
const waitlistOffered = (booking) => {
  const org = booking.orgName || 'your provider';
  const deadline = booking.expiresAt
    ? `${formatDate(booking.expiresAt)} at ${formatTime(booking.expiresAt)}`
    : null;

  const details = buildDetails(booking);
  if (deadline) details.push({ label: 'Accept by', value: deadline });

  const parts = {
    variant: 'provider',
    accent: providerAccent(booking.orgBrandTheme),
    preheader: deadline
      ? `A place has come up — accept by ${deadline} to keep it.`
      : `A place has come up with ${org}.`,
    statusLabel: 'Place available',
    heading: 'A place has come up',
    intro: `Hi ${booking.customerName || 'there'}, good news — a place has come up on your waiting list with ${org}, and it is being held for you.`,
    details,
    // ⚠️ **The only transactional email with buttons in it**, because it is
    // the only one asking the reader to act — and the place lapses if they
    // do not. Accepting happens in the app, so somebody without it has to be
    // sent to a store rather than told to open something they do not have.
    appPrompt: {
      label: 'To accept this place',
      body: deadline
        ? `Open the At9 app and accept the offer. The place is held until ${deadline}; after that it goes to the next person waiting.`
        : 'Open the At9 app and accept the offer before it goes to the next person waiting.',
    },
    note: null,
    orgName: org,
  };
  return {
    subject: deadline
      ? `${org} — a place has come up, accept by ${deadline}`
      : `${org} — a place has come up`,
    html: layout(parts),
    text: layoutText(parts),
  };
};

module.exports = { waitlistOffered };
