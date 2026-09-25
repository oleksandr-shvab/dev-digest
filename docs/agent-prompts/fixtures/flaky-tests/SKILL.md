---
name: flaky-tests
description: Spot tests that pass or fail non-deterministically (timers, clocks, randomness, shared state).
---

# Flaky tests

Flag tests in the diff that can pass or fail without any code change:

- real timers or `setTimeout` sleeps used to wait for something instead of awaiting it or using fake timers
- dependence on the wall clock (`Date.now()`, `new Date()`), time zones or locale
- unseeded randomness (`Math.random()`, random ids/ports) feeding an assertion
- ordering assumptions: object key order, unordered query results, `Promise.all` completion order
- state shared across tests (module singletons, DB rows, files, env vars) that is not reset in `beforeEach` / `afterEach`
- fixed ports or paths that collide when suites run in parallel
- un-awaited promises or missing `await expect(...).resolves/rejects`

For each finding name the non-deterministic source and the concrete fix (fake timers, injected clock, seeded RNG, per-test fixtures, `await`). Severity: a flaky pattern on a test guarding a critical path is WARNING; a one-off timing assumption is SUGGESTION. Never CRITICAL on flakiness alone.

See `scripts/find-flaky.sh` for a helper that greps for the common patterns (reference only — skills are text; nothing here is executed).
