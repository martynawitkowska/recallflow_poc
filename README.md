# RecallFlow

RecallFlow is a local-first desktop application built with React 19, TypeScript, Vite, Tauri 2, and Rust.

## Jury preview

Open the [RecallFlow GitHub Pages jury preview](https://martynawitkowska.github.io/recallflow_poc/)
to try the browser-safe learning journey. It includes a seeded quiz and supports
JSON import, quiz sessions, answer feedback, summaries, repair sessions,
statistics, metadata editing, deletion, and non-secret preferences.

Preview quizzes, completed attempts, and preferences are stored in local
browser storage for this site only. They survive refreshes in the same browser
profile but are not synced, backed up, or shared with the desktop app. Removing
site data or using a different browser/profile starts a separate library. Use
**Reset preview** in the library and confirm the prompt to discard preview data
and restore the seeded quiz.

The static preview does not use Tauri IPC, SQLite, operating-system credential
storage, or direct AI generation. It never asks for a provider API key and does
not send study material to an AI provider. Quiz and mnemonic generation remain
desktop capabilities; the preview explains those boundaries in place. For a
browser-only alternative, copy the external-generation prompt, create a quiz
JSON file in an AI service you choose, and import that file into the preview.

Build the same static artifact locally with:

```sh
npm ci
npm run build:pages
npm run preview:pages
```

The optional server-backed quiz generator is implemented but disabled until
submission readiness. See [web generation deployment](docs/web-generation-deployment.md)
for its security boundary, $5 budget alert, enforced usage guard, deployment steps, and emergency
shutdown procedure.

## Development

Install the JavaScript and Rust dependencies, then start the desktop app with
hot reload:

```sh
npm ci
npm run desktop:dev
```

The browser-only Vite preview is useful for layout work, but desktop IPC
features intentionally report that the Tauri app is required:

```sh
npm run dev
```

## Validation

Run the complete frontend and Rust validation workflow:

```sh
npm run check
```

This runs the TypeScript/Vite production build, dependency-free frontend
validation and domain-logic checks, Rust formatting check, `cargo check`, and
the Rust test suite. Individual frontend checks are available as
`npm run check:<area>` scripts in `package.json`.

Rust tests use Cargo's built-in harness. Private implementation boundaries use
colocated unit tests, while public serialization and cross-module behavior live
in `src-tauri/tests/`. The suite uses deterministic local inputs and does not
contact AI providers.

SQLite integration coverage recreates the shipped library-only schema and
verifies that initialization preserves its quizzes while adding attempt
storage. Separate persistence checks close and reopen a file-backed database.

Provider tests pass bounded, synthetic JSON envelopes directly to the private
OpenAI, Gemini, and Claude parsers and exercise HTTP failure classification.
They do not contact provider APIs or include real credentials or study data.

## Grounded quiz generation

Pasted transcripts may contain up to 500,000 Unicode characters. RecallFlow
normalizes line endings, splits the complete text into bounded logical regions,
and asks OpenAI for at most two candidates per region. Every retained question
must quote exact evidence from its assigned primary region and pass a separate
grounding, standalone-phrasing, portability, qualification, overgeneralization,
and answer-ambiguity review. Global duplicate removal and topic-balanced
selection happen before candidates become a public `QuizFile`.

The requested question count is a maximum. RecallFlow may return fewer
questions—or none—when candidates are unsupported, context-dependent,
ambiguous, duplicated, or insufficiently qualified. It does not invent filler
to reach the requested count. Progress and cancellation are available for
long-running transcript generation.

See [grounded generation](docs/grounded-generation.md) for pipeline constants,
failure outcomes, fixtures, and developer checks.

## Application preferences

Open **Settings** to choose the application font and whether new quizzes start
in focus mode. Preferences are validated, stored locally in the app profile,
and applied without sending data outside RecallFlow. Focus mode can still be
exited during a quiz.

## AI provider selection

Open **Settings** to choose the provider and mnemonic model. RecallFlow
remembers the selected model separately for OpenAI, Google Gemini, and
Anthropic Claude, then uses the active pair for new mnemonic requests. Save
each provider API key there once; RecallFlow reuses it for quiz and mnemonic
generation until you replace or remove it.

## Security model

RecallFlow keeps application preferences in the local app profile and study
data in local SQLite. Provider API keys are stored by Rust in macOS Keychain,
Windows Credential Manager, or Linux Secret Service. Full keys are never
returned to React or saved to WebView local storage or SQLite. See the
[security model](docs/security-model.md) for the data flow.

## Packaging

Create the native installer or application bundle for the current operating
system:

```sh
npm run desktop:build
```

Artifacts are written below `src-tauri/target/release/bundle/`. Packaging for
another operating system must run on that operating system with its required
Tauri prerequisites installed. Release signing and distribution credentials
are intentionally not stored in this repository.
