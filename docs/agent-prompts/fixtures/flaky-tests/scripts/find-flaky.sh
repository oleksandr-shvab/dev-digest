#!/usr/bin/env bash
# Reference helper: grep for common flaky-test patterns in a test directory.
# DevDigest skills are text-only — this script is IGNORED on import and never run.
set -euo pipefail
dir="${1:-.}"
grep -rnE 'setTimeout\(|Date\.now\(\)|new Date\(\)|Math\.random\(\)' \
  --include='*.test.ts' --include='*.spec.ts' "$dir" || true
