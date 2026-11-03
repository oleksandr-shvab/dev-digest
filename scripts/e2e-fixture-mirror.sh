#!/usr/bin/env bash
#
# Create the git mirror of the seeded demo repo (acme/payments-api) that the
# Project Context e2e flows read their docs from.
#
#   scripts/e2e-fixture-mirror.sh <clone-dir>
#
# Copies e2e/fixtures/payments-api-mirror into <clone-dir>/acme/payments-api,
# runs `git init`, makes one commit and leaves HEAD on `main`. Point the API at
# <clone-dir> with DEVDIGEST_CLONE_DIR; the hermetic runner (scripts/e2e.sh) and
# the CI workflow (.github/workflows/e2e-web.yml) both do.
#
# Deterministic: fixed author, fixed date, no network, no hooks, no signing.

set -euo pipefail

if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  echo "usage: $0 <clone-dir>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE="$ROOT/e2e/fixtures/payments-api-mirror"
DEST="$1/acme/payments-api"

[ -d "$FIXTURE" ] || { echo "fixture not found: $FIXTURE" >&2; exit 1; }
# Never write into an existing repo: a re-run would stack a second commit.
[ ! -e "$DEST" ] || { echo "refusing: $DEST already exists" >&2; exit 1; }

mkdir -p "$DEST"
cp -R "$FIXTURE/." "$DEST/"

COMMIT_DATE="2026-01-01T00:00:00Z"
export GIT_AUTHOR_NAME="DevDigest e2e" GIT_AUTHOR_EMAIL="e2e@devdigest.local" GIT_AUTHOR_DATE="$COMMIT_DATE"
export GIT_COMMITTER_NAME="DevDigest e2e" GIT_COMMITTER_EMAIL="e2e@devdigest.local" GIT_COMMITTER_DATE="$COMMIT_DATE"

git -C "$DEST" init --quiet --initial-branch=main
git -C "$DEST" add -A
git -C "$DEST" -c commit.gpgsign=false -c core.hooksPath=/dev/null commit --quiet -m "e2e fixture: project context docs"
echo "fixture mirror ready: $DEST ($(git -C "$DEST" rev-parse --short HEAD))"
