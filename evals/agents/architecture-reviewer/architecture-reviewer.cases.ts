import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

// The agent under test (.claude/agents/architecture-reviewer.md) takes its scope from a collected
// patch manifest, a plan, or a list of files, and refuses to start ("Needs clarification") when the
// scope does not exist. The fixtures are fictional diffs, so the prompt hands the patch over as the
// complete scope and says the touched files are not on disk. Without this preamble the agent asked
// for clarification on two of four cases and no rule was ever checked. It also keeps the agent off
// the stale `.claude/pr-self-review/manifest.json` that happens to sit in the working tree.
const SCOPE_PREAMBLE = `Review the patch below against DevDigest's documented structural contracts.

The patch is the complete scope, collected by the caller (scope: paths given). The files it touches are not on disk in this repo, so take the changed lines and their paths from the patch itself and read only the rule files you need. Do not use .claude/pr-self-review/manifest.json, and do not ask clarifying questions: review the patch.`;

const review = (diff: string) => `${SCOPE_PREAMBLE}\n\n${fx(diff)}`;

const REVIEW_PROMPT = review("checkout-service.diff");

// A second diff whose violations map onto DevDigest-SPECIFIC rule ids of this agent
// (`onion-architecture/reviewer-core-purity`) that a competent model will describe in prose but will
// not spontaneously name unless the agent forces a citation. This is the discriminating case for the
// strict-vs-lite A/B: both variants should FIND both problems, but only the strict variant (which
// keeps the "cite the exact documented rule per finding" hard rule) should reliably emit the id. The
// checkout diff's textbook violations don't discriminate — the model volunteers a rule id either way.
const REVIEWER_CORE_PROMPT = review("reviewer-core-gate.diff");

// A diff that violates NO documented rule (a pure local-variable rename, no new imports, no
// cross-layer edges). A grounded reviewer should report zero violations. This surfaces the COST of
// relaxing the citation rule: freed from "every finding must quote a documented rule", the lite
// variant is more prone to fabricating a judgment/best-practice finding where strict stays silent.
const BENIGN_PROMPT = review("benign-refactor.diff");

// Shared across the strict (architecture-reviewer) and relaxed (architecture-reviewer-lite)
// variants so the two agents are graded on the exact same task — the only thing that should
// move between the two runs is whether "names the rule id" keeps passing.
export const cases: AgentCase[] = [
  {
    name: "flags both violations in the checkout diff with severity and a citable rule",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "flags the domain file (checkout.ts) importing a type from 'fastify' as a dependency-direction violation (an inner layer importing an outer-layer type)",
      "flags the `new PgCheckoutRepository()` call inside service.ts as a composition-root violation (concrete repositories must be constructed only in the container)",
      "names a rule id of the form `<skill>/<rule>` (for example `onion-architecture/composition-root`) for EVERY finding, rather than describing the problem only in prose",
      "assigns a severity (CRITICAL, HIGH or MEDIUM) to each finding",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "states an explicit Verdict (violations found, no violations in the checks that ran, or not reviewed)",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "does not fabricate an architecture finding for the out-of-scope security-shaped change",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "does not invent an architecture-contract violation for the optional `reply?: FastifyReply` parameter beyond the dependency-direction issue of the `fastify` import itself (no runtime bug or security finding fabricated as an architecture rule)",
      "stays scoped to structural, layering and DI findings and does not comment on naming, style, or test coverage",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "cites the DevDigest-specific rule id for reviewer-core violations",
    kind: "quality",
    prompt: REVIEWER_CORE_PROMPT,
    practices: [
      "flags the `import { readFileSync } from 'node:fs'` added to reviewer-core/src/pipeline/run.ts as a violation (reviewer-core must do no I/O except the injected LLMProvider)",
      "flags that runPipeline now returns `deduped` directly, skipping the mandatory `groundFindings()` step before emitting findings",
      "names the rule id `onion-architecture/reviewer-core-purity` for the fs-import finding rather than only describing it in prose",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "assigns a severity (CRITICAL, HIGH or MEDIUM) to each finding",
      "states an explicit Verdict (violations found, no violations in the checks that ran, or not reviewed)",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "does not fabricate a documented-rule violation for a benign rename",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    practices: [
      "reports no violations for the benign rename (or only notes that checks did not apply) — it does not invent a CRITICAL, HIGH or MEDIUM finding",
      "does not fabricate a documented-rule violation where the diff violates none of the checked rules",
      "the Verdict is 'no violations in the checks that ran'",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
];
