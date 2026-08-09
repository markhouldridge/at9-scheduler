'use strict';

// Test-account email redirection.
//
// SOURCE OF TRUTH: ../src/services/brevo.spec.md (MAIL-1 …).
//
// The test accounts are addresses nobody owns — employee@hotel.com and
// admin@hotel.com receive nothing, and hotel.com is not ours. Mail for them is
// re-addressed at the transport so it can actually be read. The risk this
// guards is the opposite mistake: redirecting a real customer's mail into a
// developer's inbox, which would mean they never receive their booking.

// Config reads the environment at require time, so this has to come first.
process.env.DB_HOST = 'x';
process.env.DB_USER = 'x';
process.env.DB_NAME = 'x';
process.env.DB_PASSWORD = 'x';
process.env.RABBITMQ_URL = 'amqp://x';
process.env.BREVO_SMTP_USER = 'x';
process.env.BREVO_SMTP_PASSWORD = 'x';
process.env.BREVO_API_KEY = 'x';
process.env.EMAIL_FROM = 'x@y.z';
process.env.TEST_EMAIL_ACCOUNT = 'inbox@example.com';
process.env.TEST_EMAIL_ADDRESSES = 'admin@hotel.com,employee@hotel.com,customer@test.com';

const test = require('node:test');
const assert = require('node:assert/strict');

const { redirect } = require('../src/services/brevo');

const REAL = 'a.real.customer@gmail.com';

test('MAIL-1: mail for a test account is re-addressed', () => {
  const out = redirect('employee@hotel.com', 'Booking confirmed');
  assert.deepEqual(out.to, ['inbox@example.com']);
});

test('MAIL-2: the intended recipient is named in the subject', () => {
  // One inbox holds every test conversation; without this they blur together
  // and there is no way to tell which account a message was for.
  const out = redirect('employee@hotel.com', 'Booking confirmed');
  assert.equal(out.subject, '[employee@hotel.com] Booking confirmed');
});

test('MAIL-3: a real recipient is never redirected', () => {
  const out = redirect(REAL, 'Booking confirmed');
  assert.deepEqual(out.to, [REAL]);
  // And no prefix — a customer must not receive a subject line with an
  // internal test address in it.
  assert.equal(out.subject, 'Booking confirmed');
});

test('MAIL-4: a mixed message keeps the real recipient and redirects the test one', () => {
  const out = redirect(['customer@test.com', REAL], 'Welcome');

  assert.ok(out.to.includes(REAL), 'the real customer still receives it');
  assert.ok(out.to.includes('inbox@example.com'), 'the test one is redirected');
  assert.equal(out.to.length, 2);
});

test('MAIL-5: several test recipients collapse to one copy', () => {
  const out = redirect(['admin@hotel.com', 'employee@hotel.com'], 'Reminder');

  assert.deepEqual(out.to, ['inbox@example.com'], 'not the same mail twice');
  assert.equal(out.subject, '[admin@hotel.com, employee@hotel.com] Reminder');
});

test('MAIL-6: matching ignores case', () => {
  const out = redirect('Employee@Hotel.com', 'Booking confirmed');
  assert.deepEqual(out.to, ['inbox@example.com']);
});

test('MAIL-7: an empty or absent recipient does not become a redirect', () => {
  // Redirecting "nothing" would invent a recipient for a message that had
  // none, which is worse than the send failing.
  for (const to of [null, undefined, '', []]) {
    assert.deepEqual(redirect(to, 'Subject').to, []);
  }
});
