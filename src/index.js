'use strict';

const { createBus } = require('./queue/connection');
const { registerConsumer } = require('./queue/consumer');
const { rabbitmq } = require('./config');
const bookingHandler = require('./handlers/booking');
const log = require('./logger');

const bus = createBus();

// Consume the same durable queue + topics the webservice publishes to
// (exchange `bookings`, queue `booking-messages`, routing `booking.#`).
// Future concerns (e.g. SMS, push) register their own queue + bindings
// here without touching the bus or consumer code.
registerConsumer(bus, {
  queue: rabbitmq.queue,
  bindings: [rabbitmq.binding],
  handler: bookingHandler.handle,
});

const shutdown = async (signal) => {
  log.info('scheduler.shutdown', { signal });
  try {
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
