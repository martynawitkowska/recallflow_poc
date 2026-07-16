const MAX_FILE_SIZE = 5 * 1024 * 1024;

export type ImportedQuizFile = {
  contents: unknown;
  name: string;
  size: number;
};

export async function readQuizFile(file: File): Promise<ImportedQuizFile> {
  if (!file.name.toLowerCase().endsWith(".json")) {
    throw new Error("Choose a quiz file with the .json extension.");
  }

  if (file.size === 0) {
    throw new Error("This file is empty. Choose a JSON file containing a quiz.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("This file is larger than 5 MB. Choose a smaller quiz file.");
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new Error("RecallFlow could not read this file. Check its permissions and try again.");
  }

  try {
    return { contents: JSON.parse(text), name: file.name, size: file.size };
  } catch {
    throw new Error("This file does not contain valid JSON. Fix the file and try again.");
  }
}
