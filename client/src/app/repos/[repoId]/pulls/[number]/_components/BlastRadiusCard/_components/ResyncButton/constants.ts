/** How long to poll the index state after a resync before giving up. Longer than the
    JobRunner's 120 s hard limit (see the `INDEX_SOFT_BUDGET_MS` comment in
    server/src/modules/repo-intel/constants.ts), so a finished job is always seen first. */
export const RESYNC_POLL_TIMEOUT_MS = 150_000;
