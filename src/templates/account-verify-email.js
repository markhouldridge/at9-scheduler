'use strict';

const { layout, layoutText } = require('./layout');

// **Confirm your email address** — the first thing a new account ever receives.
//
//   Trigger    `account.verify_email`
//   Recipient  the person who has just registered
//   Template   account-verify-email
//
// ⚠️ **This replaces Firebase's own verification email.** The client used to
// call `sendEmailVerification()`, which sent an unbranded Firebase default from
// a `firebaseapp.com` address — the first thing every new user saw, and the one
// piece of the product that looked like somebody else's. The webservice now
// mints the same link with `generateEmailVerificationLink()` (Admin SDK, which
// returns the link and sends nothing) and publishes it here.
//
// ⚠️ **The link is a one-time code and is the whole message.** If the button
// does not survive a mail client, nothing else in here gets the reader in —
// which is why `cta` prints the bare URL underneath, and why the wording never
// says "click the button above" in a way that stops making sense without it.
//
// **At9-branded, like `account-welcome`.** There is no business involved yet:
// somebody signed up to the platform and is confirming a platform address. The
// two are deliberately a pair — this one lets you in, that one greets you once
// you are.
//
// **No `replyTo`,** matching the rest of the account channel: there is no
// business to reply to, and pointing a reply at an unmonitored platform address
// is worse than the sender address the reader already has.
const verifyEmail = (account) => {
  const name = account.name || 'there';
  const parts = {
    variant: 'at9',
    preheader: 'Confirm your email address to finish setting up At9.',
    statusLabel: 'Confirm your email',
    heading: 'Confirm your email address',
    intro: `Hi ${name}, thanks for signing up to At9. Confirm this is your address and your account is ready to use.`,
    // No `details`. The reader is being asked to do exactly one thing, and a
    // table of facts beside the button would compete with it.
    details: [],
    cta: {
      label: 'Confirm my email address',
      url: account.verifyUrl,
      fallback: 'If the button does not work, copy this link into your browser:',
    },
    // Said plainly rather than as a warning. Somebody who did not sign up needs
    // to know they can ignore this, and nothing here obliges them to act.
    note: 'If you did not create an At9 account, you can ignore this email and nothing further will happen.',
    footerNote:
      'You are receiving this because an At9 account was created with this email address. At9 is the booking system small businesses use to manage rooms, tables, classes, events and appointments.',
    orgName: 'At9',
  };
  return {
    subject: 'Confirm your email address',
    html: layout(parts),
    text: layoutText(parts),
  };
};

module.exports = { verifyEmail };
