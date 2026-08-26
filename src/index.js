'use strict';

// Before anything else loads. The webservice does the same in app.js:5 — every
// At9 service runs in UTC so date handling cannot depend on the host's zone
// (see the root CLAUDE.md). This has to precede the `pg` require below, since
// node-postgres reads the process zone when parsing zone-less timestamps.
process.env.TZ = 'UTC';

const { createBus } = require('./queue/connection');
const { registerConsumer } = require('./queue/consumer');
const { rabbitmq } = require('./config');
const bookingHandler = require('./handlers/booking');
const customerHandler = require('./handlers/customer');
const accountHandler = require('./handlers/account');
const testHandler = require('./handlers/testEmail');
const emailHandler = require('./handlers/email');
const reminders = require('./jobs/reminders');
const log = require('./logger');

const bus = createBus();

// Consume the same durable queue + topics the webservice publishes to
// (exchange `bookings`, queue `booking-messages`, routing `booking.#`).
// Future concerns (e.g. SMS, push) register their own queue + bindings
// here without touching the bus or consumer code.
registerConsumer(bus, {
  queue: rabbitmq.queue,
  bindings: rabbitmq.bindings ?? [rabbitmq.binding],
  handler: bookingHandler.handle,
});

// Customer lifecycle — a welcome when a provider adds someone and asks for it.
// Its own queue, so a stuck welcome cannot delay a booking confirmation.
registerConsumer(bus, {
  queue: rabbitmq.customerQueue,
  bindings: rabbitmq.customerBindings,
  handler: customerHandler.handle,
});

// Account lifecycle — the welcome sent once a new registration verifies its
// email address. Its own queue, so a stuck welcome cannot delay a booking
// confirmation, and because it is the one email At9 sends as itself.
registerConsumer(bus, {
  queue: rabbitmq.accountQueue,
  bindings: rabbitmq.accountBindings,
  handler: accountHandler.handle,
});

// Sysop test sends — every template rendered from one fixed sample, so the
// mail can be read without booking something and waiting for a sweep. Its own
// queue: one request can ask for nine emails, and that must never queue in
// front of a booking confirmation.
registerConsumer(bus, {
  queue: rabbitmq.testQueue,
  bindings: rabbitmq.testBindings,
  handler: testHandler.handle,
});

// Generic transactional email — a rendered message published by any service
// that already knows what it wants to say.
//
// `handlers/email.js` has existed since the queue was built and was never
// registered, so anything publishing `email.*` was silently dropped. Wiring it
// here is what makes "send an email" a thing the platform can do, rather than
// something each feature reimplements.
registerConsumer(bus, {
  queue: rabbitmq.emailQueue,
  bindings: rabbitmq.emailBindings,
  handler: emailHandler.handle,
});

// Booking reminders are the one email nothing publishes an event for — the
// scheduler polls for bookings due tomorrow instead. See jobs/reminders.js.
const stopReminders = reminders.start();

const shutdown = async (signal) => {
  log.info('scheduler.shutdown', { signal });
  try {
    stopReminders();
    await bus.stop();
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => {
  log.error('scheduler.unhandled_rejection', { err: err?.message ?? String(err) });
});

bus.start().catch((err) => {
  log.error('scheduler.boot.failed', { err: err.message });
  process.exit(1);
});

log.info('scheduler.starting');
