'use strict';

const amqp = require('amqplib');
const { rabbitmq } = require('../config');
const log = require('../logger');

// Reconnecting RabbitMQ client. amqplib doesn't auto-reconnect, so we
// own a small loop here: on close/error we wait (exponential back-off,
// capped at 30s) and retry. Consumers register themselves via the
// returned `onChannel` hook so a new channel after reconnect re-asserts
// their queues and bindings without any extra wiring.

const MAX_BACKOFF_MS = 30_000;

const createBus = () => {
  const channelHooks = []; // [(channel) => Promise<void>]
  let connection = null;
  let channel = null;
  let stopping = false;
  let attempt = 0;

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const connect = async () => {
    while (!stopping) {
      try {
        log.info('rabbit.connecting', { url: rabbitmq.url });
        connection = await amqp.connect(rabbitmq.url);
        connection.on('error', (err) => {
          log.warn('rabbit.connection.error', { err: err.message });
        });
        connection.on('close', () => {
          if (stopping) return;
          log.warn('rabbit.connection.closed');
          channel = null;
          // Re-enter the connect loop after the close handler returns.
          setImmediate(connect);
        });

        channel = await connection.createChannel();
        channel.on('error', (err) => {
          log.warn('rabbit.channel.error', { err: err.message });
        });

        // Topic exchange — durable so it survives broker restarts and
        // producers can publish before any consumer is up.
        await channel.assertExchange(rabbitmq.exchange, 'topic', {
          durable: true,
        });

        log.info('rabbit.connected', { exchange: rabbitmq.exchange });
        attempt = 0;

        // Replay every registered hook so consumers re-assert their
        // queues + bindings on the new channel.
        for (const hook of channelHooks) {
          await hook(channel);
        }
        return;
      } catch (err) {
        attempt += 1;
        const backoff = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt);
        log.error('rabbit.connect.failed', {
          err: err.message,
          attempt,
          retry_in_ms: backoff,
        });
        await wait(backoff);
      }
    }
  };

  return {
    start: connect,
    onChannel: (hook) => {
      channelHooks.push(hook);
      if (channel) {
        // If we're already connected, invoke the hook immediately so a
        // late registration still gets wired up.
        hook(channel).catch((err) =>
          log.error('rabbit.hook.failed', { err: err.message }),
        );
      }
    },
    stop: async () => {
      stopping = true;
      try {
        if (channel) await channel.close();
      } catch {
        // ignore — channel may already be torn down
      }
      try {
        if (connection) await connection.close();
      } catch {
        // ignore
      }
    },
  };
};

module.exports = { createBus };
