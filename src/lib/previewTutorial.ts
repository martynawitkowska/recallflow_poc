export const PREVIEW_TUTORIAL_STORAGE_KEY =
  "recallflow.pages.tutorial.v1";

type TutorialStorage = Pick<Storage, "getItem" | "setItem">;

export function shouldShowPreviewTutorial(storage?: TutorialStorage): boolean {
  try {
    return (storage ?? window.localStorage).getItem(
      PREVIEW_TUTORIAL_STORAGE_KEY,
    ) !== "true";
  } catch {
    return true;
  }
}

export function markPreviewTutorialSeen(storage?: TutorialStorage): void {
  try {
    (storage ?? window.localStorage).setItem(
      PREVIEW_TUTORIAL_STORAGE_KEY,
      "true",
    );
  } catch {
    // The walkthrough still stays closed for the current session.
  }
}
