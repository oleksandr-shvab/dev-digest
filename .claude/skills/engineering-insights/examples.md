# Examples

Bad entries are vague enough to be true of any codebase. Good entries name a
real file and tell a cold reader exactly what to do.

## What Doesn't Work

❌ **Bad:** "Be careful with async."

✅ **Good:**
> - **2026-09-15** — `POST /pulls/:id/review` returns before the review
>   pipeline has even started — it's a fire-and-forget `void` promise. A test
>   asserting on the HTTP response body stays green even when the review
>   fails downstream. Assert against `run_traces` rows or the SSE stream
>   instead. `server/src/modules/reviews/routes.ts`

## Tool & Library Notes

❌ **Bad:** "Keep the Zod schemas in sync."

✅ **Good:**
> - **2026-09-15** — `@devdigest/shared` is vendored twice with no sync
>   script: `server/src/vendor/shared` and `client/src/vendor/shared`. Change
>   a Zod contract and forget the other copy, and typecheck stays green while
>   the runtime blows up on parse. Grep both vendor dirs whenever a shared
>   contract changes. `client/CLAUDE.md`

## Recurring Errors & Fixes

❌ **Bad:** "e2e tests can be flaky."

✅ **Good:**
> - **2026-09-15** — `npm test` in `e2e/` against the local dev DB makes
>   flows 02/04/05 fail: they expect the seeded `acme/payments-api` PR #482
>   and land on whatever repo is actually first in a real dev DB instead. Run
>   `npm run e2e:hermetic`. `e2e/README.md`

## What fails the gate

❌ "`server/` has one folder per feature under `src/modules/`." — true, but
already stated in `server/CLAUDE.md` and visible from `ls server/src`.
Nothing non-obvious here — don't write it.
