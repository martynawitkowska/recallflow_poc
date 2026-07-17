# RecallFlow security model

This document describes the current implementation.

## Data stored on the device

RecallFlow is local-first. Normal library and study activity does not require a
RecallFlow server.

| Data | Location | Contents |
| --- | --- | --- |
| Application preferences | WebView local storage | Reading font and whether quizzes start in focus mode |
| AI selection | WebView local storage | Selected mnemonic provider and one model choice per provider |
| Study library | Local SQLite database | Imported or generated quizzes, saved mnemonics, and quiz attempts |
| Provider credentials | Operating system credential store | One API key per provider |

Provider keys use the stable service name
`com.martynawitkowska.recallflow.api-keys` and separate `openai`, `gemini`, and
`claude` accounts. macOS stores them in Keychain, Windows in Credential Manager,
and Linux through Secret Service. Linux therefore requires an unlocked Secret
Service-compatible keyring.

## API-key lifecycle

1. The user pastes a provider key once in **Settings**.
2. React sends that value once to `save_ai_api_key` through Tauri IPC and clears
   the password input after a successful save.
3. Rust validates the key and writes it to the operating system credential
   store on a blocking worker thread.
4. Status calls return only `configured` and an optional masked suffix. There
   is no frontend operation that returns a full key.
5. Quiz and mnemonic generation requests contain no key. Rust reads the chosen
   provider key immediately before the provider request and holds it in a
   zeroizing temporary string.
6. Replacing or removing a key updates the operating system credential store.

The key is not written to WebView local storage, SQLite, application logs, or a
long-lived Rust cache. Keychain operations distinguish a missing credential
from a locked or unavailable credential store without returning platform error
details to the WebView.

Provider adapters discard raw HTTP bodies and library error details. Rust and
WebView IPC boundaries replace any credential-bearing failure with a fixed safe
message. A process debugger or another program with access to RecallFlow's
memory could still observe a key while a provider request is active.

## Network disclosure

RecallFlow sends data to an AI provider only after the user chooses a Generate
action:

- Quiz generation from notes sends bounded transcript chunks and the API key.
  Candidate evidence and a bounded chunk context are sent again in separate
  verification requests. Transcript content leaves the device only after the
  user explicitly presses **Generate**.
- Quiz generation from a URL sends the public URL and API key; OpenAI may read
  that page through web search.
- Mnemonic generation sends the question, correct answer, optional explanation,
  selected provider/model, and API key.

Saved quizzes and attempts are not uploaded automatically. Provider handling
of submitted data is governed by that provider's account and privacy terms.

OpenAI quiz-generation requests use the Responses API with strict structured
outputs and `store: false`. The initial workflow is an application-controlled
pipeline, not the Agents SDK or user-selectable Skills. RecallFlow does not use
web search or outside facts for pasted transcripts. URL generation remains an
explicit web-search workflow for the supplied public URL.

Cancellation stops queued work and aborts application tasks waiting on active
requests; late results are ignored and are not saved. Progress events contain
only a run identifier, stage, and aggregate counts. Transcript text, evidence
quotations, provider responses, and API keys are not included in progress
events or application logs.

Exact quotation matching and independent semantic verification reduce the risk
of unsupported questions, but they do not guarantee that the source itself is
factually true. Users should review generated questions before saving them.

## WebView hardening

The Tauri configuration enables a restrictive Content Security Policy:

- content loads from the bundled application;
- WebView network access is limited to Tauri IPC;
- images are limited to local asset and data/blob sources;
- inline styles remain allowed for the current bundled UI;
- no remote scripts are allowed.

Provider HTTP requests originate in Rust and do not require WebView network
permissions.

## Review checklist

Happy path:

1. Save separate keys for two providers in **Settings**.
2. Restart RecallFlow and confirm both providers report only their masked
   status.
3. Generate a quiz and mnemonic without another key prompt.
4. Remove one key and confirm the other provider remains configured.

Failure path:

1. Save an invalid key and confirm the error does not echo the value.
2. Lock or disable the operating system credential store and confirm RecallFlow
   reports that it is unavailable, not that the key is missing.
3. Inspect WebView local storage and SQLite and confirm neither contains an API
   key or credential-store unlock value.
4. Confirm generation without a provider key directs the user to Settings.
5. Inject a recognizable fake API key into a simulated provider failure and
   confirm neither the returned error nor the WebView message contains it.

Automated coverage:

- Rust credential tests verify stable provider accounts, validation, masking,
  and distinct missing-versus-unavailable messages without reading a developer
  keychain.
- Rust command tests verify credential-bearing provider errors are redacted.
- IPC contract tests verify generation request types contain no API-key field.
- `npm run check` runs the frontend build, contract checks, Rust formatting,
  compilation, and test suite.
- The grounded-generation corpus is synthetic and its mocked end-to-end tests
  make no network calls or print source, evidence, raw responses, or keys.
