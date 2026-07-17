export const readingFontOptions = [
  { value: "sans", label: "Sans" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Monospace" },
] as const;

export type ReadingFont = (typeof readingFontOptions)[number]["value"];

export type AppPreferences = {
  readingFont: ReadingFont;
  startInFocusMode: boolean;
};

export function createDefaultAppPreferences(): AppPreferences {
  return { readingFont: "sans", startInFocusMode: false };
}

export function isReadingFont(value: unknown): value is ReadingFont {
  return readingFontOptions.some((option) => option.value === value);
}

export function parseAppPreferences(
  savedPreferences: string | null,
  legacyReadingFont: string | null,
): AppPreferences {
  let saved: Record<string, unknown> = {};

  try {
    const parsed = JSON.parse(savedPreferences ?? "null") as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      saved = parsed as Record<string, unknown>;
    }
  } catch {
    // Invalid local data falls back to safe defaults.
  }

  return {
    readingFont: isReadingFont(saved.readingFont)
      ? saved.readingFont
      : isReadingFont(legacyReadingFont)
        ? legacyReadingFont
        : "sans",
    startInFocusMode: saved.startInFocusMode === true,
  };
}
