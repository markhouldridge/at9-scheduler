'use strict';

const { layout, layoutText } = require('./layout');
const { providerAccent } = require('./brand-colours');
const {
  buildDetails,
  contactLine,
  formatDate,
  formatTime,
} = require('./booking-details');

// **Booking cancelled** — to the customer, when a booking will not happen.
//
//   Trigger    `booking.cancelled`
//   Recipient  the customer
//   Template   booking-cancelled
//
// Carries the reason when one was given, in the **opening sentence** rather
// than a detail row. A cancellation with an explanation is a different message
// from one without, and the explanation is the first thing the reader wants —
// not something to hunt for under the date.
//
// ⚠️ Cancelling does not refund, and this email makes no claim about money in
// either direction. Whether anything is returned is the provider's decision,
// taken separately; saying anything here would pre-empt it.
const cancelled = (booking) => {
  const org = booking.orgName || 'your provider';
  const when = formatDate(booking.startsAt);
  const parts = {
    variant: 'provider',
    accent: providerAccent(booking.orgBrandTheme),
    preheader: `Your booking with ${org} has been cancelled.`,
    statusLabel: 'Booking cancelled',
    heading: 'Your booking has been cancelled',
    intro: booking.cancelReason
      ? `Hi ${booking.customerName || 'there'}, your booking with ${org} has been cancelled. Reason given: ${booking.cancelReason}`
      : `Hi ${booking.customerName || 'there'}, your booking with ${org} has been cancelled.`,
    details: buildDetails(booking),
    note: booking.orgEmail
      ? `If this is unexpected, reply to this email and ${org} will be able to help.`
      : `If this is unexpected, please contact ${org} — they will be able to help.`,
    orgName: org,
  };
  return {
    subject: when
      ? `${org} — booking cancelled (${when})`
      : `${org} — booking cancelled`,
    html: layout(parts),
    text: layoutText(parts),
  };
};

module.exports = { cancelled };
