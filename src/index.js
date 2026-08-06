'use strict';

const { createBus } = require('./queue/connection');
const { registerConsumer } = require('./queue/consumer');
const { rabbitmq } = require('./config');
const bookingHandler = require('./handlers/booking');
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
