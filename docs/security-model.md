# RecallFlow security model

This document describes the current implementation. It does not describe
planned Stronghold behavior as if it already exists.

## Data stored on the device

RecallFlow is local-first, which means normal library and study activity does
not require a RecallFlow server.

| Data | Location | Contents |
| --- | --- | --- |
| Application preferences | WebView local storage | Reading font and whether quizzes start in focus mode |
| AI selection | WebView local storage | Selected mnemonic provider and one model choice per provider |
| Study library | Local SQLite database | Imported or generated quizzes, saved mnemonics, and quiz attempts |

The local-storage records contain no API keys. Local-first storage is not the
same as encryption: someone who can read the operating-system account's
RecallFlow application files can read these preferences and the SQLite
database.

## API-key lifecycle in the generation UI

The current generation forms use request-only API keys:

1. The user enters a key into a password input.
2. React holds the value in memory and passes it through Tauri IPC as part of a
   generation request.
3. Rust validates the request and sends the key over HTTPS to the selected AI
   provider.
4. RecallFlow clears the input after successful generation. After a failed
   request, the input remains available for retry and is discarded when the
   view is closed or the application exits.

The key is not written to WebView local storage, SQLite, or application logs.
User-facing provider errors use bounded messages and do not include raw
provider response bodies. A process debugger or another program with access
to RecallFlow's memory could still observe a key while a request is active.

## Rust session secret state

The backend provides one in-memory key slot for OpenAI, Gemini, and Claude.
This managed state is created when the desktop application starts and is
dropped when it exits. It never reads from or writes to local storage, SQLite,
or Stronghold.

Tauri commands can save, inspect, and remove each provider's session key. Save
rejects keys shorter than 20 characters or containing whitespace. Status
returns only whether a key is configured and a masked four-character suffix;
the full key is never returned to the WebView. Removing one provider's key
does not affect the others.

The current generation forms still submit request-only keys directly. Wiring
saved provider keys into the UI and generation path belongs to related work.
Stronghold persistence is intentionally outside REFL-63; REFL-64 owns that
behavior, and REFL-65 through REFL-67 own restoration, recovery, and
redaction hardening.

Session-only does not mean inaccessible: a process debugger or another
program with access to RecallFlow's memory could observe a key while the app
is running.

## Network disclosure

RecallFlow sends data to an AI provider only after the user chooses a Generate
action:

- Quiz generation from notes sends the notes, requested question count, and
  API key.
- Quiz generation from a URL sends the public URL and API key; OpenAI may read
  that page through web search.
- Mnemonic generation sends the question, correct answer, optional
  explanation, selected provider/model, and API key.

Saved quizzes and attempts are not uploaded automatically. Provider handling
of submitted data is governed by that provider's account and privacy terms.

## Review checklist

Happy path:

1. Change typography, focus mode, provider, and model in **Settings**.
2. Restart RecallFlow and confirm those non-secret preferences are restored.
3. Generate a quiz or mnemonic and confirm the key field clears after success.
4. Restart offline and confirm saved quizzes and attempts remain available.

Failure path:

1. Submit an invalid key and confirm the error is actionable but does not echo
   the key or a raw provider response.
2. Restart RecallFlow and confirm the failed key was not restored.
3. Inspect the two local-storage preference records and SQLite schema and
   confirm neither contains an API-key field.

Automated Rust coverage:

- `cargo test --manifest-path src-tauri/Cargo.toml state::tests` verifies empty
  startup state, provider isolation, masked status, targeted removal, and
  invalid key/provider rejection.

Run `npm run check` for the complete frontend and Rust validation workflow.
