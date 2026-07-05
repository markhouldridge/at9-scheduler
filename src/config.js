'use strict';

require('dotenv').config();

// Single source of truth for runtime config. Throws on missing required
// values so the process fails fast at boot rather than first-message.
const required = (key) => {
  const value = process.env[key];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
};

const optional = (key, fallback) => process.env[key] ?? fallback;

module.exports = {
  rabbitmq: {
    // Mirrors the webservice publisher (webservice/src/modules/queue.js) so
    // the scheduler consumes from the exact exchange/queue/topics the
    // webservice publishes to. A full RABBITMQ_URL wins when set; otherwise
    // the connection is assembled from discrete parts (object form avoids
    // URL-encoding special characters in the password). On the broker host
    // the scheduler reaches RabbitMQ over localhost with the shared
    // AT9_USER / AT9_PASSWORD credentials — the deploy writes RABBITMQ_HOST=
    // localhost; the default here matches the webservice for parity.
    url: process.env.RABBITMQ_URL || null,
    host: optional('RABBITMQ_HOST', '87.106.102.51'),
    port: Number(optional('RABBITMQ_PORT', '5672')),
    vhost: optional('RABBITMQ_VHOST', '/'),
    username: process.env.AT9_USER || null,
    password: process.env.AT9_PASSWORD || null,
    // Durable topic exchange the webservice publishes booking events to.
    exchange: optional('RABBITMQ_BOOKINGS_EXCHANGE', 'bookings'),
    // Durable queue bound to `booking.#` — booking.created | booking.updated
    // | booking.cancelled all land here.
    queue: optional('RABBITMQ_BOOKINGS_QUEUE', 'booking-messages'),
    binding: 'booking.#',
  },
  db: {
    // Postgres — the scheduler reads booking/customer/organisation detail to
    // build emails (the queue events carry IDs only). Host/user/database are
    // not secret and default to the same values the webservice uses
    // (webservice/src/modules/db.js + constants); the password is required
    // and injected from the environment by the deploy.
    host: optional('DB_HOST', 'db1.at9.app'),
    port: Number(optional('DB_PORT', '5432')),
    user: optional('DB_USER', 'postgres'),
    database: optional('DB_NAME', 'at9'),
    password: required('DB_PASSWORD'),
  },
  brevo: {
    // Brevo's SMTP relay. Host/port have safe defaults; the login and
    // password are required and come from the environment (never committed).
    host: optional('BREVO_SMTP_HOST', 'smtp-relay.brevo.com'),
    port: Number(optional('BREVO_SMTP_PORT', '587')),
    user: required('BREVO_SMTP_USER'),
    password: required('BREVO_SMTP_PASSWORD'),
    defaultFrom: optional('EMAIL_FROM', 'At9 <noreply@at9.app>'),
  },
  log: {
    level: optional('LOG_LEVEL', 'info'),
  },
};
