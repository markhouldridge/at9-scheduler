'use strict';

// **A provider's brand colour, for the emails sent on their behalf.**
//
// A provider picks a theme in the app — the `brandTheme` organisation setting.
// The value stored is the palette **id** ("ocean", "amber"), never a colour,
// because the app derives every token from a hue at render time.
//
// An email cannot derive anything at render time: it has one shot at a static
// string, in a client that may not run CSS as you expect. So it needs the
// resolved value, and it needs it without importing the app's theme engine.
//
// ## Where the colours come from
//
// `at9-brand-themes.tokens.json` at the repo root — **generated** from
// `app/src/theme/brandThemes.ts` by `npm run build:themes`, and checked by
// `npm run check:themes`. The seeds remain the only place a colour is decided;
// this reads what they resolve to.
//
// ⚠️ **The previous version of this file was twenty hex values pasted in**, and
// its own header admitted the flaw: change a seed in the app and "the colour
// here stops matching and nothing errors — the email simply goes out a slightly
// different colour from the one the provider chose". The drift guard is what
// replaced that sentence with a failing build.
//
// ## Read once, at module load
//
// The artefact is a few kilobytes of flat JSON that changes only when somebody
// edits a seed and re-runs the generator. Re-reading it per email would be file
// I/O on the path of every message the platform sends, to get an answer that
// cannot have changed since the process started.

const fs = require('fs');
const path = require('path');

// ⚠️ **The local copy first, because it is the only one that ships.**
//
// This service deploys as its **own repository** — `rsync` carries `scheduler/`
// alone onto the Queue VPS, so `at9-brand-themes.tokens.json` at the monorepo
// root is simply not there. Reading only that path meant every email in
// production would have gone out in the neutral letterhead: no error, no failed
// deploy, just no provider colours, ever.
//
// `brand-themes.tokens.json` beside this file is written by the same generator
// run and committed with the scheduler, so it travels with the code that reads
// it. The root path stays as a fallback for a monorepo checkout, and
// `AT9_BRAND_TOKENS` overrides both.
const CANDIDATES = [
  process.env.AT9_BRAND_TOKENS,
  path.join(__dirname, 'brand-themes.tokens.json'),
  path.join(__dirname, '..', '..', '..', 'at9-brand-themes.tokens.json'),
].filter(Boolean);

const TOKENS_PATH = CANDIDATES.find((p) => fs.existsSync(p)) || CANDIDATES[1];

// ⚠️ **A missing artefact must not stop the mail.** Email is the thing this
// service exists to do; a colour is a decoration on it. If the file is absent —
// a deploy that shipped `scheduler/` without the repo root, most likely — every
// email goes out in the neutral At9 letterhead and a warning is logged, rather
// than every email failing to render.
const load = () => {
  try {
    return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        level: 'warn',
        msg: 'brand_tokens.unreadable',
        path: TOKENS_PATH,
        err: error && error.message,
      }),
    );
    return null;
  }
};

const TOKENS = load();
const THEMES = (TOKENS && TOKENS.themes) || {};
const DEFAULT_THEME_ID = (TOKENS && TOKENS.$default) || 'at9';

// The colour an email is tinted with: the theme's **light-mode primary**.
//
// Light mode, always. An email has no way to know whether the reader's client
// is in dark mode, and the layout it sits in is a light letterhead — a dark
// theme's primary is chosen to sit on a near-black surface and is far too pale
// on white.
//
// ⚠️ **Null for the default theme, and that is deliberate rather than a
// fallback.** "At9 Indigo" is a real choice in the picker, and a provider who
// picked it picked it for their *app*. Painting At9's own colour onto mail sent
// in a business's name would be the platform signing its own name to somebody
// else's letter — the rule the whole email design follows is that the header
// band carries the business, never At9. A provider who has chosen nothing gets
// the same neutral letterhead, which is the honest rendering of "no colour
// chosen" and is where every organisation starts.
const brandColour = (themeId) => {
  if (!themeId || themeId === DEFAULT_THEME_ID) return null;
  const theme = THEMES[themeId];
  // An id this build has never heard of — an older or newer app wrote it, or
  // somebody edited the row. Neutral rather than a guess.
  if (!theme || !theme.light) return null;
  return theme.light.primary || null;
};

// The whole resolved palette, for anything that outgrows a single colour.
const brandPalette = (themeId, mode = 'light') => {
  const theme = THEMES[themeId] || THEMES[DEFAULT_THEME_ID];
  return (theme && theme[mode]) || null;
};

// What `layout.js` and every template actually call.
//
// ⚠️ **Returns `undefined`, not `null`** — the layout reads a falsy accent as
// "use ink, plain letterhead", and matching the exact type keeps this a drop-in
// for the hand-written version it replaced.
const providerAccent = (brandTheme) => {
  if (!brandTheme || typeof brandTheme !== 'string') return undefined;
  return brandColour(brandTheme.trim()) || undefined;
};

module.exports = {
  providerAccent,
  brandColour,
  brandPalette,
  DEFAULT_THEME_ID,
  TOKENS_PATH,
  // Test seam: how many themes were actually loaded. Zero means the artefact
  // was unreadable and every email will be neutral.
  themeCount: Object.keys(THEMES).length,
};
