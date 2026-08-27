'use strict';

// **Shared by every booking-shaped email**, and by nothing else.
//
// These lived at the top of the old `booking.js`, which held the five customer
// booking emails plus the provider notice in one file. The emails are now one
// file each; this is what they all still need, so it is a module rather than a
// copy in each of them.
//
// Everything is formatted in **UTC**, matching the rest of At9 (see the root
// CLAUDE.md): the database stores UTC wall-clock, the app renders UTC, so the
// email must agree or a customer will be told a different time from the one
// shown in the app.
//
// That renders the right *number* — the stored value is the wall clock at the
// business — but a number alone does not say **whose** clock. A customer in the
// UK booking a Los Angeles salon reads "9:00 am" and has no reason to think it
// is not their own nine o'clock. So the "When" line carries the business's zone
// beside it: the one place a customer reads a booking time away from the app,
// with nothing around it to give the game away.

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

// The business's zone, as a reader would name it: "Los Angeles", "London".
//
// The IANA identifier ("America/Los_Angeles") is precise and is not what anyone
// calls the place — the region half is noise to a customer, and the underscore
// makes it look like a setting rather than a sentence. The city is what makes
// the difference land.
//
// Omitted entirely when it cannot be worked out. A missing zone is better than
// a wrong one, and the times are correct either way — this line only says which
// clock they are on.
const zoneLabel = (timezone) => {
  if (!timezone || typeof timezone !== 'string') return null;
  const city = timezone.split('/').pop();
  return city ? city.replace(/_/g, ' ') : null;
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
  const zone = zoneLabel(booking.orgTimezone);
  // Appended to the value rather than given a row of its own: it qualifies the
  // time, and a "Time zone" row of its own reads as a separate fact the
  // customer has to relate back to the one above it.
  const whenWithZone = when && zone ? `${when} (${zone} time)` : when;
  return [
    booking.entityName && {
      label: ENTITY_LABEL[booking.entityType] || 'Booking',
      value: booking.entityName,
    },
    whenWithZone && { label: 'When', value: whenWithZone },
    booking.guests && { label: 'Guests', value: String(booking.guests) },
    booking.reference && { label: 'Reference', value: booking.reference },
  ].filter(Boolean);
};

const contactLine = (orgName, orgEmail) =>
  orgEmail
    ? `If anything looks wrong, just reply to this email — it goes straight to ${orgName}.`
    : `If anything looks wrong, please contact ${orgName}.`;

module.exports = {
  DATE_FMT,
  TIME_FMT,
  formatDate,
  formatTime,
  formatWhen,
  zoneLabel,
  ENTITY_LABEL,
  buildDetails,
  contactLine,
};
