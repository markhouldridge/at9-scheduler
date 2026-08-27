'use strict';

const { PermanentError } = require('../queue/errors');
const { sendEmail } = require('../services/brevo');
const { buildEmail } = require('../templates');
const log = require('../logger');

// Consumes customer lifecycle events published by the webservice
// (webservice/src/modules/queue.js) to the `bookings` exchange:
//
//   customer.welcome
//
// Payload shape (see manageUser in webservice/src/routes/users.js):
//   {
//     event: 'customer.welcome',
//     organisationId, userId,
//     to, customerName, orgName, orgEmail, publishedAt,
//   }
//
// Unlike booking events this carries the values rather than IDs. A welcome is
// about names and an address, all of which the webservice already had in hand
// when it created the record — a second read of the same two rows would buy
// nothing but a chance to disagree with what was written.

const handle = async (payload, ctx) => {
  if (!payload || typeof payload !== 'object') {
    throw new PermanentError('payload must be a JSON object');
  }

  const event = payload.event || ctx.routingKey;
  const built = buildEmail(event, payload);
  if (!built) {
    // Consumed, not retried — an event with no template will never grow one
    // by being redelivered.
    log.info('customer.no_template', { event, routing_key: ctx.routingKey });
    return;
  }

  if (!payload.to) {
    throw new PermanentError(`${event} has no recipient address`);
  }

  await sendEmail({
    to: payload.to,
    // Replies go to the business, not into the void. The customer thinks they
    // are corresponding with the salon, and they should be right.
    ...(payload.orgEmail ? { replyTo: payload.orgEmail } : {}),
    subject: built.subject,
    html: built.html,
    text: built.text,
  });

  log.info('email.sent', {
    channel: 'customer',
    event,
    template: built.template,
    subject: built.subject,
    recipient_domain: String(payload.to).split('@')[1] || null,
    organisation: payload.orgName || null,
    routing_key: ctx.routingKey,
  });
};

module.exports = { handle };
