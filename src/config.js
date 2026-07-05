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
    // A full RABBITMQ_URL wins when set; otherwise the connection is
    // assembled from discrete parts. On the broker host the scheduler
    // reaches RabbitMQ over localhost with the same AT9_USER / AT9_PASSWORD
    // credentials the webservice uses (see webservice/src/modules/queue.js).
    // Object form avoids having to URL-encode special characters in the
    // password.
    url: process.env.RABBITMQ_URL || null,
    host: optional('RABBITMQ_HOST', 'localhost'),
    port: Number(optional('RABBITMQ_PORT', '5672')),
    vhost: optional('RABBITMQ_VHOST', '/'),
    username: process.env.AT9_USER || null,
    password: process.env.AT9_PASSWORD || null,
    exchange: optional('RABBITMQ_EXCHANGE', 'at9.events'),
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
