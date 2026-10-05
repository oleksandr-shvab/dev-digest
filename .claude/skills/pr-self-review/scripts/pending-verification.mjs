#!/usr/bin/env node
// Step 7 helper: list the CRITICAL findings from this run that still need an
// independent verdict (written to verdicts/*.json by the verifier agents).
import { loadFresh } from "./lib.mjs";

const { findings } = loadFresh();
const pending = findings.filter((f) => f.severity === "CRITICAL" && f.verified !== true && f.in_diff);
console.log(JSON.stringify(pending, null, 2));
console.error(`[verify] ${pending.length} CRITICAL finding(s) need verification`);
