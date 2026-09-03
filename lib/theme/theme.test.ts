import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_THEME,
  THEME_BOOTSTRAP_SCRIPT,
  THEME_COOKIE,
  normalizeTheme,
  readThemeCookie,
  themeCookie,
} from "./theme";

test("an unset or unrecognized preference falls back to the default theme", () => {
  assert.equal(normalizeTheme(undefined), DEFAULT_THEME);
  assert.equal(normalizeTheme(""), DEFAULT_THEME);
  assert.equal(normalizeTheme("system"), DEFAULT_THEME);
  assert.equal(normalizeTheme("DARK"), DEFAULT_THEME);
  assert.equal(normalizeTheme({ theme: "dark" }), DEFAULT_THEME);
});

test("the cookie round-trips through the server-side reader", () => {
  for (const theme of ["light", "dark"] as const) {
    assert.equal(readThemeCookie(themeCookie(theme)), theme);
  }
});

test("the reader ignores a different cookie whose name ends in the theme key", () => {
  assert.equal(readThemeCookie(`not-${THEME_COOKIE}=dark`), DEFAULT_THEME);
  assert.equal(
    readThemeCookie(`not-${THEME_COOKIE}=dark; ${THEME_COOKIE}=dark`),
    "dark",
  );
});

// The bootstrap script parses document.cookie with its own inlined regex. If the
// cookie format and that regex ever drift apart, dark mode silently stops
// applying before paint, so pin them together here.
test("the pre-paint bootstrap script reads the cookie the toggle writes", () => {
  const pattern = /document\.cookie\.match\((\/.+?\/)\)/.exec(
    THEME_BOOTSTRAP_SCRIPT,
  );
  assert.ok(pattern, "bootstrap script no longer matches on document.cookie");

  const source = pattern[1].slice(1, -1);
  const regex = new RegExp(source);

  for (const theme of ["light", "dark"] as const) {
    // document.cookie exposes pairs without their attributes.
    const jar = `session=abc; ${themeCookie(theme).split(";")[0]}`;
    assert.equal(regex.exec(jar)?.[1], theme);
  }
  assert.equal(regex.exec("session=abc"), null);
});

test("the bootstrap script sets the attribute the stylesheet keys off", () => {
  assert.match(THEME_BOOTSTRAP_SCRIPT, /setAttribute\("data-theme",/);
  assert.match(THEME_BOOTSTRAP_SCRIPT, /try\{/);
});
