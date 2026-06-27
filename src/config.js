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
    url: optional('RABBITMQ_URL', 'amqp://localhost:5672'),
    exchange: optional('RABBITMQ_EXCHANGE', 'at9.events'),
  },
  resend: {
    apiKey: required('RESEND_API_KEY'),
    defaultFrom: optional('EMAIL_FROM', 'At9 <noreply@at9.app>'),
  },
  log: {
    level: optional('LOG_LEVEL', 'info'),
  },
};
