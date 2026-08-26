'use strict';

const bookingTemplates = require('./booking');
const { welcome: customerWelcome } = require('./customer');
const { welcome: accountWelcome, offers: accountOffers } = require('./account');

// **Every email At9 sends, rendered from one sample, on demand.**
//
// ⚠️ **Named `testEmail.js`, never `test.js`** — see the note in
// `handlers/testEmail.js`. Bare `node --test` picks up any file called
// `test.js` as a test suite.
//
// This exists so a sysop can look at the mail the platform actually produces
// without booking something, cancelling it, joining a waiting list and waiting
// for a reminder sweep. Before it, the only way to see a `booking-reminder` was
// to make a booking for tomorrow and wait an hour.
//
// ## It is the registry, and it is deliberately the only one
//
// The template list lives **here**, next to the builders. The webservice does
// not hold a copy: it forwards whatever names it is given and this file decides
// what they mean — the same arrangement the `brandTheme` setting uses, and for
// the same reason. A service that validates against its own copy of a list it
// does not own is a second list to keep in step, and the failure is silent.
//
// The app holds the *labels* for the picker, which is the one duplication left.
// A name the app offers and this file does not know is logged as
// `test.unknown_template` and skipped rather than failing the whole send.

// One booking, invented, and used by all seven booking-shaped templates.
//
// ⚠️ **Fixed dates, not `Date.now()` arithmetic.** A sample generated relative
// to now reads differently every time it is sent, so two test emails a week
// apart cannot be compared — and "is the reminder wording right?" is exactly
// the question somebody is asking when they compare them. A fixed date also
// exercises the range formatting (`formatWhen`) the same way every run.
//
// The times are UTC wall-clock, like every stored booking (root CLAUDE.md).
const sampleBooking = (context) => ({
  customerName: context.customerName || 'Sam Taylor',
  orgName: context.orgName || 'Your Business',
  orgEmail: context.orgEmail || null,
  orgTimezone: context.orgTimezone || 'Europe/London',
  entityType: 'service',
  entityName: 'Cut and Colour',
  startsAt: '2026-09-12T14:30:00.000Z',
  endsAt: '2026-09-12T16:00:00.000Z',
  guests: 2,
  reference: 'AT9-SAMPLE',
  // Only `booking-cancelled` reads it, and a cancellation with no reason is a
  // different email from one with a reason — the sample shows the fuller case.
  cancelReason: 'The stylist is unwell',
  // Only `waitlist-offered` reads it. Deliberately after `startsAt` above, so
  // the deadline and the occurrence are not the same date and the two rows in
  // the detail block are visibly different facts.
  expiresAt: '2026-09-10T18:00:00.000Z',
});

// Name → builder. The names are the **stable template names** already used in
// the Grafana email panel (`TEMPLATE_NAMES` in each template module), so what a
// sysop picks here is the same string they will later search the logs for.
const TEMPLATES = {
  'booking-confirmation': (c) => bookingTemplates.confirmation(sampleBooking(c)),
  'booking-updated': (c) => bookingTemplates.updated(sampleBooking(c)),
  'booking-cancelled': (c) => bookingTemplates.cancelled(sampleBooking(c)),
  'booking-reminder': (c) => bookingTemplates.reminder(sampleBooking(c)),
  'waitlist-offered': (c) => bookingTemplates.waitlistOffered(sampleBooking(c)),
  'provider-new-booking': (c) =>
    bookingTemplates.providerNotice('booking.created', sampleBooking(c)),
  'provider-booking-cancelled': (c) =>
    bookingTemplates.providerNotice('booking.cancelled', sampleBooking(c)),
  'customer-welcome': (c) =>
    customerWelcome({
      customerName: c.customerName || 'Sam Taylor',
      orgName: c.orgName || 'Your Business',
      orgEmail: c.orgEmail || null,
    }),
  'account-welcome': (c) => accountWelcome({ name: c.customerName || 'Sam' }),
  // ⚠️ **The one sample carrying a real, working unsubscribe link.** The URL is
  // minted by the sysop route for the sysop's own account, so clicking it in
  // the sample genuinely opts them out — which is the point. It is how the
  // token, the website page and the route get exercised without waiting for a
  // marketing campaign to exist.
  'account-offers': (c) =>
    accountOffers({
      name: c.customerName || 'Sam',
      unsubscribeUrl: c.unsubscribeUrl || null,
    }),
};

const TEMPLATE_IDS = Object.keys(TEMPLATES);

// ⚠️ **The subject is prefixed, and that is not decoration.**
//
// These land in the same inbox as the real thing — the sysop's own address,
// which for a test account is also where `services/brevo.js` redirects genuine
// mail. Without a marker, a sample "Booking cancelled — Your Business" is
// indistinguishable from a customer's actual cancellation, and somebody will
// act on one of them.
const buildTestEmail = (id, context = {}) => {
  const build = TEMPLATES[id];
  if (!build) return null;
  const built = build(context);
  return { ...built, subject: `[TEST] ${built.subject}`, template: id };
};

module.exports = { buildTestEmail, TEMPLATE_IDS, TEMPLATES };
