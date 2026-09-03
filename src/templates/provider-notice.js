'use strict';

const { layout, layoutText } = require('./layout');
const {
  buildDetails,
  contactLine,
  formatDate,
  formatTime,
} = require('./booking-details');

// **Provider notice** — the business's own copy of a booking, or a change to one.
//
//   Trigger    `booking.created` / `booking.updated` / `booking.cancelled`
//   Recipient  the organisation's notification address, if one is set
//   Templates  provider-new-booking · provider-booking-changed ·
//              provider-booking-cancelled
//
// ⚠️ **One builder, three emails**, which is why it is not in `index.js`'s event
// map: the *audience* differs rather than the trigger, so the booking handler
// picks between them after it has already sent the customer's copy.
//
// **There is no fallback address.** Empty means no notification at all, and
// customer mail goes out with no reply-to. It used to fall back to the first
// administrator's personal address — nobody chose to be that address, they were
// simply created first.
//
// ⚠️ **An update only reaches the business when somebody else made it.** This
// used to be "updates are deliberately absent, a business that changed a
// booking itself does not need telling" — right about the provider's own edits
// and wrong about everything else, because it assumed the provider was the only
// one who could edit. A customer can move their own class or event booking to
// another date (`bookingForSelf` in webservice/src/routes/classes.js and
// events.js), and that change reached nobody: the place a business had set
// aside silently moved.
//
// The handler decides, on the event's `source` — never this builder. See
// `PROVIDER_NOTIFIABLE_UPDATE_SOURCES` in handlers/booking.js.
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

// The three shapes, keyed by the event. A map rather than the nested ternaries
// this grew out of: with two states a `created` boolean read fine, with three
// every line became a puzzle about which branch it belonged to.
//
// `intro` is a function because the cancelled one needs the reason and the
// others do not.
const NOTICE = {
  'booking.created': {
    template: 'provider-new-booking',
    statusLabel: 'New booking',
    heading: 'You have a new booking',
    subjectPrefix: 'New booking',
    preheader: (who) => `${who} has booked with you.`,
    intro: (who, org) => `${who} has just booked with ${org}. The details are below.`,
  },
  'booking.updated': {
    template: 'provider-booking-changed',
    statusLabel: 'Booking changed',
    heading: 'A booking was changed',
    subjectPrefix: 'Booking changed',
    preheader: (who) => `${who} has changed their booking.`,
    // Says **who** changed it, because that is the entire reason this email
    // exists. The business did not make this change and needs to know that
    // before it reads the details — the times below are the new ones.
    intro: (who, org) =>
      `${who} has changed their booking with ${org}. The updated details are below.`,
  },
  'booking.cancelled': {
    template: 'provider-booking-cancelled',
    statusLabel: 'Booking cancelled',
    heading: 'A booking was cancelled',
    subjectPrefix: 'Booking cancelled',
    preheader: (who) => `${who}'s booking has been cancelled.`,
    intro: (who, org, reason) =>
      reason
        ? `${who}'s booking with ${org} has been cancelled. Reason given: ${reason}`
        : `${who}'s booking with ${org} has been cancelled.`,
  },
};

const providerNotice = (event, booking) => {
  const shape = NOTICE[event];
  // An event with no shape has no email. Null rather than a throw, matching
  // `buildEmail` — the handler already treats a missing notice as "nothing to
  // send" and must not retry an event nobody wrote an email for.
  if (!shape) return null;

  const who = booking.customerName || 'A customer';
  const org = booking.orgName || 'your business';
  const when = formatDate(booking.startsAt);

  const parts = {
    // ⚠️ **At9-branded, unlike every other booking email.** This one goes to
    // the *business*, and a business is At9's own customer — the message is
    // from us, about their account, so it wears our brand rather than theirs.
    variant: 'at9',
    preheader: shape.preheader(who),
    statusLabel: shape.statusLabel,
    heading: shape.heading,
    intro: shape.intro(who, org, booking.cancelReason),
    details: buildDetails(booking),
    // No "reply to us and we can help" line — the business *is* us here.
    note: 'You are receiving this because your organisation has a notification address set. Change it in Settings, Organisation.',
    // ⚠️ **Overridden, or the business is told it sent itself this email.**
    // The default footer is written for a customer — "This email was sent by
    // {org} about your booking" — which is exactly backwards here: the reader
    // *is* {org}, and the booking is not theirs. It is At9 writing to them.
    footerNote: 'This is an automatic notification from At9.',
    orgName: org,
  };

  return {
    // The customer's name leads, because that is what a business scans an
    // inbox for. The org name would be the same on every one of these.
    subject: `${shape.subjectPrefix} — ${who}${when ? `, ${when}` : ''}`,
    html: layout(parts),
    text: layoutText(parts),
    template: shape.template,
  };
};

// Builds the email for an event, or null when that event has no template.
// The returned `template` is carried into the log line so a dashboard can show
// which template produced each send.

module.exports = { providerNotice };
