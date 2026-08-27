'use strict';

const { layout, layoutText } = require('./layout');
const {
  buildDetails,
  contactLine,
  formatDate,
  formatTime,
} = require('./booking-details');

// **Provider notice** — the business's own copy of a booking, or a cancellation.
//
//   Trigger    `booking.created` / `booking.cancelled`
//   Recipient  the organisation's notification address, if one is set
//   Templates  provider-new-booking · provider-booking-cancelled
//
// ⚠️ **One builder, two emails**, which is why it is not in `index.js`'s event
// map: the *audience* differs rather than the trigger, so the booking handler
// picks between them after it has already sent the customer's copy.
//
// **There is no fallback address.** Empty means no notification at all, and
// customer mail goes out with no reply-to. It used to fall back to the first
// administrator's personal address — nobody chose to be that address, they were
// simply created first.
//
// **Updates are deliberately absent.** A business that changed a booking itself
// does not need telling.
//
// ⚠️ **Failing to send this never fails the job.** The customer's email has
// already gone by then, and requeueing would send them a second confirmation —
// a duplicate is a worse outcome than a missed internal copy.
//
//
// A separate builder rather than a flag on the customer templates: the audience
// is different in every line. The customer is told about *their* booking and
// reassured; the business is told *who* booked and asked nothing. Sharing one
// template and branching inside it produced sentences that read as though
// written for somebody else, because they were.
//
// Reuses `buildDetails`, because the facts are the same facts.
const providerNotice = (event, booking) => {
  const created = event === 'booking.created';
  const who = booking.customerName || 'A customer';
  const org = booking.orgName || 'your business';
  const when = formatDate(booking.startsAt);

  const parts = {
    // ⚠️ **At9-branded, unlike every other booking email.** This one goes to
    // the *business*, and a business is At9's own customer — the message is
    // from us, about their account, so it wears our brand rather than theirs.
    variant: 'at9',
    preheader: created
      ? `${who} has booked with you.`
      : `${who}'s booking has been cancelled.`,
    statusLabel: created ? 'New booking' : 'Booking cancelled',
    heading: created ? 'You have a new booking' : 'A booking was cancelled',
    intro: created
      ? `${who} has just booked with ${org}. The details are below.`
      : booking.cancelReason
        ? `${who}'s booking with ${org} has been cancelled. Reason given: ${booking.cancelReason}`
        : `${who}'s booking with ${org} has been cancelled.`,
    details: buildDetails(booking),
    // No "reply to us and we can help" line — the business *is* us here.
    note: 'You are receiving this because your organisation has a notification address set. Change it in Settings, Organisation.',
    orgName: org,
  };

  return {
    // The customer's name leads, because that is what a business scans an
    // inbox for. The org name would be the same on every one of these.
    subject: created
      ? `New booking — ${who}${when ? `, ${when}` : ''}`
      : `Booking cancelled — ${who}${when ? `, ${when}` : ''}`,
    html: layout(parts),
    text: layoutText(parts),
    template: created ? 'provider-new-booking' : 'provider-booking-cancelled',
  };
};

// Builds the email for an event, or null when that event has no template.
// The returned `template` is carried into the log line so a dashboard can show
// which template produced each send.

module.exports = { providerNotice };
