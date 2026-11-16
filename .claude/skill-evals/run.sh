#!/usr/bin/env bash
# Build a skill's eval suite from .claude/skills/<skill>/evals/expected-findings.json
# and run it with `claude plugin eval`, with and without the skill.
# Every generated file and result stays here, outside the skill folder.
#
#   .claude/skill-evals/run.sh <skill> [extra `claude plugin eval` flags]
#   RUNS=3 THRESHOLD=0.8 .claude/skill-evals/run.sh onion-architecture --case 'review-tags-*'
#
# These are real, billed model runs.
set -euo pipefail

skill="${1:?usage: run.sh <skill> [claude plugin eval flags]}"
shift

here="$(cd "$(dirname "$0")" && pwd)"
plugin_dir="$(node "$here/build-suite.mjs" "$skill")"

out="$here/results/$skill/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$out"

claude plugin eval "$plugin_dir" \
  --scaffold \
  --allow-tools Write \
  --runs "${RUNS:-1}" \
  --threshold "${THRESHOLD:-1.0}" \
  --output-dir "$out" \
  --report "$out/report.html" \
  --json "$out/result.json" \
  --no-publish \
  "$@"

echo "results: $out"
