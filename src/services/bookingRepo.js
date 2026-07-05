'use strict';

const pool = require('../modules/db');

// Reads the customer + organisation detail needed to build a booking email.
// A booking's `user_id` is the customer (a user row with is_customer=true);
// `organisation_id` is the business. Multi-room reservations produce several
// booking rows that share one customer, so this returns a row per booking id
// and the handler assembles a single email.
const fetchBookingRecipients = async (bookingIds) => {
  const { rows } = await pool.query(
    `SELECT b.id,
            b.reference,
            b.cancel_reason,
            o.name  AS org_name,
            u.email AS customer_email,
            u.name  AS customer_name
       FROM public.bookings b
       LEFT JOIN public.organisations o ON o.id = b.organisation_id
       LEFT JOIN public.users u ON u.id = b.user_id
      WHERE b.id = ANY($1::uuid[])`,
    [bookingIds],
  );
  return rows;
};

module.exports = { fetchBookingRecipients };
