'use strict';

const {
  fetchBookingsDueReminder,
  markRemindersSent,
} = require('../services/bookingRepo');
const { sendEmail } = require('../services/brevo');
const { buildEmail } = require('../templates');
const log = require('../logger');

// Booking reminders — the one email that isn't triggered by an event.
//
// Nothing publishes "this booking is tomorrow", so the scheduler polls for it.
// A tick every hour looks for bookings starting 20–28 hours out that have not
// been reminded, which means:
//
//   * a booking is reminded roughly a day ahead, whatever hour it starts;
//   * the window is wider than the interval, so a tick that is late, or a
//     process that restarted, still catches everything it missed;
//   * `bookings.reminder_sent_at` is what guarantees one send, not the timing.
//
// The paid gate lives in the SQL (`booking_reminders`, a Pro capability, must
// be among the capabilities of an active subscription), so an organisation
// that lapses stops getting reminders the moment its subscription expires.

const TICK_MS = 60 * 60 * 1000; // hourly

const runOnce = async () => {
  const rows = await fetchBookingsDueReminder();
  if (!rows.length) return { considered: 0, sent: 0, failed: 0 };

  // Claim the whole batch before sending. If the process dies mid-batch the
  // claimed rows are simply never reminded — far better than a customer
  // getting the same reminder on every tick until it succeeds.
  await markRemindersSent(rows.map((r) => r.id));

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const built = buildEmail('booking.reminder', {
      orgName: row.org_name,
      orgEmail: row.org_email,
      customerName: row.customer_name,
      entityType: row.entity_type,
      entityName: row.entity_name,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      guests: row.guests,
      reference: row.reference,
    });

    try {
      await sendEmail({
        to: row.customer_email,
        ...(row.org_email ? { replyTo: row.org_email } : {}),
        subject: built.subject,
        html: built.html,
        text: built.text,
      });
      sent += 1;
      log.info('email.sent', {
        channel: 'booking',
        event: 'booking.reminder',
        template: built.template,
        subject: built.subject,
        recipient_domain: String(row.customer_email).split('@')[1] || null,
        organisation: row.org_name || null,
        entity_type: row.entity_type || null,
        booking_id: row.id,
      });
    } catch (err) {
      // One bad address must not stop the rest of the batch.
      failed += 1;
      log.warn('email.failed', {
        channel: 'booking',
        event: 'booking.reminder',
        template: built.template,
        booking_id: row.id,
        error: err?.message,
      });
    }
  }

  log.info('booking.reminders.run', { considered: rows.length, sent, failed });
  return { considered: rows.length, sent, failed };
};

// Starts the hourly tick and returns a stop function for shutdown.
const start = () => {
  let running = false;

  const tick = async () => {
    // Skip rather than overlap — a slow run must not stack up behind itself.
    if (running) return;
    running = true;
    try {
      await runOnce();
    } catch (err) {
      log.error('booking.reminders.tick_failed', { error: err?.message });
    } finally {
      running = false;
    }
  };

  // First run shortly after boot so a deploy doesn't leave a gap of an hour.
  const kickoff = setTimeout(tick, 30 * 1000);
  const timer = setInterval(tick, TICK_MS);
  log.info('reminders.started', { interval_ms: TICK_MS });

  return () => {
    clearTimeout(kickoff);
    clearInterval(timer);
  };
};

module.exports = { start, runOnce, TICK_MS };
