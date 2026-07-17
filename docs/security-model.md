# RecallFlow security model

This document describes the current implementation.

## Data stored on the device

RecallFlow is local-first, which means normal library and study activity does
not require a RecallFlow server.

| Data | Location | Contents |
| --- | --- | --- |
| Application preferences | WebView local storage | Reading font and whether quizzes start in focus mode |
| AI selection | WebView local storage | Selected mnemonic provider and one model choice per provider |
| Vault unlock material | WebView local storage | Random password used to reopen the Stronghold snapshot automatically |
| Study library | Local SQLite database | Imported or generated quizzes, saved mnemonics, and quiz attempts |
| Saved provider credentials | Tauri Stronghold snapshot | Separate encrypted OpenAI, Gemini, and Claude API-key records |

The local-storage records contain no provider API keys. Local-first storage is
not the same as protection from the signed-in operating-system user: someone
who can read all RecallFlow application files can read the preferences and
SQLite database and obtain the automatic Stronghold unlock material.

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
Provider adapters discard raw HTTP bodies and library error details. Rust
command and WebView IPC boundaries also reject any error containing a submitted
credential and show a fixed safe fallback instead. A process debugger or
another program with access to RecallFlow's memory could still observe a key
while a request is active.

## Rust session secret state

The backend provides one in-memory key slot for OpenAI, Gemini, and Claude.
This managed state is created when the desktop application starts and is
dropped when it exits. Before the UI mounts, valid saved Stronghold records are
copied into their matching slots. The Rust state itself never reads from or
writes to local storage, SQLite, or Stronghold.

Tauri commands can save, inspect, and remove each provider's session key. Save
rejects keys shorter than 20 characters or containing whitespace. Status
returns only whether a key is configured and a masked four-character suffix;
the full key is never returned to the WebView. Removing one provider's key
does not affect the others.

The current generation forms still submit request-only keys directly. Wiring
saved provider keys into the UI and generation path belongs to related work.

Session-only does not mean inaccessible: a process debugger or another
program with access to RecallFlow's memory could observe a key while the app
is running.

## Stronghold persistence

RecallFlow initializes the Tauri Stronghold plugin with Argon2 and a local
random salt. The persistence wrapper stores each provider key under a distinct
record name and explicitly saves the encrypted snapshot after inserting or
removing a record. Successful saves also populate the matching Rust session
slot; deletes remove both the encrypted record and session value.

During desktop startup, RecallFlow opens the configured vault before mounting
React. Each saved record is decoded, validated, and sent through the existing
Rust session command. Providers are restored independently: a missing record
is ignored, while an invalid record or provider-specific session failure is
reported only by provider name and does not block the other providers. If the
vault cannot open, RecallFlow keeps local study features available without
restoring session credentials; it does not log or delete the vault.

The vault uses a randomly generated 32-byte password stored in the WebView app
profile so it can unlock without prompting on every launch. This keeps API
keys out of plaintext local storage and SQLite, and protects the Stronghold
snapshot when copied alone. It does not protect keys from someone who can read
both the vault and the same app profile. An operating-system credential store
or user-entered master password would provide a stronger boundary but is not
part of the approved automatic-unlock design.

### Legacy migration and recovery

The former RecallFlow build used `recallflow-secrets.hold`, an OpenAI-only
Stronghold snapshot unlocked with a user-entered master password and the
legacy salt file. The migration API accepts that password, selects the legacy
KDF path internally, reads and validates the old OpenAI record, then saves it
to the current automatic vault and Rust session. Only after those steps
succeed does RecallFlow remove the old snapshot and its local migration flag.
A wrong password, missing record, invalid record, or current-vault save failure
leaves the legacy snapshot in place.

Recovery of the current automatic vault is explicit because it is destructive.
The reset API unloads the active snapshot, removes the current vault file,
clears all three Rust session slots, and removes the automatic password only
after the Rust reset succeeds. Missing vault files are treated as already
reset. RecallFlow never resets an unreadable vault automatically during
startup.

The key-management UI is separate related work, so the current generation UI
remains request-only. These migration and reset operations are available
through the desktop credential API for that UI to orchestrate.

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
4. Attempt legacy migration with a wrong password or invalid stored record and
   confirm the legacy vault remains available for another attempt.
5. Confirm a current vault is removed only after an explicit reset and that
   the app remains usable with empty session key slots afterward.
6. Inject a recognizable fake API key into a simulated command failure and
   confirm neither the returned error nor the WebView-visible message contains
   it.

Automated Rust coverage:

- `cargo test --manifest-path src-tauri/Cargo.toml state::tests` verifies empty
  startup state, provider isolation, masked status, targeted removal, and
  invalid key/provider rejection, including clearing every provider during an
  explicit vault reset.
- `cargo test --manifest-path src-tauri/Cargo.toml vault::tests` verifies that
  current and legacy passwords select their matching salt paths, salt creation
  is stable, and vault-file removal is idempotent.
- `cargo test --manifest-path src-tauri/Cargo.toml commands::tests` injects a
  recognizable fake API key and verifies the Rust command boundary replaces a
  credential-bearing error while preserving safe actionable errors.

Automated Stronghold contract coverage:

- `npm run check:api-key-storage` verifies key normalization and that OpenAI,
  Gemini, and Claude use distinct encrypted record names. It also verifies
  successful startup restoration, missing records, provider failure isolation,
  secret-free restoration reports, migration ordering, and preservation of an
  invalid legacy vault.
- `npm run check:ipc` injects a recognizable fake API key into a nested IPC
  request and verifies a credential-bearing command error cannot be forwarded
  to the WebView.
- `npm run build` verifies the Stronghold JavaScript and Tauri IPC contracts
  compile together.

Run `npm run check` for the complete frontend and Rust validation workflow.
