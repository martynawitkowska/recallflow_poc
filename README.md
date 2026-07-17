# RecallFlow

RecallFlow is a local-first desktop application built with React 19, TypeScript, Vite, Tauri 2, and Rust.

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

This runs the TypeScript/Vite production build, Rust formatting check,
`cargo check`, and the Rust test suite.

## AI provider selection

Open **AI settings** to choose the provider and mnemonic model. RecallFlow
remembers the selected model separately for OpenAI, Google Gemini, and
Anthropic Claude, then uses the active pair for new mnemonic requests.

This preference contains no credentials. API keys are still entered only when
requesting a mnemonic and are not stored by the provider selection setting.

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
