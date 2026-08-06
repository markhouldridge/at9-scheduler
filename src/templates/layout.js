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
//   * No web fonts and no images. A logo image is the single most common
//     reason a transactional email renders blank — most clients block remote
//     images by default. The business name is live text instead, so it always
//     shows, always reads, and never trips an image-heavy spam heuristic.
//   * A plain-text alternative is built for every message (see text() in each
//     template). HTML-only mail is a well-known spam signal.
//   * 600px is the widest that survives the Outlook reading pane.
//
// Deliverability also depends on things this file cannot control — SPF, DKIM
// and DMARC on the sending domain. See the gaps note in the README.
//
// Notes on the markup, kept here rather than as HTML comments because HTML
// comments are shipped with the message (and count towards the comment-to-
// content ratio some filters score):
//
//   * The header band carries the **business name**, never the platform. A
//     customer booked with a salon, not with At9; At9 appears only in the
//     sender address.
//   * The hidden <div> after <body> is the preheader — the preview line shown
//     in the inbox list. It is padded with zero-width characters so the client
//     does not pull body copy into the preview after it.
//   * No unsubscribe link: these are transactional messages about a booking
//     the recipient made, not marketing.

const BRAND = {
  primary: '#554aca',
  primaryDark: '#3a2f86',
  mint: '#a3f6c0',
  ink: '#1a1825',
  inkMuted: '#4a4864',
  inkFaint: '#6f6a80',
  line: '#e6e4ef',
  ground: '#f4f3f9',
  surface: '#ffffff',
};

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Minimal escaping — every value below comes from the database (organisation
// names, customer names, notes), so it is untrusted as far as markup goes.
const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// A row in the detail block: label above, value below. Two stacked cells
// rather than two columns — side-by-side label/value collapses badly at
// 320px, and this reads identically at every width.
const detailRow = ({ label, value }) => `
              <tr>
                <td style="padding:0 0 14px 0;font-family:${FONT};">
                  <div style="font-size:12px;line-height:16px;letter-spacing:0.04em;text-transform:uppercase;color:${BRAND.inkFaint};">${esc(
                    label,
                  )}</div>
                  <div style="font-size:16px;line-height:24px;color:${BRAND.ink};font-weight:600;">${esc(
                    value,
                  )}</div>
                </td>
              </tr>`;

// `statusColour` tints the header band so the four emails are distinguishable
// at a glance without relying on colour alone — the heading always says what
// happened in words too.
const layout = ({
  preheader,
  statusLabel,
  heading,
  intro,
  details = [],
  note,
  footerNote,
  orgName,
}) => `<!doctype html>
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
        .bk-body { background: #100e18 !important; }
        .bk-card { background: #1a1725 !important; }
        .bk-text { color: #eceaf5 !important; }
        .bk-muted { color: #b3aec6 !important; }
        .bk-line { border-color: #2f2b3f !important; }
      }
    </style>
  </head>
  <body class="bk-body" style="margin:0;padding:0;background:${BRAND.ground};">
    <div style="display:none;font-size:1px;color:${BRAND.ground};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(
      preheader,
    )}&#8203;${'&#847;&zwnj;&nbsp;'.repeat(60)}</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.ground};">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" class="bk-wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

            <tr>
              <td class="bk-pad" style="background:${BRAND.primary};border-radius:14px 14px 0 0;padding:22px 32px;font-family:${FONT};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="font-family:${FONT};font-size:20px;line-height:24px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">${esc(
                      orgName || 'Your booking',
                    )}</td>
                    <td align="right" style="font-family:${FONT};font-size:12px;line-height:18px;color:#ffffff;opacity:0.85;">${esc(
                      statusLabel,
                    )}</td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="bk-card bk-pad" style="background:${BRAND.surface};padding:32px;font-family:${FONT};">
                <h1 class="bk-text" style="margin:0 0 12px 0;font-family:${FONT};font-size:24px;line-height:30px;font-weight:700;color:${BRAND.ink};letter-spacing:-0.01em;">${esc(
                  heading,
                )}</h1>
                <p class="bk-muted" style="margin:0 0 24px 0;font-family:${FONT};font-size:16px;line-height:24px;color:${BRAND.inkMuted};">${esc(
                  intro,
                )}</p>

                ${
                  details.length
                    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bk-line" style="border:1px solid ${BRAND.line};border-radius:12px;">
                  <tr>
                    <td style="padding:20px 20px 6px 20px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${details
                        .map(detailRow)
                        .join('')}
                      </table>
                    </td>
                  </tr>
                </table>`
                    : ''
                }

                ${
                  note
                    ? `<p class="bk-muted" style="margin:24px 0 0 0;font-family:${FONT};font-size:15px;line-height:23px;color:${BRAND.inkMuted};">${esc(
                        note,
                      )}</p>`
                    : ''
                }
              </td>
            </tr>

            <tr>
              <td class="bk-pad" style="background:${BRAND.surface};border-radius:0 0 14px 14px;padding:0 32px 28px 32px;font-family:${FONT};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td class="bk-line" style="border-top:1px solid ${BRAND.line};padding-top:20px;font-family:${FONT};font-size:13px;line-height:20px;color:${BRAND.inkFaint};">
                      ${esc(
                        footerNote ||
                          `This email was sent by ${orgName || 'your provider'} about your booking.`,
                      )}
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

// Plain-text counterpart. Built from the same pieces so the two versions can
// never drift, and kept genuinely readable rather than a stripped-tag dump —
// some recipients (and every spam filter) read this one.
const layoutText = ({ heading, intro, details = [], note, footerNote, orgName }) =>
  [
    heading,
    '',
    intro,
    ...(details.length
      ? ['', ...details.map(({ label, value }) => `${label}: ${value}`)]
      : []),
    ...(note ? ['', note] : []),
    '',
    '---',
    footerNote ||
      `This email was sent by ${orgName || 'your provider'} about your booking.`,
  ].join('\n');

module.exports = { layout, layoutText, BRAND, esc };
