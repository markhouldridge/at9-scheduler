'use strict';

const { createBus } = require('./queue/connection');
const { registerConsumer } = require('./queue/consumer');
const emailHandler = require('./handlers/email');
const log = require('./logger');

const bus = createBus();

// One queue per concern. Future topics (e.g. SMS, push) register their
// own queue + bindings here without touching the bus or consumer code.
registerConsumer(bus, {
  queue: 'at9.email',
  bindings: ['email.*'],
  handler: emailHandler.handle,
});

const shutdown = async (signal) => {
  log.info('worker.shutdown', { signal });
  try {
    await bus.stop();
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => {
  log.error('worker.unhandled_rejection', { err: err?.message ?? String(err) });
});

bus.start().catch((err) => {
  log.error('worker.boot.failed', { err: err.message });
  process.exit(1);
});

log.info('worker.starting');
