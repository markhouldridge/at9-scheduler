'use strict';

const { layout, layoutText } = require('./layout');

// Customer emails — messages about the person's relationship with a business,
// rather than about one booking.
//
// They use the same shell as the booking mail (see templates/layout.js), which
// means the same rule applies: the header band carries the **business name**,
// never At9. The customer was added by a salon, a hotel, a gym — that is who
// they expect to hear from, and a message branded by a platform they have never
// used reads as spam.
//
// At9 is mentioned in the body, because the point of this email is to tell them
// the app exists. That is a different thing from pretending the email is from
// At9.

// --- Welcome ---------------------------------------------------------------
// Sent when a provider adds a customer and ticks the box. Not automatic: the
// recipient did not sign up for anything, so it goes only when a provider
// deliberately asks for it.
const welcome = (customer) => {
  const org = customer.orgName || 'your provider';
  const parts = {
    preheader: `${org} has added you as a customer.`,
    statusLabel: 'Welcome',
    heading: `Welcome to ${org}`,
    intro: `Hi ${customer.customerName || 'there'}, ${org} has added you as a customer. You will get an email whenever a booking is made, changed or cancelled.`,
    // No booking to describe, so the details table is used for the one thing
    // this email is actually for.
    details: [
      {
        label: 'Manage your bookings',
        value:
          'Download the At9 app, sign in with this email address, and your bookings will be there.',
      },
    ],
    note: customer.orgEmail
      ? `Any questions, reply to this email or contact ${org} at ${customer.orgEmail}.`
      : `Any questions, contact ${org} directly.`,
    footerNote: `This email was sent by ${org}, who added you as a customer. At9 is the booking system they use.`,
    orgName: org,
  };
  return {
    // The business leads the subject line — it is what the recipient
    // recognises in a crowded inbox.
    subject: `Welcome to ${org}`,
    html: layout(parts),
    text: layoutText(parts),
  };
};

const TEMPLATES = {
  'customer.welcome': welcome,
};

// Stable template names — the Grafana email panel groups by these, so renaming
// one silently splits its history.
const TEMPLATE_NAMES = {
  'customer.welcome': 'customer-welcome',
};

// Builds the email for an event, or null when that event has no template.
const buildCustomerEmail = (event, customer) => {
  const build = TEMPLATES[event];
  if (!build) return null;
  return { ...build(customer), template: TEMPLATE_NAMES[event] };
};

module.exports = { buildCustomerEmail, TEMPLATE_NAMES, welcome };
