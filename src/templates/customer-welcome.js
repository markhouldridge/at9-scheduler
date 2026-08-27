'use strict';

const { layout, layoutText } = require('./layout');
const { providerAccent } = require('./brand-colours');

// **Welcome from a business** — to somebody a provider has just added.
//
//   Trigger    `customer.welcome`, only when the provider ticks the box
//   Recipient  the new customer
//   Template   customer-welcome
//
// ⚠️ **Not automatic, and that is the point.** The recipient did not sign up
// for anything — a provider typed them in — so it goes only when a provider
// deliberately asks for it.
//
// The header band carries the **business's** name, never At9: they were added
// by a salon, a hotel, a gym, and that is who they expect to hear from. At9 is
// named in the body because the whole purpose is to tell them the app exists.
//
// --- Welcome ---------------------------------------------------------------
// Sent when a provider adds a customer and ticks the box. Not automatic: the
// recipient did not sign up for anything, so it goes only when a provider
// deliberately asks for it.
const welcome = (customer) => {
  const org = customer.orgName || 'your provider';
  const parts = {
    // The business added them, so the business is the masthead. At9 is named
    // in the body — that is the whole purpose of the email — but never in the
    // branding.
    variant: 'provider',
    accent: providerAccent(customer.orgBrandTheme),
    preheader: `${org} has added you as a customer.`,
    statusLabel: 'Welcome',
    heading: `Welcome to ${org}`,
    intro: `Hi ${customer.customerName || 'there'}, ${org} has added you as a customer. You will get an email whenever a booking is made, changed or cancelled.`,
    // No booking to describe, so the details table is used for the one thing
    // this email is actually for.
    details: [],
    // Nothing to describe and something to do, so the details table gives way
    // to the prompt. The recipient was typed in by a provider and may never
    // have heard of At9 — "open the app" is not an instruction they can follow.
    appPrompt: {
      label: 'Manage your bookings',
      body: 'Download the At9 app, sign in with this email address, and your bookings with them will be there.',
    },
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

module.exports = { welcome };
