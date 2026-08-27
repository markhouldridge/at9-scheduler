'use strict';

const { layout, layoutText } = require('./layout');
const { providerAccent } = require('./brand-colours');
const {
  buildDetails,
  contactLine,
  formatDate,
  formatTime,
} = require('./booking-details');

// **Booking confirmed** — to the customer, the moment a booking is registered.
//
//   Trigger    `booking.created`
//   Recipient  the customer who booked
//   Template   booking-confirmation
//
// ⚠️ **The one email a business cannot afford to lose.** That is why booking
// mail has a queue to itself: a stuck welcome or a sysop test render must never
// sit at the head of the line in front of this.
//
// Where payment is required it is **not** sent when the booking row is written.
// The row is created `pending` holding the slot, and this goes out only when
// `payment_intent.succeeded` promotes it — so nobody is told a booking is
// confirmed before it has been paid for.
const confirmation = (booking) => {
  const org = booking.orgName || 'your provider';
  const when = formatDate(booking.startsAt);
  const parts = {
    // Sent on the business's behalf: their name, their colour, no At9 mark.
    // See the two-shell note in layout.js.
    variant: 'provider',
    accent: providerAccent(booking.orgBrandTheme),
    preheader: `Your booking with ${org} is confirmed.`,
    statusLabel: 'Booking confirmed',
    heading: 'Your booking is confirmed',
    intro: `Hi ${booking.customerName || 'there'}, thanks for booking with ${org}. Here are the details — keep this email for reference.`,
    details: buildDetails(booking),
    note: contactLine(org, booking.orgEmail),
    orgName: org,
  };
  return {
    // The organisation name leads the subject: it is what the recipient
    // recognises in a crowded inbox, and it keeps the reference out of the
    // preview where it reads as noise.
    subject: when
      ? `${org} — booking confirmed for ${when}`
      : `${org} — booking confirmed`,
    html: layout(parts),
    text: layoutText(parts),
  };
};

module.exports = { confirmation };
