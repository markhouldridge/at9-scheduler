'use strict';

const { PermanentError } = require('../queue/errors');
const { sendEmail } = require('../services/brevo');
const { buildAccountEmail } = require('../templates/account');
const log = require('../logger');

// Consumes account lifecycle events published by the webservice
// (webservice/src/modules/queue.js) to the `bookings` exchange:
//
//   account.welcome
//
// Payload shape (see getUserForFirebaseUserId in webservice/src/routes/users.js):
//   {
//     event: 'account.welcome',
//     userId, to, name, publishedAt,
//   }
//
// Like customer events and unlike booking ones, this carries the values rather
// than IDs — a welcome needs a name and an address, and the webservice had both
// in hand at the moment it decided to send.
//
// **No `replyTo`.** Booking and customer mail replies to the business; there is
// no business here, and pointing a reply at an unmonitored platform address
// would be worse than the sender address the recipient already has.

const handle = async (payload, ctx) => {
  if (!payload || typeof payload !== 'object') {
    throw new PermanentError('payload must be a JSON object');
  }

  const event = payload.event || ctx.routingKey;
  const built = buildAccountEmail(event, payload);
  if (!built) {
    // Consumed, not retried — an event with no template will never grow one by
    // being redelivered.
    log.info('account.no_template', { event, routing_key: ctx.routingKey });
    return;
  }

  if (!payload.to) {
    throw new PermanentError(`${event} has no recipient address`);
  }

  await sendEmail({
    to: payload.to,
    subject: built.subject,
    html: built.html,
    text: built.text,
  });

  log.info('email.sent', {
    channel: 'account',
    event,
    template: built.template,
    subject: built.subject,
    recipient_domain: String(payload.to).split('@')[1] || null,
    routing_key: ctx.routingKey,
  });
};

module.exports = { handle };
