'use strict';

const { rabbitmq } = require('../config');
const { PermanentError } = require('./errors');
const log = require('../logger');

// Generic consumer registration. Pass it the bus from connection.js,
// the queue name, the routing-key patterns to bind, and a handler that
// receives the parsed payload. The handler may throw — PermanentError
// drops the message, anything else requeues it once.
//
// New topics are added by calling registerConsumer again from index.js
// (e.g. another queue bound to `sms.*`). No queue-specific code needs
// to live in the bus or connection layer.
const registerConsumer = (bus, { queue, bindings, handler }) => {
  bus.onChannel(async (channel) => {
    await channel.assertQueue(queue, { durable: true });
    for (const pattern of bindings) {
      await channel.bindQueue(queue, rabbitmq.exchange, pattern);
    }
    // prefetch(1) means the broker only delivers one message at a time
    // per consumer, so a slow handler can't be flooded.
    await channel.prefetch(1);
    await channel.consume(queue, async (msg) => {
      if (!msg) return; // consumer cancelled
      const routingKey = msg.fields.routingKey;
      let payload;
      try {
        payload = JSON.parse(msg.content.toString('utf8'));
      } catch (err) {
        log.warn('consumer.payload.unparseable', {
          queue,
          routingKey,
          err: err.message,
        });
        channel.nack(msg, false, false);
        return;
      }

      try {
        await handler(payload, { routingKey });
        channel.ack(msg);
      } catch (err) {
        const permanent = err instanceof PermanentError;
        // `redelivered` distinguishes the first delivery from a retry —
        // we requeue transient failures exactly once, then drop them.
        const requeue = !permanent && !msg.fields.redelivered;
        log.error('consumer.handler.failed', {
          queue,
          routingKey,
          permanent,
          requeue,
          err: err.message,
        });
        channel.nack(msg, false, requeue);
      }
    });
    log.info('consumer.ready', { queue, bindings });
  });
};

module.exports = { registerConsumer };
