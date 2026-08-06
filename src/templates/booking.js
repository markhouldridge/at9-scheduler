'use strict';

const { layout, layoutText } = require('./layout');

// The four booking emails. Each exports a builder returning
// `{ subject, html, text }` — the shape services/brevo.js sends.
//
// Everything is formatted in **UTC**, matching the rest of At9 (see the root
// CLAUDE.md): the database stores UTC wall-clock, the app renders UTC, so the
// email must agree or a customer will be told a different time from the one
// shown in the app.

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const formatDate = (value) => (value ? DATE_FMT.format(new Date(value)) : null);
const formatTime = (value) => (value ? TIME_FMT.format(new Date(value)) : null);

// "Sat, 1 August 2026 at 19:30", or a range when the booking spans days
// (a room stay) or has a distinct finish time (a table sitting).
const formatWhen = ({ startsAt, endsAt }) => {
  if (!startsAt) return null;
  const startDate = formatDate(startsAt);
  const startTime = formatTime(startsAt);
  if (!endsAt) return `${startDate} at ${startTime}`;

  const endDate = formatDate(endsAt);
  if (endDate === startDate) {
    return `${startDate}, ${startTime} – ${formatTime(endsAt)}`;
  }
  return `${startDate} at ${startTime} → ${endDate} at ${formatTime(endsAt)}`;
};

// Human label for the thing that was booked.
const ENTITY_LABEL = {
  room: 'Room',
  table: 'Table',
  service: 'Appointment',
  class: 'Class',
  event: 'Event',
};

// The detail block shared by all four emails. Only rows with a value are
// included, so a booking type that has no end time never shows an empty field.
const buildDetails = (booking) => {
  const when = formatWhen(booking);
  return [
    booking.entityName && {
      label: ENTITY_LABEL[booking.entityType] || 'Booking',
      value: booking.entityName,
    },
    when && { label: 'When', value: when },
    booking.guests && { label: 'Guests', value: String(booking.guests) },
    booking.reference && { label: 'Reference', value: booking.reference },
  ].filter(Boolean);
};

const contactLine = (orgName, orgEmail) =>
  orgEmail
    ? `If anything looks wrong, just reply to this email — it goes straight to ${orgName}.`
    : `If anything looks wrong, please contact ${orgName}.`;

// --- Booking confirmation --------------------------------------------------
const confirmation = (booking) => {
  const org = booking.orgName || 'your provider';
  const parts = {
    preheader: `Your booking with ${org} is confirmed.`,
    statusLabel: 'Booking confirmed',
    heading: 'Your booking is confirmed',
    intro: `Hi ${booking.customerName || 'there'}, thanks for booking with ${org}. Here are the details — keep this email for reference.`,
    details: buildDetails(booking),
    note: contactLine(org, booking.orgEmail),
    orgName: org,
  };
  return {
    // The organisation name leads the subject: it is what the recipient
    // recognises in a crowded inbox, and it keeps the reference out of the
    // preview where it reads as noise.
    subject: `Booking confirmed — ${org}`,
    html: layout(parts),
    text: layoutText(parts),
  };
};

// --- Booking reminder ------------------------------------------------------
const reminder = (booking) => {
  const org = booking.orgName || 'your provider';
  const parts = {
    preheader: `A reminder about your booking with ${org} tomorrow.`,
    statusLabel: 'Reminder',
    heading: 'Your booking is tomorrow',
    intro: `Hi ${booking.customerName || 'there'}, this is a friendly reminder about your booking with ${org} tomorrow.`,
    details: buildDetails(booking),
    note: booking.orgEmail
      ? `Can no longer make it? Reply to this email and let ${org} know, so the slot can be offered to someone else.`
      : `Can no longer make it? Please let ${org} know as soon as you can, so the slot can be offered to someone else.`,
    orgName: org,
  };
  return {
    subject: `Reminder: your booking with ${org} is tomorrow`,
    html: layout(parts),
    text: layoutText(parts),
  };
};

// --- Waitlist place offered ------------------------------------------------
// The one email with a deadline in it. The deadline is the whole point — a
// place is being held, and it goes to the next person if this one lapses — so
// it appears in the preheader, the intro, the detail block and the closing
// line rather than being mentioned once.
const waitlistOffered = (booking) => {
  const org = booking.orgName || 'your provider';
  const deadline = booking.expiresAt
    ? `${formatDate(booking.expiresAt)} at ${formatTime(booking.expiresAt)}`
    : null;

  const details = buildDetails(booking);
  if (deadline) details.push({ label: 'Accept by', value: deadline });

  const parts = {
    preheader: deadline
      ? `A place has come up — accept by ${deadline} to keep it.`
      : `A place has come up with ${org}.`,
    statusLabel: 'Place available',
    heading: 'A place has come up',
    intro: `Hi ${booking.customerName || 'there'}, good news — a place has come up on your waiting list with ${org}, and it is being held for you.`,
    details,
    note: deadline
      ? `Open the At9 app to accept it. The place is held until ${deadline}; after that it is offered to the next person waiting.`
      : 'Open the At9 app to accept it before it is offered to the next person waiting.',
    orgName: org,
  };
  return {
    subject: `A place has come up — ${org}`,
    html: layout(parts),
    text: layoutText(parts),
  };
};

// --- Booking cancelled -----------------------------------------------------
const cancelled = (booking) => {
  const org = booking.orgName || 'your provider';
  const parts = {
    preheader: `Your booking with ${org} has been cancelled.`,
    statusLabel: 'Booking cancelled',
    heading: 'Your booking has been cancelled',
    intro: booking.cancelReason
      ? `Hi ${booking.customerName || 'there'}, your booking with ${org} has been cancelled. Reason given: ${booking.cancelReason}`
      : `Hi ${booking.customerName || 'there'}, your booking with ${org} has been cancelled.`,
    details: buildDetails(booking),
    note: booking.orgEmail
      ? `If this is unexpected, reply to this email and ${org} will be able to help.`
      : `If this is unexpected, please contact ${org} — they will be able to help.`,
    orgName: org,
  };
  return {
    subject: `Booking cancelled — ${org}`,
    html: layout(parts),
    text: layoutText(parts),
  };
};

// --- Booking updated -------------------------------------------------------
const updated = (booking) => {
  const org = booking.orgName || 'your provider';
  const parts = {
    preheader: `Your booking with ${org} has changed.`,
    statusLabel: 'Booking updated',
    heading: 'Your booking has been updated',
    intro: `Hi ${booking.customerName || 'there'}, your booking with ${org} has changed. The details below are the current ones — please check the date and time.`,
    details: buildDetails(booking),
    note: contactLine(org, booking.orgEmail),
    orgName: org,
  };
  return {
    subject: `Booking updated — ${org}`,
    html: layout(parts),
    text: layoutText(parts),
  };
};

const TEMPLATES = {
  'booking.created': confirmation,
  'booking.updated': updated,
  'booking.cancelled': cancelled,
  'booking.reminder': reminder,
  'waitlist.offered': waitlistOffered,
};

// Stable template names. These are what the Grafana email panel groups by, so
// they must not change casually — renaming one silently splits its history.
const TEMPLATE_NAMES = {
  'booking.created': 'booking-confirmation',
  'booking.updated': 'booking-updated',
  'booking.cancelled': 'booking-cancelled',
  'booking.reminder': 'booking-reminder',
  'waitlist.offered': 'waitlist-offered',
};

// Builds the email for an event, or null when that event has no template.
// The returned `template` is carried into the log line so a dashboard can show
// which template produced each send.
const buildBookingEmail = (event, booking) => {
  const build = TEMPLATES[event];
  if (!build) return null;
  return { ...build(booking), template: TEMPLATE_NAMES[event] };
};

module.exports = {
  buildBookingEmail,
  TEMPLATE_NAMES,
  waitlistOffered,
  confirmation,
  reminder,
  cancelled,
  updated,
  formatWhen,
};
