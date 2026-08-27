'use strict';

const { layout, layoutText } = require('./layout');
const { providerAccent } = require('./brand-colours');
const {
  buildDetails,
  contactLine,
  formatDate,
  formatTime,
} = require('./booking-details');

// **Booking updated** — to the customer, when something about it changed.
//
//   Trigger    `booking.updated`
//   Recipient  the customer
//   Template   booking-updated
//
// ⚠️ **The details block is the current state, not a diff.** What a customer
// needs is what is true now; working out what moved is our job rather than
// theirs, and a before/after table is misread under time pressure at least as
// often as it is read correctly. The intro asks them to check the date and
// time, which are the two things that actually change.
//
// **Not sent to the business.** A provider who changed a booking themselves
// does not need telling, and that is the commonest way one changes — see
// `provider-notice.js`, which covers the two cases where they do.
const updated = (booking) => {
  const org = booking.orgName || 'your provider';
  const when = formatDate(booking.startsAt);
  const parts = {
    variant: 'provider',
    accent: providerAccent(booking.orgBrandTheme),
    preheader: `Your booking with ${org} has changed.`,
    statusLabel: 'Booking updated',
    heading: 'Your booking has been updated',
    intro: `Hi ${booking.customerName || 'there'}, your booking with ${org} has changed. The details below are the current ones — please check the date and time.`,
    details: buildDetails(booking),
    note: contactLine(org, booking.orgEmail),
    orgName: org,
  };
  return {
    // The new date in the subject, because the date is what changed often
    // enough that a customer scanning an inbox is looking for it.
    subject: when
      ? `${org} — booking updated, now ${when}`
      : `${org} — your booking has been updated`,
    html: layout(parts),
    text: layoutText(parts),
  };
};

module.exports = { updated };
