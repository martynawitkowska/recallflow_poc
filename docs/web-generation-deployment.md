# Web generation deployment

REFL-95 adds a Cloudflare Worker for limited jury-preview quiz generation. It
is intentionally disabled and not deployed while the submission is being
prepared. Judges never enter an OpenAI key: `OPENAI_API_KEY` exists only as an
encrypted Worker secret.

## Security and cost boundary

- The Worker accepts `POST /generate` only from the production Pages origin or
  the two configured local development origins.
- It accepts pasted material only, capped at 50,000 characters and 10
  questions. The full request body is capped at 75 KB.
- Cloudflare limits generation to five requests per minute per location. A
  Durable Object also reserves at most 50 generation attempts per UTC month.
  CORS is a browser boundary, not authentication.
- OpenAI receives the material only after the judge selects **Generate**. The
  Worker requests strict structured output, disables response storage, caps
  output at 4,000 tokens, times out after 25 seconds, and validates the quiz
  again before returning it.
- The Worker returns fixed public errors and never logs or returns the provider
  key or raw provider response.

The OpenAI project's [$5 monthly budget is an alert, not a hard
cap](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform):
OpenAI continues processing requests after it is exceeded. Keep the alert, but
rely on the Worker's 50-attempt gate as the enforceable application boundary.
At the [current GPT-5.4 mini
prices](https://developers.openai.com/api/docs/models/gpt-5.4-mini), even 50
requests at the configured maximum input and output bounds remain below $4.
Re-check pricing before deployment.

## Submission-day deployment

Do not put the OpenAI key in GitHub, Vite variables, Wrangler configuration,
source code, or browser storage.

1. Sign in with `npx wrangler login`.
2. In Cloudflare Workers & Pages, create the `recallflow-jury-generation`
   Worker if it does not exist. In its settings, add `OPENAI_API_KEY` as an
   encrypted secret.
3. Change `GENERATION_ENABLED` in `worker/wrangler.jsonc` from `false` to
   `true`, run `npm run check:worker`, then run `npm run worker:deploy`.
4. Smoke-test the Worker URL with an approved `Origin` header. Confirm rejected
   origins return 403, malformed input returns 400, and repeated requests
   eventually return 429. In Cloudflare, confirm the `GENERATION_BUDGET`
   Durable Object binding exists.
5. Add the public endpoint URL ending in `/generate` as the GitHub Actions
   repository variable `VITE_RECALLFLOW_GENERATION_URL`. It is not a secret.
6. Merge and push REFL-95. The Pages workflow embeds only that public URL.
   Confirm the deployed UI shows the live generator and still contains no API
   key or shared credential.

## Emergency shutdown

Set `GENERATION_ENABLED` back to `false` and redeploy the Worker. If immediate
shutdown is required, disable the Worker in Cloudflare and revoke its OpenAI
project key. Keep the OpenAI project monthly budget alert at $5 and review usage
before and during judging. The seeded, imported, and study flows continue
working when the generation endpoint is absent or disabled.
