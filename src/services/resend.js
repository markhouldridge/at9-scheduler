'use strict';

const { Resend } = require('resend');
const { resend } = require('../config');

// Thin wrapper around the Resend SDK. Centralised so handlers don't
// import the SDK directly — easier to mock in tests and to swap for a
// different ESP later without touching handler code.
const client = new Resend(resend.apiKey);

const sendEmail = async ({ to, from, replyTo, subject, html, text }) => {
  const res = await client.emails.send({
    from: from || resend.defaultFrom,
    to: Array.isArray(to) ? to : [to],
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
  });
  if (res.error) {
    // Surface the Resend message verbatim so the consumer log records
    // the real reason (invalid recipient, suppressed address, etc.).
    throw new Error(`Resend rejected: ${res.error.message ?? 'unknown'}`);
  }
  return res.data;
};

module.exports = { sendEmail };
