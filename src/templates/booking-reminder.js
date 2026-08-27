'use strict';

const { layout, layoutText } = require('./layout');
const { providerAccent } = require('./brand-colours');
const {
  buildDetails,
  contactLine,
  formatDate,
  formatTime,
} = require('./booking-details');

// **Booking reminder** — to the customer, roughly a day before.
//
//   Trigger    the scheduler's hourly sweep (`jobs/reminders.js`)
//   Recipient  the customer
//   Template   booking-reminder
//   Gated on   `booking_reminders` — Pro
//
// **The only email nothing publishes an event for.** There is no moment at
// which "tomorrow" happens, so the scheduler polls for bookings that are due
// rather than waiting to be told.
//
// ⚠️ That query asks the entitlement question **in SQL**, independently of
// `helpers/capabilities.js` — so it is a third place to check whenever a
// capability moves between plans, and it has been missed before. A tagged test
// account does not receive these at all, because tags never reach it.
//
// It exists to cut no-shows, so the closing line is about telling the business
// early rather than about the booking itself.
const reminder = (booking) => {
  const org = booking.orgName || 'your provider';
  const at = formatTime(booking.startsAt);
  const parts = {
    variant: 'provider',
    accent: providerAccent(booking.orgBrandTheme),
    preheader: `A reminder about your booking with ${org} tomorrow.`,
    statusLabel: 'Reminder',
    heading: 'Your booking is tomorrow',
    intro: `Hi ${booking.customerName || 'there'}, this is a friendly reminder about your booking with ${org} tomorrow.`,
    details: buildDetails(booking),
    note: booking.orgEmail
      ? `Can no longer make it? Reply to this email and let ${org} know, so the slot can be offered to someone else.`
      : `Can no longer make it? Please let ${org} know as soon as you can, so the slot can be offered to someone else.`,
    orgName: org,
  };
  return {
    // The time is the fact the reminder exists to deliver, so it is in the
    // subject rather than only in the body.
    subject: at
      ? `${org} — your booking is tomorrow at ${at}`
      : `${org} — your booking is tomorrow`,
    html: layout(parts),
    text: layoutText(parts),
  };
};

module.exports = { reminder };
