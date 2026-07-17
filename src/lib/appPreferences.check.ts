import {
  parseAppPreferences,
  readingFontOptions,
} from "./appPreferences.ts";

const saved = parseAppPreferences(
  JSON.stringify({ readingFont: "mono", startInFocusMode: true }),
  null,
);
if (saved.readingFont !== "mono" || !saved.startInFocusMode) {
  throw new Error("Valid application preferences were not restored.");
}

const legacy = parseAppPreferences(null, "serif");
if (legacy.readingFont !== "serif" || legacy.startInFocusMode) {
  throw new Error("Legacy reading font was not migrated safely.");
}

const invalid = parseAppPreferences("not json", "unknown");
if (invalid.readingFont !== "sans" || invalid.startInFocusMode) {
  throw new Error("Invalid preferences did not use safe defaults.");
}

if (readingFontOptions.length !== 3) {
  throw new Error("Unexpected reading font options.");
}
