'use strict';

const nodemailer = require('nodemailer');
const { brevo, testEmail } = require('../config');
const log = require('../logger');

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

// Re-addresses mail bound for a test account.
//
// Applied here rather than in each handler because this is the only place
// email leaves the platform — a template added tomorrow gets the behaviour
// without anyone remembering it exists.
//
// Recipients are mapped individually. A message addressed to both a test
// account and a real customer keeps the real one: redirecting everything
// would silently withhold mail from a person who is expecting it, and
// redirecting nothing would send it into a domain we do not own.
//
// The intended recipient goes into the subject, so one inbox can hold several
// test conversations without them blurring into each other.
const redirect = (to, subject) => {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  const isTest = (a) => testEmail.addresses.includes(String(a).toLowerCase());
  const intended = recipients.filter(isTest);

  if (!intended.length) return { to: recipients, subject };

  const mapped = [
    ...new Set(
      recipients.map((a) => (isTest(a) ? testEmail.redirectTo : a)),
    ),
  ];
  log.info('email.redirected', {
    intended: intended.join(', '),
    to: testEmail.redirectTo,
  });
  return { to: mapped, subject: `[${intended.join(', ')}] ${subject}` };
};

const sendEmail = async ({ to, from, replyTo, subject, html, text }) => {
  const routed = redirect(to, subject);
  const info = await transporter.sendMail({
    from: from || brevo.defaultFrom,
    to: routed.to.join(', '),
    subject: routed.subject,
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

module.exports = { sendEmail, redirect };
