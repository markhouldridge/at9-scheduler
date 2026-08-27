'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const path = require('node:path');

const {
  providerAccent,
  brandColour,
  brandPalette,
  DEFAULT_THEME_ID,
  themeCount,
} = require('../src/templates/brand-colours');

// **That the brand tokens actually shipped, and resolve.**
//
// This service deploys as its own repository: `rsync` carries `scheduler/`
// alone onto the Queue VPS. `at9-brand-themes.tokens.json` lives at the monorepo
// root, so reading only that path meant the artefact was simply absent in
// production — and `brand-colours.js` is written to degrade rather than crash,
// so every email would have gone out in the neutral letterhead with nothing but
// a log line to say so. No error, no failed deploy, no provider colours ever.
//
// BC-1 is the guard against exactly that, and it asserts the **path** rather
// than the loaded theme count — see the note on it. It is the one failure here
// that is otherwise entirely silent, which is why it is asserted first.

test('BC-1: the tokens artefact shipped with this service', () => {
  // ⚠️ **Asserted against the path, not against `themeCount`.**
  //
  // The first version of this test checked only that *some* themes had loaded,
  // and passed with the local file deleted — because `brand-colours.js` falls
  // back to the monorepo root, which exists on a developer's machine and never
  // on the VPS. It was green for precisely the arrangement it was written to
  // catch, which is worse than having no test.
  const shipped = path.join(
    __dirname,
    '..',
    'src',
    'templates',
    'brand-themes.tokens.json',
  );
  assert.ok(
    fs.existsSync(shipped),
    'brand-themes.tokens.json is missing from scheduler/src/templates. This ' +
      'service deploys on its own, so the repo-root copy is not there — run ' +
      '`npm run build:themes` in /app and commit the result, or every email ' +
      'goes out unbranded with only a log line to say so.',
  );
  assert.ok(themeCount > 0, 'the artefact is present but loaded no themes');
});

test('BC-2: a provider theme resolves to a hex colour', () => {
  const accent = providerAccent('ocean');
  assert.match(accent, /^#[0-9a-f]{6}$/i);
});

test('BC-3: the default theme is deliberately no colour at all', () => {
  // "At9 Indigo" is a real choice, and a provider who picked it picked it for
  // their *app*. Painting At9's colour onto mail sent in a business's name
  // would be the platform signing its name to somebody else's letter.
  assert.equal(providerAccent(DEFAULT_THEME_ID), undefined);
  assert.equal(brandColour(DEFAULT_THEME_ID), null);
});

test('BC-4: nothing chosen, and nothing recognised, both go neutral', () => {
  // An id from an older or newer build, or a hand-edited row. Neutral rather
  // than a guess — and never a fallback to At9's own colour.
  for (const value of [undefined, null, '', 'not-a-theme', 42, {}]) {
    assert.equal(providerAccent(value), undefined, `for ${String(value)}`);
  }
});

test('BC-5: whitespace around a stored id is tolerated', () => {
  assert.equal(providerAccent('  ocean  '), providerAccent('ocean'));
});

test('BC-6: the palette is the light mode one', () => {
  // An email cannot know whether the reader's client is in dark mode, and it
  // sits on a light letterhead; a dark theme's primary is chosen against a
  // near-black surface and is far too pale on white.
  const light = brandPalette('ocean', 'light');
  assert.equal(providerAccent('ocean'), light.primary);
  assert.notEqual(brandPalette('ocean', 'dark').primary, light.primary);
});
