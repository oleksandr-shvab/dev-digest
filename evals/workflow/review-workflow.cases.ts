import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md + skills + subagents,
 * loaded via settingSources:["project"]) behaves as documented. Organized by scenario, not by a
 * single artifact, because these behaviors are cross-cutting.
 *
 * What these cases check is the "Session protocol" in the root CLAUDE.md: before a task, read the
 * `insights.md` of every module the task touches. Evidence is the actual Read tool calls and the
 * Agent/Skill tool calls in the trace — never the model's own statement that it "read" or "called".
 *
 * Budget: 5 Claude sessions total.
 *   - 3 × trace     → 1 session each                      = 3
 *   - 1 × activation pair (positive + near-miss negative) = 2
 *
 * `trace` folds several assertions into ONE session (cheaper, coarser) and stops early once its
 * evidence is in — so a dispatch-bearing trace never waits out the nested subagent's full run.
 */
export const cases: WorkflowCase[] = [
  // --- trace (1 session): module insights routing + subagent dispatch, together ----------------
  {
    kind: "trace",
    // The endpoint must not already exist, or the model reviews the existing code inline instead of
    // planning and then dispatching. GET /reviews/:id/export is not in server/src/modules/reviews/routes.ts.
    name: "server task reads server/insights.md AND pulls the architecture-reviewer",
    prompt:
      "Я планую додати новий ендпоінт GET /reviews/:id/export (віддає ревʼю як markdown). Спершу " +
      "звірся з настановами цього репо щодо роботи в server/. Потім ОБОВʼЯЗКОВО запусти сабагента " +
      "architecture-reviewer, щоб він оцінив мій план на відповідність onion-шарам — не рецензуй сам.",
    expectFilesRead: ["server/insights.md"],
    expectSubagents: ["architecture-reviewer"],
    // Read the routed docs, form a plan, THEN dispatch — a small model needs room to reach the
    // dispatch step; at 8 turns it ran out mid-exploration and never delegated.
    maxTurns: 25,
  },

  // --- trace (1 session): reviewer-core "Read When" routing -------------------------------------
  {
    kind: "trace",
    // The prompt must push toward CONSULTING the repo's guidance, not exploring source: phrasing like
    // "розберись, як усе влаштовано" sends the model straight into the code and it never opens the doc.
    name: "reviewer-core task follows CLAUDE.md to reviewer-core/insights.md",
    prompt:
      "Я збираюся змінити review pipeline в reviewer-core. Перш ніж торкатися коду — звірся з " +
      "настановами цього репо (CLAUDE.md) щодо того, що треба прочитати для змін у цьому модулі, " +
      "і прочитай саме ці документи.",
    expectFilesRead: ["reviewer-core/insights.md"],
    maxTurns: 10,
  },

  // --- trace (1 session): the client module has its own insights ---------------------------------
  {
    kind: "trace",
    name: "client task follows CLAUDE.md to client/insights.md",
    prompt:
      "Я збираюся додати нову сторінку в client. Перш ніж торкатися коду — звірся з настановами " +
      "цього репо (CLAUDE.md) щодо того, що треба прочитати для змін у client, і прочитай саме ці документи.",
    expectFilesRead: ["client/insights.md"],
    maxTurns: 10,
  },

  // --- activation pair (2 sessions): positive + near-miss negative ------------------------------
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "Щойно з'ясував, чому pgvector-запит повертав нуль рядків — розмірність колонки не збіглася " +
      "після зміни моделі ембедингів. Хочу це зафіксувати, щоб більше не наступати.",
    skill: "engineering-insights",
    shouldActivate: true,
    // Room to explore the discovery and then invoke the Skill tool; 4 turns cut it off mid-work.
    maxTurns: 15,
    // Whether the model invokes the Skill tool or writes the insight directly is behaviour-shaped
    // (README: "indicative, not blocking"). Record a miss as a warning, don't fail the gate.
    indicative: true,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків.",
    skill: "engineering-insights",
    shouldActivate: false,
    // Same budget as the positive case, so the pair differs only by prompt, not by turn count.
    maxTurns: 15,
  },
];
