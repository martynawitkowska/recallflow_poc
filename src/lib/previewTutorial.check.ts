import {
  markPreviewTutorialSeen,
  PREVIEW_TUTORIAL_STORAGE_KEY,
  shouldShowPreviewTutorial,
} from "./previewTutorial.ts";

type TutorialStorage = Pick<Storage, "getItem" | "setItem">;

class MemoryStorage implements TutorialStorage {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const storage = new MemoryStorage();
expect(
  shouldShowPreviewTutorial(storage),
  "A first-time preview visit should show the walkthrough.",
);
markPreviewTutorialSeen(storage);
expect(
  storage.getItem(PREVIEW_TUTORIAL_STORAGE_KEY) === "true",
  "Completing the walkthrough should persist its seen state.",
);
expect(
  !shouldShowPreviewTutorial(storage),
  "A completed walkthrough should not reopen automatically.",
);

const unavailableStorage: TutorialStorage = {
  getItem() {
    throw new Error("Storage is unavailable.");
  },
  setItem() {
    throw new Error("Storage is unavailable.");
  },
};
expect(
  shouldShowPreviewTutorial(unavailableStorage),
  "Unavailable storage should not prevent the walkthrough from opening.",
);
markPreviewTutorialSeen(unavailableStorage);
