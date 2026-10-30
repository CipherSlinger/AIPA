/**
 * Which skin the permission bubble draws with.
 *
 * AIPA owns the setting (the `petBubbleTheme` pref); the pet only remembers the
 * last value it was handed. It has to live here rather than in the settings
 * store because the bubble window is created per request and reads the theme
 * from its own URL — there is no moment later at which it could be told.
 *
 * Defaults to `clawd`, the plain card, so a pet nobody configured looks exactly
 * like it always has.
 */
let current = "clawd";

function getBubbleTheme() {
  return current === "sao" ? "sao" : "clawd";
}

function setBubbleTheme(theme) {
  current = theme === "sao" ? "sao" : "clawd";
  return current;
}

module.exports = { getBubbleTheme, setBubbleTheme };
