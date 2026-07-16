# RecallFlow

RecallFlow is a local-first desktop application built with React 19, TypeScript, Vite, Tauri 2, and Rust.

## Development

Install dependencies and start the desktop application:

```sh
npm install
npm run tauri dev
```

Run the frontend and Rust checks:

```sh
npm run build
cd src-tauri
cargo fmt --check
cargo check
cargo test
```
