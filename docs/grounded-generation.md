# Grounded transcript generation

RecallFlow uses a fixed, application-controlled pipeline for pasted material:

1. Validate a non-empty source of at most 500,000 Unicode characters.
2. Normalize CRLF/CR line endings and partition the complete transcript into
   primary regions targeting 8,000 characters, with up to 800 characters of
   context on either side.
3. Generate zero, one, or two candidates per region with no more than four
   active provider requests.
4. Reject candidates whose exact evidence quotation cannot be resolved inside
   their assigned primary region.
5. Independently verify support, standalone phrasing, portability, preserved
   qualifications, lack of overgeneralization, and unambiguous choices.
6. Remove exact and provider-identified semantic duplicates, then select across
   topics and source regions before converting to `QuizFile`.

The constants are implementation bounds, not user settings. The requested
question count is a maximum. A region may validly yield no candidates, and the
pipeline never rewrites rejected content to fill a quota.

## Outcomes

- `full`: the requested maximum was selected.
- `quality_limited`: trustworthy questions were returned, but fewer than
  requested.
- `incomplete_coverage`: usable questions were returned while at least one
  source region, verification batch, or duplicate-analysis stage was incomplete.
- `quality_empty`: processing completed but no candidate passed every gate.
- operational error: no trustworthy result could be produced because required
  provider work failed.
- `cancelled`: the user stopped the run; queued/in-flight application work is
  cancelled and no partial quiz is saved.

Progress events expose only `runId`, stage, completed count, and total count.
The stages are Preparing transcript, Generating candidates, Verifying
questions, Selecting questions, and Complete.

## Deterministic release checks

Run all checks locally:

```sh
npm run check
```

The Rust suite covers contracts, Unicode-safe segmentation, concurrency and
retry bounds, exact evidence resolution, fail-closed verifier parsing,
duplicate handling, balanced selection, cancellation, and a complete mocked
pipeline. Provider-payload tests assert strict schemas, selected model,
bounded chunk input, and `store: false`.

The corpus at
`src-tauri/tests/fixtures/grounded_generation_corpus.json` is synthetic and
CC0. It records expected accepted concepts and rejection categories without
requiring unstable generated prose. Normal tests never contact a provider.

No live-provider command is included in the initial release. If one is added,
it must remain opt-in, require an explicit environment key, stay out of CI,
and print aggregate metrics only—never transcript, evidence, raw responses, or
credentials.
