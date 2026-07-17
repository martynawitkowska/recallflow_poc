# Resilient UI states

RecallFlow keeps local study usable when data is absent, an operation is in
progress, a recoverable operation fails, or the device loses its network
connection.

| Area | Empty | Loading | Error and recovery | Offline behavior |
| --- | --- | --- | --- | --- |
| Library | Explains how to add the first quiz | Announces local library loading | Shows an actionable error and **Try again** | Existing local quizzes remain available |
| History | Explains that completed sessions appear here | Announces local history loading | Shows an actionable error and **Try again** | Existing local attempts remain available |
| JSON import | Shows that no file is selected | Announces the file being read | Names the rejected file and validation problem | Local import remains available |
| Quiz generation | Form is ready for material or a URL | Announces generation and disables repeat submission | Preserves the form and shows the provider-safe failure | Form content remains editable; generation is disabled until reconnection |
| Mnemonic generation | Offers generation after an incorrect answer | Announces mnemonic generation | Preserves the question and offers another attempt | Quiz progress and saved mnemonics remain usable; generation is disabled |
| Local saves | No save message before a save begins | Announces attempt or mnemonic saving | Explains the failure and provides **Retry save** | Local saving remains available |

The global offline notice is non-blocking and explicitly distinguishes local
features from network-only AI features. Provider actions also re-check the
connection in their hooks, so a stale or programmatic submit cannot start a
request while the browser reports it is offline. No source material, question,
answer, or API key is sent while offline.

## Manual verification

1. Run `npm run desktop:dev`, then open **Add quiz** and confirm the import and
   generation areas have clear initial states.
2. Disable the network and confirm the global notice appears, quiz generation
   is disabled with an explanation, and local import, library, history, and
   quiz sessions still work.
3. Answer a question incorrectly while offline and confirm any saved mnemonic
   is readable while new mnemonic generation is disabled with an explanation.
4. Restore the network and confirm the notice disappears and provider actions
   are available again without losing entered study material.
5. Trigger validation, provider, and local-save failures and confirm the
   specific error and retry action remain visible and keyboard operable.

Run `npm run check` for the complete automated frontend and Rust validation
workflow.
