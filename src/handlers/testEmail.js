'use strict';

const { PermanentError } = require('../queue/errors');
const { sendEmail } = require('../services/brevo');
const { buildTestEmail } = require('../templates/testEmail');
const log = require('../logger');

// ⚠️ **Named `testEmail.js`, never `test.js`.** The scheduler's test command is
// bare `node --test`, whose default discovery treats any file called `test.js`
// as a test file — so a handler with that name is executed by the runner, fails
// to find a test in itself, and reports as a failing suite. It cost one
// confusing red run; the name is the fix.
//
// Consumes test-send requests published by the webservice's sysop route
// (webservice/src/routes/sysop.js) to the `bookings` exchange:
//
//   test.email
//
// Payload shape:
//   {
//     event: 'test.email',
//     to, templates: ['booking-confirmation', …],
//     context: { customerName, orgName, orgEmail, orgTimezone },
//     requestedBy, publishedAt,
//   }
//
// The **only** consumer that sends more than one message per event, because
// one press of Send is one request for however many templates were ticked.
//
// ⚠️ **A template that fails does not stop the ones after it.** Ticking six and
// getting one error is a useful answer — "these five render and that one does
// not" — and re-queuing the whole batch to retry a single failure would send
// the other five twice. The failures are collected and reported in one line;
// only a batch where *every* send failed is thrown, so a broker-level problem
// (bad credentials, relay down) still surfaces as a retry rather than as a
// quietly consumed message.

const handle = async (payload, ctx) => {
  if (!payload || typeof payload !== 'object') {
    throw new PermanentError('payload must be a JSON object');
  }
  if (!payload.to) {
    throw new PermanentError('test.email has no recipient address');
  }

  const templates = Array.isArray(payload.templates) ? payload.templates : [];
  if (!templates.length) {
    throw new PermanentError('test.email names no templates');
  }

  const context = payload.context || {};
  const sent = [];
  // Kept apart from `failed`, because the two mean opposite things about
  // whether a retry could help — see the throws at the bottom.
  const unknown = [];
  const failed = [];

  for (const id of templates) {
    const built = buildTestEmail(id, context);
    if (!built) {
      // Skipped, not thrown. The webservice deliberately does not hold a copy
      // of the template list (see `templates/testEmail.js`), so an unknown name is
      // an app and scheduler that have drifted — worth a log line, not worth
      // discarding the templates that *are* valid.
      log.warn('test.unknown_template', { template: id });
      unknown.push(id);
      continue;
    }

    try {
      await sendEmail({
        to: payload.to,
        subject: built.subject,
        html: built.html,
        text: built.text,
      });
      sent.push(id);
    } catch (err) {
      log.error('test.send_failed', { template: id, err: err?.message });
      failed.push(id);
    }
  }

  log.info('email.sent', {
    channel: 'test',
    event: payload.event || ctx.routingKey,
    templates: sent.length,
    failed: failed.length + unknown.length,
    failed_templates:
      [...unknown, ...failed].join(',') || null,
    recipient_domain: String(payload.to).split('@')[1] || null,
    requested_by: payload.requestedBy || null,
    routing_key: ctx.routingKey,
  });

  if (sent.length) return;

  // Nothing was sent, and *why* decides whether a retry is worth anything.
  //
  // No name was recognised: redelivering the identical payload will not make
  // this build recognise them, so it is permanent and the message is dropped.
  if (!failed.length) {
    throw new PermanentError(`no known templates: ${unknown.join(', ')}`);
  }
  // Every send that was attempted threw — a transport problem rather than a
  // template one, so let it requeue once like any other handler failure.
  throw new Error(`every test template failed: ${failed.join(', ')}`);
};

module.exports = { handle };
