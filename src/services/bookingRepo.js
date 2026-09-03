'use strict';

const pool = require('../modules/db');

// A booking's "when" and "what" live in one of five sub-tables, one per
// bookable type, each shaped differently:
//
//   booking_room    start_date / end_date   (timestamptz)
//   booking_table   start_date / end_date   (timestamptz)
//   booking_service date + time             (separate date and time columns)
//   booking_class   occurrence_date         (+ the class's own start/end time)
//   booking_event   booking_date            (+ the event's own start/end time)
//
// This CTE flattens all five into one shape — (entity_type, entity_name,
// starts_at, ends_at, guests) — so the email templates never have to know
// which kind of booking they are describing.
//
// Zone-less `date`/`time` columns hold UTC wall-clock by convention (root
// CLAUDE.md), so they are composed and stamped `AT TIME ZONE 'UTC'` rather
// than left for node-postgres to reinterpret in the server's local zone.
const BOOKING_DETAIL_CTE = `
  WITH detail AS (
    SELECT br.booking_id,
           'room'::text  AS entity_type,
           r.name        AS entity_name,
           br.start_date AS starts_at,
           br.end_date   AS ends_at,
           br.occupancy  AS guests
      FROM public.booking_room br
      LEFT JOIN public.rooms r ON r.id = br.room_id
    UNION ALL
    SELECT bt.booking_id, 'table', t.name, bt.start_date, bt.end_date, bt.guests
      FROM public.booking_table bt
      LEFT JOIN public.tables t ON t.id = bt.table_id
    UNION ALL
    SELECT bs.booking_id, 'service', s.title,
           (bs.date + bs."time") AT TIME ZONE 'UTC',
           NULL::timestamptz, NULL::integer
      FROM public.booking_service bs
      LEFT JOIN public.services s ON s.id = bs.service_id
    UNION ALL
    SELECT bc.booking_id, 'class', c.title,
           (bc.occurrence_date + c.start_time) AT TIME ZONE 'UTC',
           CASE WHEN c.end_time IS NULL THEN NULL
                ELSE (bc.occurrence_date + c.end_time) AT TIME ZONE 'UTC' END,
           NULL::integer
      FROM public.booking_class bc
      LEFT JOIN public.classes c ON c.id = bc.class_id
    UNION ALL
    SELECT be.booking_id, 'event', e.title,
           (COALESCE(be.booking_date, e.start_date) + e.start_time) AT TIME ZONE 'UTC',
           CASE WHEN e.end_time IS NULL THEN NULL
                ELSE (COALESCE(be.booking_date, e.start_date) + e.end_time) AT TIME ZONE 'UTC' END,
           NULL::integer
      FROM public.booking_event be
      LEFT JOIN public.events e ON e.id = be.event_id
  )`;

// `organisations` holds no contact address, so the business's reply address is
// its administrator's. It is used as the message's Reply-To only — never
// printed in the body, so a customer can always reach a human without the
// address being exposed to whatever scrapes the email later.
// ⚠️ The organisation's own address, and **nothing else**.
//
// This used to fall back to the first administrator's personal address when the
// organisation had not set one. That was wrong in two ways: it put a named
// individual in front of every customer as the reply-to, and it changed
// silently when that person left or another admin turned out to have been
// created first. Nobody chose to be that address; they were simply first.
//
// So there is no fallback. `organisations.email` or nothing — and nothing is a
// legitimate state, meaning the business has not asked to be contacted or
// notified. Customer mail then goes out with no reply-to, and the templates
// already say "contact the business" rather than "reply to this" when it is
// absent (`contactLine`).
//
// One address, set in Settings, Organisation. It is the only place a business
// email comes from.
const ORG_EMAIL_LATERAL = `
      LEFT JOIN LATERAL (
        SELECT NULLIF(TRIM(org_for_email.email), '') AS email
          FROM public.organisations org_for_email
         WHERE org_for_email.id = b.organisation_id
      ) org_admin ON true
      LEFT JOIN LATERAL (
        SELECT NULLIF(TRIM(os.value), '') AS brand_theme
          FROM public.organisation_settings os
         WHERE os.organisation_id = b.organisation_id
           AND os.key = 'brandTheme'
         LIMIT 1
      ) org_settings ON true`;

const EMAIL_COLUMNS = `
    b.id,
    b.reference,
    b.cancel_reason,
    b.is_active,
    b.organisation_id,
    o.name           AS org_name,
    -- The zone the times in this email are in. A booking is the wall clock at
    -- the business, so a customer in another country reading "9:00 am" has no
    -- way to know whose nine o'clock it is unless the email says.
    o.timezone       AS org_timezone,
    -- The organisation's own address, or null. Used for both the reply-to on
    -- customer mail and the notification sent to the business, because they are
    -- now the same address by definition.
    -- (No backticks in here: this is inside a JS template literal.)
    org_admin.email AS org_email,
    u.email          AS customer_email,
    u.name           AS customer_name,
    d.entity_type,
    d.entity_name,
    d.starts_at,
    d.ends_at,
    d.guests,
    -- The organisation's brand theme, used to tint the emails sent **on their
    -- behalf** (see the two-shell note in templates/layout.js). A palette id,
    -- not a colour — templates/brand-colours.js resolves it.
    --
    -- Null is a legitimate value and the commonest one: a provider who has not
    -- chosen gets the neutral letterhead rather than a colour we invented.
    org_settings.brand_theme AS org_brand_theme`;

// Reads the customer + organisation + booking detail needed to build an email.
// Multi-room reservations produce several booking rows sharing one customer,
// so this returns a row per booking id and the handler assembles one email.
const fetchBookingRecipients = async (bookingIds) => {
  const { rows } = await pool.query(
    `${BOOKING_DETAIL_CTE}
     SELECT ${EMAIL_COLUMNS}
       FROM public.bookings b
       LEFT JOIN public.organisations o ON o.id = b.organisation_id
       LEFT JOIN public.users u ON u.id = b.user_id
       LEFT JOIN detail d ON d.booking_id = b.id
       ${ORG_EMAIL_LATERAL}
      WHERE b.id = ANY($1::uuid[])`,
    [bookingIds],
  );
  return rows;
};

// Bookings starting inside the reminder window that have not been reminded
// yet, restricted to organisations whose active subscriptions carry the
// `booking_reminders` capability — a Pro capability (Team carries it as a
// superset), enforced here in the sender rather than trusted from a client.
//
// The window is a range rather than a "tomorrow" equality so a scheduler that
// was briefly down still catches bookings when it returns; `reminder_sent_at`
// is what stops a second send.
const fetchBookingsDueReminder = async ({
  fromHours = 20,
  toHours = 28,
  limit = 500,
} = {}) => {
  const { rows } = await pool.query(
    `${BOOKING_DETAIL_CTE}
     SELECT ${EMAIL_COLUMNS}
       FROM public.bookings b
       JOIN public.organisations o ON o.id = b.organisation_id
       JOIN public.users u ON u.id = b.user_id
       JOIN detail d ON d.booking_id = b.id
       ${ORG_EMAIL_LATERAL}
      WHERE b.is_active
        AND b.reminder_sent_at IS NULL
        AND u.email IS NOT NULL
        -- The reminder window, measured on the **business's** clock.
        --
        -- (Still no backticks in here, per the note above — one would end the
        -- JS template literal this SQL lives in.)
        --
        -- starts_at carries the wall clock at the business written into a
        -- UTC-labelled instant: 10:00 means ten in the morning where the
        -- business is, stored as 10:00Z. Comparing that against a real NOW()
        -- compares a wall clock against an instant, so the window slides by the
        -- organisation's UTC offset — an hour for a UK business in summer,
        -- eight for one in Los Angeles.
        --
        -- This is the one that reaches a customer. A "your booking is tomorrow"
        -- email sent eight hours out is how someone arrives on the wrong day,
        -- so both sides are put on the organisation's clock: the stored wall
        -- clock on the left, today's wall clock on the right.
        AND (d.starts_at AT TIME ZONE 'UTC')
              BETWEEN (NOW() AT TIME ZONE o.timezone) + ($1 || ' hours')::interval
                  AND (NOW() AT TIME ZONE o.timezone) + ($2 || ' hours')::interval
        -- The same question orgHasCapability asks in
        -- webservice/src/helpers/capabilities.js, in SQL because the reminder
        -- sweep never goes through that service.
        --
        -- ⚠️ It tests the **capability**, never a plan name -- which is why the
        -- test below names 'booking_reminders' and nothing else. There are two
        -- paid tiers (Pro and Team, SPECIFICATION.md > Subscriptions), Team is
        -- sold as a superset of Pro, and reminders are a Pro capability. A
        -- comment here once said "Team only" and another said Team was the only
        -- paid plan; both were wrong and neither could be seen from the SQL,
        -- which had been right all along.
        --
        -- (No backticks in here: this SQL lives in a JS template literal, and
        -- one would end the string.)
        --
        -- There used to be a second branch here for the 90-day trial, which
        -- granted every paid feature. The trial went when Solo became Free:
        -- taking bookings costs nothing, so an active subscription carrying the
        -- capability is the whole test.
        AND EXISTS (
              SELECT 1
                FROM public.organisation_subscriptions os
                JOIN public.subscriptions s ON s.id = os.subscription_id
               WHERE os.organisation_id = b.organisation_id
                 AND os.expires_at > NOW()
                 AND 'booking_reminders' = ANY (s.capabilities)
            )
      ORDER BY d.starts_at
      LIMIT $3`,
    [String(fromHours), String(toHours), limit],
  );
  return rows;
};

// Stamped *before* the send, so a crash mid-send cannot produce a second
// reminder on the next tick. A reminder that silently fails to send is a much
// smaller problem than one that arrives twice.
const markRemindersSent = async (bookingIds) => {
  if (!bookingIds.length) return 0;
  const { rowCount } = await pool.query(
    `UPDATE public.bookings
        SET reminder_sent_at = NOW()
      WHERE id = ANY($1::uuid[])
        AND reminder_sent_at IS NULL`,
    [bookingIds],
  );
  return rowCount;
};

// One offered waitlist place, with everything the offer email needs. Classes
// and events keep separate tables, so this unions them into the shape the
// template expects.
const fetchWaitlistOffer = async (entryId) => {
  const { rows } = await pool.query(
    `SELECT 'class'::text AS kind, w.id, w.expires_at,
            c.title AS entity_name,
            (w.occurrence_date + c.start_time) AT TIME ZONE 'UTC' AS starts_at,
            o.name AS org_name, o.timezone AS org_timezone,
            u.email AS customer_email, u.name AS customer_name,
            org_admin.email AS org_email,
            org_settings.brand_theme AS org_brand_theme
       FROM class_waitlist w
       JOIN classes c ON c.id = w.class_id
       LEFT JOIN organisations o ON o.id = c.organisation_id
       LEFT JOIN users u ON u.id = w.user_id
       LEFT JOIN LATERAL (
         SELECT au.email FROM organisation_users ou
           JOIN users au ON au.id = ou.user_id
          WHERE ou.organisation_id = c.organisation_id AND ou.is_admin
            AND au.email IS NOT NULL
          ORDER BY au.created LIMIT 1
       ) org_admin ON true
       LEFT JOIN LATERAL (
         SELECT NULLIF(TRIM(os.value), '') AS brand_theme
           FROM public.organisation_settings os
          WHERE os.organisation_id = c.organisation_id
            AND os.key = 'brandTheme'
          LIMIT 1
       ) org_settings ON true
      WHERE w.id = $1
      UNION ALL
     -- WARNING: column count and order must match the class branch above.
     --
     -- This branch was missing o.timezone, so the two sides had ten columns and
     -- nine. Postgres refuses that at PLAN time -- "each UNION query must have
     -- the same number of columns" -- so fetchWaitlistOffer never returned, for
     -- events or classes, and no waitlist offer email had ever been sent. A
     -- customer was given a place with a deadline ticking on it and never told.
     --
     -- It hid because the only caller throws on any error and the queue retries
     -- once and drops; nothing distinguishes a malformed query from a bad
     -- minute on the broker.
     --
     -- (No backticks in this comment: the SQL sits inside a JS template
     -- literal, and one would end the string.)
     SELECT 'event'::text, w.id, w.expires_at,
            e.title,
            (COALESCE(w.booking_date, e.start_date) + e.start_time) AT TIME ZONE 'UTC',
            o.name, o.timezone, u.email, u.name, org_admin.email,
            org_settings.brand_theme
       FROM event_waitlist w
       JOIN events e ON e.id = w.event_id
       LEFT JOIN organisations o ON o.id = e.organisation_id
       LEFT JOIN users u ON u.id = w.user_id
       LEFT JOIN LATERAL (
         SELECT au.email FROM organisation_users ou
           JOIN users au ON au.id = ou.user_id
          WHERE ou.organisation_id = e.organisation_id AND ou.is_admin
            AND au.email IS NOT NULL
          ORDER BY au.created LIMIT 1
       ) org_admin ON true
       LEFT JOIN LATERAL (
         SELECT NULLIF(TRIM(os.value), '') AS brand_theme
           FROM public.organisation_settings os
          WHERE os.organisation_id = e.organisation_id
            AND os.key = 'brandTheme'
          LIMIT 1
       ) org_settings ON true
      WHERE w.id = $1`,
    [entryId],
  );
  return rows[0] ?? null;
};

module.exports = {
  fetchBookingRecipients,
  fetchWaitlistOffer,
  fetchBookingsDueReminder,
  markRemindersSent,
};
