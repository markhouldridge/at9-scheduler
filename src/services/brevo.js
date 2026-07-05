'use strict';

const nodemailer = require('nodemailer');
const { brevo } = require('../config');

// Thin wrapper around Brevo's SMTP relay (via nodemailer). Centralised so
// handlers don't touch the transport directly — easier to mock in tests and
// to swap ESPs later without touching handler code.
//
// Port 587 uses STARTTLS, so `secure: false` (nodemailer upgrades the plain
// connection to TLS after EHLO). A single long-lived transport is reused for
// every message — nodemailer pools connections internally.
const transporter = nodemailer.createTransport({
  host: brevo.host,
  port: brevo.port,
  secure: false,
  auth: {
    user: brevo.user,
    pass: brevo.password,
  },
});

const sendEmail = async ({ to, from, replyTo, subject, html, text }) => {
  const info = await transporter.sendMail({
    from: from || brevo.defaultFrom,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
    ...(replyTo ? { replyTo } : {}),
  });
  // sendMail resolves once the relay accepts the message. Recipients the
  // relay refused outright come back on `info.rejected` — surface them so
  // the consumer log records the real reason.
  if (info.rejected && info.rejected.length) {
    throw new Error(`Brevo rejected recipient(s): ${info.rejected.join(', ')}`);
  }
  return { id: info.messageId };
};

module.exports = { sendEmail };
