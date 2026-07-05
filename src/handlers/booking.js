'use strict';

const { PermanentError } = require('../queue/errors');
const { fetchBookingRecipients } = require('../services/bookingRepo');
const { sendEmail } = require('../services/brevo');
const log = require('../logger');

// Consumes booking lifecycle events published by the webservice
// (webservice/src/modules/queue.js) to the `bookings` exchange:
//
//   booking.created | booking.updated | booking.cancelled
//
// Payload shape (metadata only — see the *Meta objects in
// webservice/src/routes/*.js):
//   {
//     event: 'booking.created',
//     source: 'provider' | 'public' | 'self',
//     organisationId, entityType, entityIds, bookingIds,
//     reservationGroupId?, customerId?, publishedAt,
//   }
//
// The event carries IDs only, so we read the customer email + booking
// reference from Postgres (services/bookingRepo) and send via Brevo.
//
// NOTE: email copy below is a first pass — confirmation on create,
// cancellation on cancel, to the customer. `booking.updated` is logged and
// skipped for now. Templates / provider notifications are not wired yet.

// Event types that currently trigger a customer email.
const EMAILABLE = new Set(['booking.created', 'booking.cancelled']);

// Build the { subject, text } for an event.
const buildEmail = (event, { orgName, customerName, refs, cancelReason }) => {
  const business = orgName || 'your provider';
  const greeting = `Hi ${customerName || 'there'},`;
  const reference = refs.length > 1 ? `References: ${refs.join(', ')}` : `Reference: ${refs[0]}`;

  if (event === 'booking.created') {
    return {
      subject: `Booking confirmed — ${business}`,
      text: `${greeting}\n\nYour booking with ${business} is confirmed.\n${reference}\n\nThank you.`,
    };
  }
  if (event === 'booking.cancelled') {
    return {
      subject: `Booking cancelled — ${business}`,
      text:
        `${greeting}\n\nYour booking with ${business} has been cancelled.` +
        (cancelReason ? `\nReason: ${cancelReason}` : '') +
        `\n${reference}\n\nIf this is unexpected, please contact ${business}.`,
    };
  }
  return null;
};

const handle = async (payload, ctx) => {
  if (!payload || typeof payload !== 'object') {
    throw new PermanentError('payload must be a JSON object');
  }
  const { event } = payload;

  if (!EMAILABLE.has(event)) {
    // booking.updated / anything else — no email yet. Consume and move on.
    log.info('booking.event.skipped', { event, routing_key: ctx.routingKey });
    return;
  }

  // The webservice publishes the id as `bookingIds` (array) on multi-booking
  // paths but `bookingId` (singular) on most single-booking paths (public,
  // appointments, classes, single-room). Accept either.
  const ids = Array.isArray(payload.bookingIds)
    ? payload.bookingIds
    : payload.bookingId
      ? [payload.bookingId]
      : [];

  if (ids.length === 0) {
    // Emailable event with no bookings to look up — can never succeed.
    throw new PermanentError('no bookingId(s) on payload to send a booking email');
  }

  const rows = await fetchBookingRecipients(ids);
  if (rows.length === 0) {
    throw new PermanentError(`no bookings found for ids: ${ids.join(', ')}`);
  }

  const recipient = rows.find((r) => r.customer_email)?.customer_email;
  if (!recipient) {
    // No address on file — dropping is correct; retrying won't help.
    throw new PermanentError('booking has no customer email address');
  }

  const refs = rows.map((r) => r.reference).filter(Boolean);
  const built = buildEmail(event, {
    orgName: rows[0].org_name,
    customerName: rows[0].customer_name,
    refs: refs.length ? refs : ['(no reference)'],
    cancelReason: rows[0].cancel_reason,
  });

  await sendEmail({ to: recipient, subject: built.subject, text: built.text });
  log.info('booking.email.sent', {
    event,
    routing_key: ctx.routingKey,
    bookings: rows.length,
  });
};

module.exports = { handle };
