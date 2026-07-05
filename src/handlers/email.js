'use strict';

const { PermanentError } = require('../queue/errors');
const { sendEmail } = require('../services/brevo');
const log = require('../logger');

// Expected payload shape (one of `html` / `text` required):
//   {
//     to: 'a@b.com' | ['a@b.com', 'c@d.com'],
//     from?: 'Display <addr@dom>',
//     replyTo?: 'addr@dom',
//     subject: 'string',
//     html?: 'string',
//     text?: 'string',
//   }
//
// Validation failures throw PermanentError — the message is dropped
// rather than retried forever. Transient failures (network, SMTP 4xx/5xx
// from Brevo) propagate as ordinary errors and get one requeue.
const handle = async (payload, ctx) => {
  if (!payload || typeof payload !== 'object') {
    throw new PermanentError('payload must be a JSON object');
  }
  const { to, subject, html, text } = payload;
  if (!to || (Array.isArray(to) && to.length === 0)) {
    throw new PermanentError('`to` is required');
  }
  if (!subject || typeof subject !== 'string') {
    throw new PermanentError('`subject` is required');
  }
  if (!html && !text) {
    throw new PermanentError('one of `html` or `text` is required');
  }

  const result = await sendEmail(payload);
  log.info('email.sent', {
    id: result?.id,
    to: Array.isArray(to) ? to.length : 1,
    routing_key: ctx.routingKey,
  });
};

module.exports = { handle };
