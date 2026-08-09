# brevo — Specification

Source of truth for the behaviour of [`brevo.js`](./brevo.js). The tests in
[`brevo.redirect.test.js`](../../tests/brevo.redirect.test.js) reference the behaviour IDs below
(`MAIL-1` …). Update this file first when behaviour changes.

## Purpose

The one place email leaves the platform.

Every message — booking confirmations, reminders, waitlist offers, the customer
welcome — goes through `sendEmail`. That makes it the right place for anything
that must be true of *all* mail, regardless of which template produced it.

## Behaviours

### MAIL-1 — Mail for a test account is re-addressed

GIVEN a message addressed to an account in `TEST_EMAIL_ADDRESSES`
WHEN it is sent
THEN it goes to `TEST_EMAIL_ACCOUNT` instead

The test accounts are addresses nobody owns — `employee@hotel.com` receives
nothing, and `hotel.com` is not ours. Without this, testing anything that
sends email means either not seeing the result or inventing a real mailbox per
account.

Applied here rather than in each handler because this is the only exit: a
template added tomorrow gets the behaviour without anyone remembering it
exists.

### MAIL-2 — The intended recipient is named in the subject

GIVEN a redirected message
WHEN it arrives
THEN its subject is prefixed with the address it was meant for

One inbox holds every test conversation. Without the prefix there is no way to
tell whether a confirmation was for the admin, the employee or the customer.

### MAIL-3 — A real recipient is never redirected

GIVEN a message to an address that is not a test account
WHEN it is sent
THEN it goes to that address, with its subject untouched

This is the failure that matters. Redirecting real mail means a customer never
receives their booking confirmation and nobody finds out. A real customer must
also never see an internal test address in a subject line.

### MAIL-4 — A mixed message is split, not decided

GIVEN a message addressed to both a test account and a real one
WHEN it is sent
THEN the real recipient keeps it and the test one is redirected

Redirecting everything would withhold mail from someone expecting it;
redirecting nothing would send it into a domain we do not own. Neither is a
safe default, so recipients are mapped one at a time.

### MAIL-5 — Several test recipients collapse to one copy

GIVEN a message to two or more test accounts
WHEN it is redirected
THEN the target address appears once, and every intended recipient is named in
the subject

### MAIL-6 — Matching ignores case

GIVEN an address that differs only in case from a configured test account
WHEN it is checked
THEN it is treated as a test account

Addresses arrive from Firebase, from typed input and from the database, and
they do not agree on case. The same mismatch already caused a registration to
create a duplicate person (see `routes/auth.js`).

### MAIL-7 — An absent recipient does not become a redirect

GIVEN a message with no recipient
WHEN it is checked
THEN nothing is redirected and no recipient is invented

A send that fails for want of an address is a visible problem. A message
quietly delivered to a developer's inbox instead is not.

## Out of scope

- **Who is a test account.** That is `TEST_EMAIL_ADDRESSES`, mirroring
  `webservice/src/helpers/testUsers.js` and `TEST_USERS` in
  `app/src/constants/index.ts`. Three copies is one too many — see below.
- **Firebase's own mail** (email verification, password reset). Firebase sends
  those directly; they never reach this function and cannot be redirected here.
- Transport, retries and what Brevo does with a message once accepted.

## Open questions

- The test-account list exists in three places, one per service, because
  nothing is shared between them. They are kept in step by hand, which will
  fail eventually. The least-bad fix is probably for the webservice to mark a
  queued message as bound for a test account, so the scheduler does not need
  its own copy — but that only covers queued mail.
- Redirection is on whenever the addresses are configured. In production those
  accounts still exist, so a genuine sign-in as `admin@hotel.com` would have
  its mail redirected too. That is the intent today; if a test account ever
  becomes a real one, the list is what has to change.
