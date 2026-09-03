'use strict';

const { PermanentError } = require('../queue/errors');
const { fetchBookingRecipients, fetchWaitlistOffer } = require('../services/bookingRepo');
const { sendEmail } = require('../services/brevo');
const { buildEmail, providerNotice } = require('../templates');
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
// The event carries IDs only, so the customer address and the booking detail
// are read from Postgres (services/bookingRepo) and rendered by
// templates/ before going out through Brevo.

// Every lifecycle event now has a template. Anything else is consumed and
// logged rather than retried.
const EMAILABLE = new Set([
  'booking.created',
  'booking.updated',
  'booking.cancelled',
]);

// **Which updates the business is told about.**
//
// A provider editing a booking in the app does not need an email about the
// change they just made, and sending one is the fastest way to teach somebody
// to filter these out. Anyone *else* changing it is the opposite: a customer
// moving their class booking to another Tuesday silently moves a place the
// business had set aside, and until now nothing said so.
//
// So the rule is the actor, not the event. `source` is set by the webservice at
// every publish site (`source: isMember ? 'provider' : 'self'` where a customer
// can reach the route at all).
//
// ⚠️ **Absent `source` is treated as provider-made**, which is the quiet
// option: an older webservice that has not been deployed yet publishes updates
// with no `source` at all, and the wrong guess in that direction sends nothing
// rather than emailing a business about every edit it makes itself. The
// webservice may be deployed before or after this — neither order misbehaves.
const PROVIDER_NOTIFIABLE_UPDATE_SOURCES = new Set(['self', 'public', 'customer']);

const shouldNotifyProvider = (event, payload) => {
  if (event === 'booking.created' || event === 'booking.cancelled') return true;
  if (event !== 'booking.updated') return false;
  return PROVIDER_NOTIFIABLE_UPDATE_SOURCES.has(payload?.source);
};

// A waitlist offer is not a booking, so it is looked up from its own table and
// emailed with the deadline the customer has to accept by.
const handleWaitlistOffer = async (payload, ctx) => {
  const entryId = payload?.entryId;
  if (!entryId) throw new PermanentError('waitlist event has no entryId');

  const offer = await fetchWaitlistOffer(entryId);
  if (!offer) throw new PermanentError(`waitlist entry not found: ${entryId}`);
  if (!offer.customer_email) {
    throw new PermanentError('waitlist entry has no customer email address');
  }

  const built = buildEmail('waitlist.offered', {
    orgName: offer.org_name,
    orgTimezone: offer.org_timezone,
    orgEmail: offer.org_email,
    // Their colour, for mail sent in their name. See templates/layout.js.
    orgBrandTheme: offer.org_brand_theme,
    customerName: offer.customer_name,
    entityType: offer.kind,
    entityName: offer.entity_name,
    startsAt: offer.starts_at,
    expiresAt: offer.expires_at,
  });

  await sendEmail({
    to: offer.customer_email,
    ...(offer.org_email ? { replyTo: offer.org_email } : {}),
    subject: built.subject,
    html: built.html,
    text: built.text,
  });

  log.info('email.sent', {
    channel: 'waitlist',
    event: 'waitlist.offered',
    template: built.template,
    subject: built.subject,
    recipient_domain: String(offer.customer_email).split('@')[1] || null,
    organisation: offer.org_name || null,
    entity_type: offer.kind,
    routing_key: ctx.routingKey,
  });
};

const handle = async (payload, ctx) => {
  if (!payload || typeof payload !== 'object') {
    throw new PermanentError('payload must be a JSON object');
  }
  const { event } = payload;

  if (event === 'waitlist.offered') {
    return handleWaitlistOffer(payload, ctx);
  }

  if (!EMAILABLE.has(event)) {
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

  // A multi-room reservation is several booking rows for one customer. The
  // first row carries the shared detail; the references are collected so the
  // customer gets one email listing every reference rather than one email per
  // room.
  const [first] = rows;
  const refs = rows.map((r) => r.reference).filter(Boolean);

  const built = buildEmail(event, {
    orgName: first.org_name,
    // Which clock the times below are on. See the note in templates/booking.js:
    // the numbers were always the business's wall clock, but nothing said so.
    orgTimezone: first.org_timezone,
    orgEmail: first.org_email,
    orgBrandTheme: first.org_brand_theme,
    customerName: first.customer_name,
    entityType: first.entity_type,
    entityName:
      rows.length > 1
        ? rows.map((r) => r.entity_name).filter(Boolean).join(', ')
        : first.entity_name,
    startsAt: first.starts_at,
    endsAt: first.ends_at,
    guests: first.guests,
    reference: refs.join(', ') || null,
    cancelReason: first.cancel_reason,
  });

  if (!built) {
    throw new PermanentError(`no template for event: ${event}`);
  }

  await sendEmail({
    to: recipient,
    // Replies reach the business rather than the noreply sender.
    ...(first.org_email ? { replyTo: first.org_email } : {}),
    subject: built.subject,
    html: built.html,
    text: built.text,
  });

  // ⚠️ The business's own copy, after the customer's and never instead of it.
  //
  // New bookings and cancellations always; an update only when somebody other
  // than the business made it — see `shouldNotifyProvider`.
  //
  // Sent only when `organisations.email` is set, which is now the *only* thing
  // `org_email` can be — the admin fallback is gone, so there is one address
  // and no chance of notifying somebody who never asked to be.
  //
  // Failing here must not fail the job. The customer's email has already gone,
  // and a throw would requeue the whole thing and send it to them twice — a
  // duplicate confirmation is a worse outcome than a missed internal copy.
  const notifyTo = first.org_email;
  if (notifyTo && shouldNotifyProvider(event, payload)) {
    try {
      const notice = providerNotice(event, {
        orgName: first.org_name,
        orgTimezone: first.org_timezone,
        customerName: first.customer_name,
        entityType: first.entity_type,
        entityName:
          rows.length > 1
            ? rows.map((r) => r.entity_name).filter(Boolean).join(', ')
            : first.entity_name,
        startsAt: first.starts_at,
        endsAt: first.ends_at,
        guests: first.guests,
        reference: refs.join(', ') || null,
        cancelReason: first.cancel_reason,
      });

      // Belt and braces: `shouldNotifyProvider` only passes the three events
      // that have a shape, so this cannot be null today. It is here so that
      // adding a fourth event to one of the two lists and not the other is a
      // silent no-send rather than a thrown TypeError.
      if (!notice) throw new Error(`no provider notice for event: ${event}`);

      await sendEmail({
        to: notifyTo,
        subject: notice.subject,
        html: notice.html,
        text: notice.text,
      });

      log.info('email.sent', {
        channel: 'booking',
        event,
        template: notice.template,
        subject: notice.subject,
        recipient_domain: String(notifyTo).split('@')[1] || null,
        organisation: first.org_name || null,
        audience: 'provider',
        bookings: rows.length,
        routing_key: ctx.routingKey,
      });
    } catch (err) {
      log.error('email.provider_notice_failed', {
        event,
        organisation: first.org_name || null,
        error: err?.message,
        routing_key: ctx.routingKey,
      });
    }
  }

  // One line per email, carrying enough to answer "did it send, which
  // template, to whom, about what" without exposing the address itself.
  log.info('email.sent', {
    channel: 'booking',
    event,
    template: built.template,
    subject: built.subject,
    recipient_domain: String(recipient).split('@')[1] || null,
    organisation: first.org_name || null,
    entity_type: first.entity_type || null,
    bookings: rows.length,
    routing_key: ctx.routingKey,
  });
};

module.exports = { handle };
