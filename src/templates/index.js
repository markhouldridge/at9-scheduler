'use strict';

// **Every email At9 sends, and the event that produces it.**
//
// One file per email — the filename *is* the template name, so what you read in
// a Grafana panel or a `email.sent` log line is the file you open. They used to
// be grouped by channel (`booking.js` held five of them, plus the provider
// notice), which meant the only way to find the wording of a reminder was to
// scroll past four other emails to reach it.
//
// ⚠️ **The template names are stable and must not be renamed casually.** The
// email dashboard groups by them, so a rename silently splits that template's
// history in two — the old name stops receiving and the new one starts from
// zero, with nothing to say they are the same thing.
//
// ## Adding an email
//
// 1. A new file here, named for what it *is*, exporting one builder that
//    returns `{ subject, html, text }`.
// 2. An entry in both maps below, keyed by the event that triggers it.
//
// Nothing else. The handlers dispatch through `buildEmail` and never name a
// template, so an email is added without touching the queue layer at all.

const { confirmation } = require('./booking-confirmation');
const { updated } = require('./booking-updated');
const { cancelled } = require('./booking-cancelled');
const { reminder } = require('./booking-reminder');
const { waitlistOffered } = require('./waitlist-offered');
const { providerNotice } = require('./provider-notice');
const { welcome: customerWelcome } = require('./customer-welcome');
const { welcome: accountWelcome } = require('./account-welcome');
const { offers } = require('./account-offers');

// Event → builder. Events are namespaced (`booking.`, `customer.`, `account.`),
// so one registry serves all three queues without any chance of collision —
// which is why there is one map rather than a `buildBookingEmail`,
// `buildCustomerEmail` and `buildAccountEmail` doing the same thing three times.
const TEMPLATES = {
  'booking.created': confirmation,
  'booking.updated': updated,
  'booking.cancelled': cancelled,
  'booking.reminder': reminder,
  'waitlist.offered': waitlistOffered,
  'customer.welcome': customerWelcome,
  'account.welcome': accountWelcome,
  'account.offers': offers,
};

// The stable names. See the warning above before changing one.
const TEMPLATE_NAMES = {
  'booking.created': 'booking-confirmation',
  'booking.updated': 'booking-updated',
  'booking.cancelled': 'booking-cancelled',
  'booking.reminder': 'booking-reminder',
  'waitlist.offered': 'waitlist-offered',
  'customer.welcome': 'customer-welcome',
  'account.welcome': 'account-welcome',
  'account.offers': 'account-offers',
};

// Builds the email for an event, or **null** when that event has no template.
//
// Null rather than a throw: a handler receiving an event nobody wrote an email
// for should consume it and log, not retry forever. An event with no template
// will not grow one by being redelivered.
const buildEmail = (event, data) => {
  const build = TEMPLATES[event];
  if (!build) return null;
  return { ...build(data), template: TEMPLATE_NAMES[event] };
};

module.exports = {
  buildEmail,
  TEMPLATES,
  TEMPLATE_NAMES,
  // Not event-dispatched: one builder serves two events and the booking handler
  // picks between them, because the *audience* differs rather than the trigger.
  // The customer is told about their booking and reassured; the business is
  // told who booked and asked nothing.
  providerNotice,
};
