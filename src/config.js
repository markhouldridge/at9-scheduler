'use strict';

require('dotenv').config();

// Single source of truth for runtime config. Throws on missing required
// values so the process fails fast at boot rather than first-message.
const required = (key) => {
  const value = process.env[key];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
};

const optional = (key, fallback) => process.env[key] ?? fallback;

module.exports = {
  rabbitmq: {
    // Mirrors the webservice publisher (webservice/src/modules/queue.js) so
    // the scheduler consumes from the exact exchange/queue/topics the
    // webservice publishes to. A full RABBITMQ_URL wins when set; otherwise
    // the connection is assembled from discrete parts (object form avoids
    // URL-encoding special characters in the password). On the broker host
    // the scheduler reaches RabbitMQ over localhost with the shared
    // AT9_USER / AT9_PASSWORD credentials — the deploy writes RABBITMQ_HOST=
    // localhost; the default here matches the webservice for parity.
    url: process.env.RABBITMQ_URL || null,
    host: optional('RABBITMQ_HOST', '87.106.102.51'),
    port: Number(optional('RABBITMQ_PORT', '5672')),
    vhost: optional('RABBITMQ_VHOST', '/'),
    username: process.env.AT9_USER || null,
    password: process.env.AT9_PASSWORD || null,
    // Durable topic exchange the webservice publishes booking events to.
    exchange: optional('RABBITMQ_BOOKINGS_EXCHANGE', 'bookings'),
    // Durable queue bound to `booking.#` — booking.created | booking.updated
    // | booking.cancelled all land here.
    queue: optional('RABBITMQ_BOOKINGS_QUEUE', 'booking-messages'),
    // Booking lifecycle AND waitlist offers land in the same queue — one
    // handler, one place emails are sent from.
    bindings: ['booking.#', 'waitlist.#'],
    binding: 'booking.#',
    // Customer lifecycle (customer.welcome) gets its **own** queue rather than
    // another binding on the booking one. A welcome that fails must not sit at
    // the head of the line in front of a booking confirmation, and the two are
    // rendered by different handlers from different payload shapes.
    customerQueue: optional('RABBITMQ_CUSTOMERS_QUEUE', 'customer-messages'),
    customerBindings: ['customer.#'],
    // Account lifecycle (account.welcome) — a person's relationship with At9
    // rather than with a business, which is why it is not another binding on
    // the customer queue: the payload shape, the handler and the sender
    // identity are all different, and the two must not queue behind each other.
    accountQueue: optional('RABBITMQ_ACCOUNTS_QUEUE', 'account-messages'),
    accountBindings: ['account.#'],
    // Sysop test sends (test.email) — one request, one email per template
    // ticked. Its own queue because it is the one stream that can be asked for
    // nine messages at once, and a sysop looking at samples must never be the
    // reason a customer's booking confirmation is late.
    testQueue: optional('RABBITMQ_TEST_QUEUE', 'test-messages'),
    testBindings: ['test.#'],
    // **Generic transactional email**, for anything that is already a rendered
    // message rather than an event to be rendered.
    //
    // The two queues above carry *events* — "a booking was created" — and their
    // handlers fetch what they need and build the email. This one carries the
    // email itself: subject, html, recipients. That is the difference, and it
    // is why it earns its own queue rather than another binding.
    //
    // Its own queue for the same reason customer mail has one: a stuck or
    // retrying message here must never sit at the head of the line in front of
    // a booking confirmation, which is the email a business cannot afford to
    // lose.
    emailQueue: optional('RABBITMQ_EMAIL_QUEUE', 'email-messages'),
    emailBindings: ['email.#'],
  },
  db: {
    // Postgres — the scheduler reads booking/customer/organisation detail to
    // build emails (the queue events carry IDs only). Host/user/database are
    // not secret and default to the same values the webservice uses
    // (webservice/src/modules/db.js + constants); the password is required
    // and injected from the environment by the deploy.
    host: optional('DB_HOST', 'db1.at9.app'),
    port: Number(optional('DB_PORT', '5432')),
    user: optional('DB_USER', 'postgres'),
    database: optional('DB_NAME', 'at9'),
    password: required('DB_PASSWORD'),
  },
  // Test-account email redirection.
  //
  // The test accounts are addresses nobody owns — employee@hotel.com receives
  // nothing, and hotel.com is not ours. Mail for them is re-addressed here so
  // it can actually be read, with the intended recipient kept in the subject
  // so one inbox can hold several test conversations without them blurring.
  //
  // Mirrors webservice/src/helpers/testUsers.js and the TEST_USERS list in
  // app/src/constants/index.ts. Overridable by env so the addresses can change
  // without a deploy of three services.
  testEmail: {
    redirectTo: optional('TEST_EMAIL_ACCOUNT', 'markhouldridge@gmail.com'),
    addresses: optional(
      'TEST_EMAIL_ADDRESSES',
      [
        'admin@hotel.com',
        'employee@hotel.com',
        'supervisor@hotel.com',
        'user@hotel.com',
        'free@test.com',
        'pro@test.com',
        'customer@test.com',
        'amy.smith@test.com',
        'john.smith@test.com',
        'onboarding@test.com',
      ].join(','),
    )
      .split(',')
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean),
  },

  brevo: {
    // Brevo's SMTP relay. Host/port have safe defaults; the login and
    // password are required and come from the environment (never committed).
    host: optional('BREVO_SMTP_HOST', 'smtp-relay.brevo.com'),
    port: Number(optional('BREVO_SMTP_PORT', '587')),
    user: required('BREVO_SMTP_USER'),
    password: required('BREVO_SMTP_PASSWORD'),
    defaultFrom: optional('EMAIL_FROM', 'At9 <noreply@at9.app>'),
  },
  log: {
    level: optional('LOG_LEVEL', 'info'),
  },
};
