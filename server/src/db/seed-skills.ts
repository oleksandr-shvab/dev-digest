/**
 * Built-in skills seeded for the Test Quality Reviewer (see
 * `server/specs/skills.md`). Skills are text-only review rubrics; each is
 * injected into the agent's prompt as its own block, in this order.
 *
 * `flaky-tests` is deliberately NOT here: it is imported through the UI from
 * `docs/agent-prompts/fixtures/flaky-tests.zip` to exercise the import path.
 */
export interface SeedSkill {
  name: string;
  description: string;
  type: 'rubric';
  body: string;
}

export const UNCOVERED_BRANCHES_SKILL: SeedSkill = {
  name: 'uncovered-branches',
  description: 'Every new branch in the diff needs a test that drives it.',
  type: 'rubric',
  body: `Enumerate the branches the diff adds or changes, then check each one against the tests in the diff.

Branches to enumerate:
- \`if\` / \`else if\` / \`else\`, ternaries, \`switch\` cases and the \`default\`
- early returns and guard clauses
- \`catch\` blocks and error-mapping paths
- \`??\`, \`||\`, \`?.\` fallbacks that change behaviour when the left side is nullish/falsy

Flag a branch when no added or changed test reaches it. A test that only exercises the happy path does not cover the guard that protects it. Name the branch (file:line of the production code) and the input that would drive it.

Do not flag pre-existing untested branches the diff does not touch. Severity: a security, money or authorization branch with no test is CRITICAL; an ordinary business-logic branch is WARNING.`,
};

export const CORNER_CASES_SKILL: SeedSkill = {
  name: 'corner-cases',
  description: 'Boundary and degenerate inputs that the tests skip.',
  type: 'rubric',
  body: `For each changed function, list the inputs at its edges and check whether a test uses them:
- empty / single-element / many; zero, negative and maximum numbers
- the exact threshold value (\`>\` vs \`>=\`), off-by-one on limits, pagination and slicing
- null / undefined / empty string / whitespace-only; malformed or oversized payloads
- duplicates, unicode and case differences, time-zone and clock edges (midnight, DST, month end)
- repeated or concurrent calls where the code claims to be idempotent

Report the specific missing input and what the code would do with it (the mechanism), not a generic "add edge cases". A boundary bug the tests would let through is a WARNING; on a money, auth or data-integrity path it is CRITICAL.`,
};

export const OVER_MOCKING_SKILL: SeedSkill = {
  name: 'over-mocking',
  description: 'Tests whose mocks replace the behaviour they claim to verify.',
  type: 'rubric',
  body: `Flag tests that cannot fail for the right reason:
- the unit under test is itself mocked or stubbed
- every collaborator is mocked and the only assertion is \`toHaveBeenCalled\` on a mock (a tautology)
- the code's correctness depends on real behaviour (SQL constraints, serialization, query filters) but the test mocks the DB even though the repo has an integration harness for it
- assertions on implementation details (call counts, private helpers, call order) rather than observable results

For each finding say what real behaviour is hidden by the mock and what a non-mocked assertion would check. A test that asserts nothing meaningful on a critical path is CRITICAL; over-mocking elsewhere is WARNING.`,
};

/** In the order they are linked to the Test Quality Reviewer. */
export const TEST_QUALITY_SKILLS: SeedSkill[] = [
  UNCOVERED_BRANCHES_SKILL,
  CORNER_CASES_SKILL,
  OVER_MOCKING_SKILL,
];
