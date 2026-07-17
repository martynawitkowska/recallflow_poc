import { readQuizFile } from "./readQuizFile.ts";

function quizFile(
  name: string,
  contents: string,
  size = contents.length,
  readError = false,
) {
  return {
    name,
    size,
    text: async () => {
      if (readError) {
        throw new Error("private file-system detail");
      }
      return contents;
    },
  } as unknown as File;
}

async function expectError(file: File, expectedMessage: string) {
  try {
    await readQuizFile(file);
    throw new Error("Expected quiz-file validation to fail.");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes(expectedMessage)) {
      throw error;
    }
  }
}

const imported = await readQuizFile(
  quizFile("biology.JSON", '{"title":"Biology"}'),
);
if (
  imported.name !== "biology.JSON" ||
  imported.size !== 19 ||
  (imported.contents as { title?: string }).title !== "Biology"
) {
  throw new Error("Expected a readable JSON file to preserve parsed data and metadata.");
}

await expectError(quizFile("biology.txt", "{}"), ".json extension");
await expectError(quizFile("empty.json", "", 0), "empty");
await expectError(quizFile("large.json", "{}", 5 * 1024 * 1024 + 1), "larger than 5 MB");
await expectError(quizFile("unreadable.json", "{}", 2, true), "permissions");
await expectError(quizFile("invalid.json", "not json"), "valid JSON");
