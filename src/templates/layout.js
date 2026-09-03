'use strict';

// Shared HTML shell for every transactional email.
//
// Email clients are not browsers. The rules this file follows, and why:
//
//   * Table layout, not flex/grid — Outlook (Word rendering engine) supports
//     neither. `role="presentation"` keeps screen readers from announcing the
//     layout tables as data tables.
//   * Inline styles on every element. Gmail strips <head><style> on forwarded
//     mail and several clients ignore it entirely, so nothing structural may
//     depend on the <style> block; it is used only for progressive extras
//     (dark mode, the mobile stack).
//   * No web fonts and no images, anywhere. A logo image is the single most
//     common reason a transactional email renders blank — most clients block
//     remote images by default — and there is nowhere to host one that every
//     recipient can reach. Every mark in this design is live text, so it always
//     shows, always reads, and never trips an image-heavy spam heuristic.
//   * A plain-text alternative is built for every message (see `layoutText`).
//     HTML-only mail is a well-known spam signal.
//   * 600px is the widest that survives the Outlook reading pane.
//
// Deliverability also depends on things this file cannot control — SPF, DKIM
// and DMARC on the sending domain. See the gaps note in the README.
//
// ## ⚠️ Two shells, and which one an email gets is a branding rule
//
// `variant` picks between them, and it is not a style choice:
//
//   * **`provider`** — mail sent *on behalf of a business*: confirmations,
//     updates, cancellations, reminders, waiting-list offers, and the welcome a
//     business sends a customer it added. The customer booked with a salon, a
//     hotel, a gym. **These carry no At9 colour and no At9 wordmark.** The
//     business's name is the masthead; the only mention of the platform is the
//     imprint stamp at the very bottom.
//
//     Their accent is the **business's own** brand colour — the `brandTheme`
//     org setting the provider already picked in the app, resolved to a hex by
//     `brand-colours.js` and passed in as `accent`. Absent or unrecognised, the
//     shell falls back to ink and the email reads as a plain letterhead; it
//     never falls back to At9 indigo, because that would put At9's colour on
//     mail that is not from At9.
//
//   * **`at9`** — mail At9 sends *as itself*: the account welcome, offers, and
//     the notices sent to a provider about their own business (a provider is
//     an At9 customer, and that mail is from us). Full brand: the indigo band,
//     the mint rule, the At9 wordmark.
//
// Getting this backwards is the failure worth guarding against — a customer of
// a salon receiving purple At9-branded mail about their haircut has been told
// something untrue about who is writing to them.
//
// ## Notes on the markup
//
// Kept here rather than as HTML comments, because HTML comments are shipped
// with the message (and count towards the comment-to-content ratio some filters
// score):
//
//   * The hidden <div> after <body> is the preheader — the preview line shown
//     in the inbox list. It is padded with zero-width characters so the client
//     does not pull body copy into the preview after it.
//   * No unsubscribe link **on transactional mail**: these are messages about a
//     booking the recipient made, not marketing, and there is nothing to
//     unsubscribe from. Offering one would invite somebody to opt out of the
//     confirmation for a booking they have paid for.
//
//     Marketing mail passes `unsubscribeUrl` and gets the line. That split is
//     the whole point of it being a parameter rather than a fixture: the link
//     appears exactly where the law requires it and nowhere it would do harm.
//   * The imprint stamp is on **every** email, both shells. It is the one place
//     At9 is named in provider mail, and it is deliberately small, greyed and
//     set as an imprint rather than a second footer sentence.

// At9's own palette. Authoritative source: SPECIFICATION.md › Brand & Design
// System (primary #554aca, secondary #a3f6c0).
//
// ⚠️ **Only the `at9` shell may read these.** See the note above.
const AT9 = {
  indigo: '#554aca',
  indigoDeep: '#3a2f86',
  // Unused since the masthead lost its filled band — kept because it is the
  // brand's secondary and the next thing that wants an accent should reach for
  // it rather than inventing one. See the masthead note below.
  mint: '#a3f6c0',
  ground: '#f4f3f9',
  sheet: '#ffffff',
  ink: '#1a1725',
  inkMuted: '#4a4864',
  inkFaint: '#6f6a80',
  line: '#e6e4ef',
};

// The unbranded shell. Deliberately a *neutral* grey rather than At9's neutral
// ramp, which is tinted towards the indigo — a business's letterhead should not
// sit on a faintly purple page.
const PAPER = {
  ground: '#f2f2f3',
  sheet: '#ffffff',
  ink: '#1c1a1d',
  inkMuted: '#4a4750',
  inkFaint: '#7b7883',
  line: '#e4e3e6',
  rule: '#1c1a1d',
};

// Two families, per the one rule in SPECIFICATION.md › Typography: text that
// names, titles or quantifies is the display face; text that explains or was
// typed by a person is the body face.
//
// ⚠️ Neither is Plus Jakarta Sans or Inter, and cannot be. Loading a web font
// in email means a remote request most clients refuse, so the families the app
// uses are unavailable here by construction. These stacks keep the *distinction*
// the rule is about — a tighter, squarer face for names and a system face for
// prose — using only what is already installed on the reader's machine.
const DISPLAY = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const BODY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// App store links. The only URLs in transactional mail, and only on the emails
// that ask the reader to do something (see `appPrompt`).
const APP_STORE_URL = 'https://apps.apple.com/app/id6742573363';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.at9';
const AT9_URL = 'https://www.at9.app';

// Minimal escaping — every value below comes from the database (organisation
// names, customer names, notes), so it is untrusted as far as markup goes.
const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Resolves the two shells into one flat set of the values the markup needs, so
// the markup below is written once rather than twice.
//
// `accent` is the *business's* colour and applies to the provider shell only.
// Anything unusable — absent, empty, not a hex — degrades to ink, which is the
// designed neutral state rather than a fallback that looks broken.
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const themeFor = (variant, accent) => {
  if (variant === 'at9') {
    return {
      ...AT9,
      isAt9: true,
      accent: AT9.indigo,
      radius: '14px',
      link: AT9.indigo,
      // Dark mode is a *palette*, not an inversion. At9's own dark neutrals
      // keep the indigo tint the brand carries in the app.
      dark: {
        ground: '#100e18',
        sheet: '#1a1725',
        sunken: '#221e30',
        text: '#eceaf5',
        muted: '#b3aec6',
        line: '#2f2b3f',
        rule: '#6f6a80',
      },
    };
  }
  return {
    ...PAPER,
    isAt9: false,
    // Ink is a legitimate accent, not a missing one.
    accent: HEX.test(String(accent || '')) ? String(accent) : PAPER.rule,
    // Square. The provider shell reads as a printed letterhead, and a rounded
    // card reads as a product — this one is not from a product.
    radius: '0',
    link: PAPER.ink,
    // ⚠️ **Untinted darks, deliberately.** Reusing At9's dark neutrals here
    // would put the indigo tint back into mail that is not from At9 — in the
    // one mode where a faint cast reads as a colour choice rather than as grey.
    dark: {
      ground: '#121213',
      sheet: '#1c1c1e',
      sunken: '#252527',
      text: '#ecebed',
      muted: '#b5b3b9',
      line: '#343437',
      rule: '#8a888f',
    },
  };
};

// A row in the detail block: label above, value below, separated from the row
// before it by a hairline. Two stacked cells rather than two columns —
// side-by-side label/value collapses badly at 320px, and this reads identically
// at every width.
const detailRow = (t) => ({ label, value }, index) => `
                <tr>
                  <td style="padding:${index === 0 ? '0' : '14px'} 0 14px 0;${
                    index === 0 ? '' : `border-top:1px solid ${t.line};`
                  }font-family:${DISPLAY};">
                    <div class="bk-muted" style="font-family:${DISPLAY};font-size:11px;line-height:16px;letter-spacing:0.1em;text-transform:uppercase;font-weight:700;color:${
                      t.inkFaint
                    };mso-line-height-rule:exactly;">${esc(label)}</div>
                    <div class="bk-text" style="font-family:${DISPLAY};font-size:17px;line-height:24px;color:${
                      t.ink
                    };font-weight:600;letter-spacing:-0.01em;padding-top:3px;mso-line-height-rule:exactly;">${esc(
                      value,
                    )}</div>
                  </td>
                </tr>`;

// The masthead — one letterhead, both shells.
//
// A 4px coloured top edge, the status as an eyebrow in that colour, and the
// sender's name as the largest text in the message, set on paper. The two shells
// differ only in **whose** name and **whose** colour, which is the branding rule
// this file exists to enforce and now the only thing separating them:
//
//   provider → the business's name, the business's brand colour (or ink)
//   at9      → the At9 wordmark, At9 indigo
//
// ⚠️ **The At9 shell used to be a filled indigo band with a mint rule.** It was
// replaced because the two shells then had different *shapes*, and shape is the
// thing a reader registers before they read anything: a band said "a platform is
// writing to you" loudly enough that the account emails felt like a different
// product from the booking ones. One form, two names, is the whole distinction —
// and it is the distinction the brand rule actually asks for.
const masthead = (t, { orgName, statusLabel }) => {
  // At9 signs its own mail; provider mail is signed by the business.
  const name = t.isAt9 ? 'At9' : orgName || 'Your booking';
  // The rule under the name is the sender's colour on At9 mail and ink on a
  // provider's, so the indigo appears twice and nowhere else.
  const rule = t.isAt9 ? t.accent : t.ink;
  return `<tr>
              <td style="background:${t.accent};height:4px;line-height:4px;font-size:0;border-radius:${t.radius} ${t.radius} 0 0;">&nbsp;</td>
            </tr>
            <tr>
              <td class="bk-sheet bk-pad" style="background:${t.sheet};padding:30px 32px 22px 32px;">
                <div style="font-family:${DISPLAY};font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${
                  t.accent
                };mso-line-height-rule:exactly;">${esc(statusLabel)}</div>
                <div class="bk-text" style="font-family:${DISPLAY};font-size:27px;line-height:32px;font-weight:700;letter-spacing:-0.025em;color:${
                  t.ink
                };padding-top:8px;mso-line-height-rule:exactly;">${esc(name)}${
                  t.isAt9
                    ? `<span class="bk-muted" style="font-weight:400;color:${t.inkFaint};"> Booking</span>`
                    : ''
                }</div>
              </td>
            </tr>
            <tr>
              <td class="bk-sheet bk-pad" style="background:${t.sheet};padding:0 32px;">
                <div class="${
                  t.isAt9 ? '' : 'bk-rule'
                }" style="border-top:2px solid ${rule};height:0;line-height:0;font-size:0;">&nbsp;</div>
              </td>
            </tr>`;
};

// Two bulletproof buttons — a padded cell with a background colour and an <a>
// filling it. Never an image, never a styled <button>.
//
// Only rendered where the reader has something to *do*, which in practice means
// the waiting-list offer and the two welcomes. A confirmation asks nothing, and
// a button on it would be decoration competing with the details.
const appButtons = (t) => `
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;">
                  <tr>
                    <td bgcolor="${t.accent}" style="background:${t.accent};padding:13px 22px;">
                      <a href="${APP_STORE_URL}" style="font-family:${DISPLAY};font-size:15px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;display:block;white-space:nowrap;">Download for iPhone</a>
                    </td>
                    <td width="10" style="width:10px;font-size:0;line-height:0;">&nbsp;</td>
                    <td class="bk-outline" style="border:1px solid ${t.ink};padding:12px 21px;">
                      <a href="${PLAY_STORE_URL}" class="bk-text" style="font-family:${DISPLAY};font-size:15px;line-height:20px;font-weight:600;color:${t.ink};text-decoration:none;display:block;white-space:nowrap;">Download for Android</a>
                    </td>
                  </tr>
                </table>`;

const appPromptBlock = (t, prompt) => `
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;">
                  <tr>
                    <td class="bk-sunken" style="background:${
                      t.isAt9 ? AT9.ground : '#f7f7f8'
                    };border-left:3px solid ${t.accent};padding:20px 22px;">
                      <div style="font-family:${DISPLAY};font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${
                        t.inkFaint
                      };mso-line-height-rule:exactly;">${esc(prompt.label)}</div>
                      <div class="bk-text" style="font-family:${BODY};font-size:15px;line-height:23px;color:${
                        t.ink
                      };padding-top:8px;mso-line-height-rule:exactly;">${esc(
                        prompt.body,
                      )}</div>
                      ${appButtons(t)}
                    </td>
                  </tr>
                </table>`;

// A single button pointing wherever the caller says.
//
// ⚠️ **Distinct from `appPrompt`, which is not a link to anywhere** — it is a
// pair of store buttons for a reader who has to *open the app* to act. This is
// for the case where the action is the URL itself and there is no app step:
// today, confirming an email address, where the link is a one-time code minted
// by Firebase.
//
// Rendered as a real anchor rather than a bordered stamp, because it is the
// whole purpose of the message: a reader who does not press it has not finished
// signing up. The bare URL is printed underneath — a link-stripping client, or
// a reader who does not trust a button, still has something to copy.
const ctaBlock = (t, cta) => `
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;">
                  <tr>
                    <td bgcolor="${t.accent}" style="background:${
                      t.accent
                    };padding:14px 26px;">
                      <a href="${cta.url}" style="font-family:${DISPLAY};font-size:16px;line-height:21px;font-weight:600;color:#ffffff;text-decoration:none;display:block;white-space:nowrap;">${esc(
                        cta.label,
                      )}</a>
                    </td>
                  </tr>
                </table>
                <div class="bk-text" style="font-family:${BODY};font-size:13px;line-height:20px;color:${
                  t.inkFaint
                };padding-top:14px;word-break:break-all;mso-line-height-rule:exactly;">${esc(
                  cta.fallback || '',
                )}<br /><a href="${cta.url}" style="color:${
                  t.inkFaint
                };">${esc(cta.url)}</a></div>`;

// The imprint. On **every** email, both shells, and the only mention of At9 in
// provider mail.
//
// Set as a bordered stamp rather than another footer sentence: a line of prose
// at the bottom reads as one more thing the sender is telling you, and this is
// not the sender talking — it is the platform signing the page. Small, greyed,
// and in the provider shell carrying no At9 colour at all.
const stamp = (t) => `
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;">
                  <tr>
                    <td class="bk-stamp" style="border:1px solid ${
                      t.line
                    };padding:7px 11px;">
                      <a href="${AT9_URL}" style="font-family:${DISPLAY};font-size:10px;line-height:14px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${
                        t.inkFaint
                      };text-decoration:none;white-space:nowrap;mso-line-height-rule:exactly;">Provided by At9 Booking</a>
                    </td>
                  </tr>
                </table>`;

const layout = ({
  variant = 'provider',
  // The business's own brand colour, provider shell only. See themeFor.
  accent,
  preheader,
  statusLabel,
  heading,
  intro,
  details = [],
  note,
  // { label, body } — renders the app-store prompt. Omit on emails that ask
  // nothing of the reader.
  appPrompt,
  // { label, url, fallback } — one button to a given URL, plus the bare link
  // beneath it. For an action that *is* a link, rather than one that needs the
  // app. See `ctaBlock`.
  cta,
  footerNote,
  orgName,
  // Marketing only — see the note at the top of this file. Absent on every
  // transactional message, and that is deliberate rather than an omission.
  unsubscribeUrl,
}) => {
  const t = themeFor(variant, accent);
  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>${esc(heading)}</title>
    <style>
      /* Progressive only — nothing structural depends on this block. */
      @media (max-width: 620px) {
        .bk-wrap { width: 100% !important; }
        .bk-pad { padding-left: 20px !important; padding-right: 20px !important; }
      }
      @media (prefers-color-scheme: dark) {
        .bk-body { background: ${t.dark.ground} !important; }
        .bk-sheet { background: ${t.dark.sheet} !important; }
        .bk-sunken { background: ${t.dark.sunken} !important; }
        .bk-text { color: ${t.dark.text} !important; }
        .bk-muted { color: ${t.dark.muted} !important; }
        .bk-line { border-color: ${t.dark.line} !important; }
        .bk-rule { border-color: ${t.dark.rule} !important; }
        .bk-stamp { border-color: ${t.dark.line} !important; }
        .bk-outline { border-color: ${t.dark.text} !important; }
      }
    </style>
  </head>
  <body class="bk-body" style="margin:0;padding:0;background:${t.ground};">
    <div style="display:none;font-size:1px;color:${
      t.ground
    };line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(
      preheader,
    )}&#8203;${'&#847;&zwnj;&nbsp;'.repeat(60)}</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${
      t.ground
    };">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" class="bk-wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

            ${masthead(t, { orgName, statusLabel })}

            <tr>
              <td class="bk-sheet bk-pad" style="background:${
                t.sheet
              };padding:26px 32px 32px 32px;">
                <h1 class="bk-text" style="margin:0;font-family:${DISPLAY};font-size:23px;line-height:30px;font-weight:700;color:${
                  t.ink
                };letter-spacing:-0.02em;mso-line-height-rule:exactly;">${esc(
                  heading,
                )}</h1>
                <p class="bk-muted" style="margin:12px 0 0 0;font-family:${BODY};font-size:16px;line-height:25px;color:${
                  t.inkMuted
                };mso-line-height-rule:exactly;">${esc(intro)}</p>

                ${
                  details.length
                    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bk-line" style="border:1px solid ${
                        t.line
                      };margin-top:26px;${
                        t.isAt9 ? 'border-radius:12px;' : ''
                      }">
                  <tr>
                    <td style="padding:22px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${details
                        .map(detailRow(t))
                        .join('')}
                      </table>
                    </td>
                  </tr>
                </table>`
                    : ''
                }

                ${cta ? ctaBlock(t, cta) : ''}
                ${appPrompt ? appPromptBlock(t, appPrompt) : ''}

                ${
                  note
                    ? `<p class="bk-muted" style="margin:26px 0 0 0;font-family:${BODY};font-size:15px;line-height:23px;color:${
                        t.inkMuted
                      };mso-line-height-rule:exactly;">${esc(note)}</p>`
                    : ''
                }
              </td>
            </tr>

            <tr>
              <td class="bk-sheet bk-pad" style="background:${
                t.sheet
              };border-radius:0 0 ${t.radius} ${
                t.radius
              };padding:0 32px 30px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td class="bk-line" style="border-top:1px solid ${
                      t.line
                    };padding-top:20px;font-family:${BODY};font-size:13px;line-height:20px;color:${
                      t.inkFaint
                    };mso-line-height-rule:exactly;">
                      ${esc(
                        footerNote ||
                          `This email was sent by ${orgName || 'your provider'} about your booking.`,
                      )}${
                        unsubscribeUrl
                          ? // A plain link, in the footer, at the same size as
                            // the text around it. Not hidden in 9px grey: a
                            // deliberately hard-to-find unsubscribe is the
                            // thing regulators look for, and somebody who
                            // cannot find it presses "spam" instead — which
                            // costs the sending domain far more than the
                            // unsubscribe would have.
                            //
                            // `esc` on the URL because it is interpolated into
                            // an attribute; it is ours rather than user input,
                            // but a URL is exactly the value that stops being
                            // ours the day it carries a parameter somebody
                            // else supplied.
                            `<br /><br />Don't want these? <a href="${esc(
                              unsubscribeUrl,
                            )}" style="color:${t.link};">Unsubscribe</a>.`
                          : ''
                      }
                      ${stamp(t)}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

// Plain-text counterpart. Built from the same pieces so the two versions can
// never drift, and kept genuinely readable rather than a stripped-tag dump —
// some recipients (and every spam filter) read this one.
//
// It is laid out rather than listed: the sender's name at the top under a rule,
// the details as an aligned key/value block, and the same imprint at the foot.
// The HTML half was redesigned and this one was too, because a message that
// looks considered in one half and thrown together in the other is a message
// whose plain-text part nobody maintains.
const layoutText = ({
  variant = 'provider',
  heading,
  intro,
  details = [],
  note,
  appPrompt,
  cta,
  footerNote,
  orgName,
  unsubscribeUrl,
}) => {
  const sender = variant === 'at9' ? 'AT9 BOOKING' : (orgName || '').toUpperCase();
  // Labels padded to a common width so the values line up in a monospaced
  // reader without a table the format does not have.
  const width = details.reduce((n, d) => Math.max(n, d.label.length), 0);
  const pad = (label) => `${label}:`.padEnd(width + 2, ' ');

  return [
    ...(sender ? [sender, '='.repeat(Math.max(sender.length, 12)), ''] : []),
    heading,
    '',
    intro,
    ...(details.length
      ? ['', ...details.map((d) => `${pad(d.label)}${d.value}`)]
      : []),
    // Before `appPrompt`, matching the HTML order — and in plain text the URL
    // *is* the button, so it must not sit below a pair of store links the
    // reader has no use for yet.
    ...(cta
      ? ['', cta.label.toUpperCase(), ...(cta.fallback ? [cta.fallback] : []), cta.url]
      : []),
    ...(appPrompt
      ? [
          '',
          appPrompt.label.toUpperCase(),
          appPrompt.body,
          `  iPhone:  ${APP_STORE_URL}`,
          `  Android: ${PLAY_STORE_URL}`,
        ]
      : []),
    ...(note ? ['', note] : []),
    '',
    '—'.repeat(28),
    footerNote ||
      `This email was sent by ${orgName || 'your provider'} about your booking.`,
    // ⚠️ **The plain-text part gets it too.** Some clients render only this,
    // and an unsubscribe that exists in one half of a multipart message is an
    // unsubscribe those readers cannot use.
    ...(unsubscribeUrl
      ? ['', `Don't want these? Unsubscribe: ${unsubscribeUrl}`]
      : []),
    '',
    `Provided by At9 Booking · ${AT9_URL}`,
  ].join('\n');
};

module.exports = {
  layout,
  layoutText,
  AT9,
  PAPER,
  esc,
  APP_STORE_URL,
  PLAY_STORE_URL,
  AT9_URL,
};
