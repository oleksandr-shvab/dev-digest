import type { SkillCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

// Fixtures are grouped by layer; each group maps to a real repo path so the model sees the paths
// the skill's rules are written against (`server/src/modules/...`, `reviewer-core/src/...`).
const REPO_PATH: Record<string, string> = {
  modules: "server/src/modules",
  adapters: "server/src/adapters",
  vendor: "server/src/vendor",
  "reviewer-core": "reviewer-core/src",
};

function files(names: string[]): string {
  return names
    .map((name) => {
      const [group, ...rest] = name.split("/");
      return `### ${REPO_PATH[group]}/${rest.join("/")}\n\`\`\`ts\n${fx(name)}\n\`\`\``;
    })
    .join("\n\n");
}

// "quality" cases run with no tools (skillTask injects SKILL.md as the system prompt and nothing
// else), so the code under review is inlined and the answer is the review text itself.
function review(task: string, names: string[]): string {
  return `${task}\n\nThe files are inlined below, with their repo path above each one. Give the review as your answer (do not ask for tool access). For each problem give the file, the line, why it is a problem, the fix and a severity.\n\n${files(names)}`;
}

const SEVERITY = "every problem in the main findings list has an explicit severity level (notes outside that list do not count)";

export const cases: SkillCase[] = [
  {
    name: "tags module: finds the route, adapter and service-query violations and leaves the repository alone",
    kind: "quality",
    prompt: review(
      "I added a new tags module to the backend (server/src/modules/tags: routes, service, repository). Before I open the PR, check whether it fits how our backend is supposed to be layered.",
      ["modules/tags/routes.ts", "modules/tags/service.ts", "modules/tags/repository.ts"],
    ),
    grounding: ["routes.ts", "service.ts"],
    practices: [
      "flags the DELETE /tags/:id handler in routes.ts for querying or deleting through container.db / the Drizzle schema directly instead of calling TagService",
      "flags service.ts for importing and constructing the concrete OctokitGitHubClient adapter, and says to use the GitHubClient port from the container (container.github()) instead",
      "flags syncLabelsFromGitHub in service.ts for building a Drizzle query on t.tags itself instead of calling a TagRepository method",
      "does not report repository.ts as a layering violation (the Drizzle usage there is correct)",
      SEVERITY,
    ],
    threshold: 0.8,
    maxTurns: 10,
  },
  {
    name: "reviewer-core: finds fs, outward import and direct SDK client; leaves the pure budget helper alone",
    kind: "quality",
    prompt: review(
      "Here is a change to reviewer-core: run.ts now pulls repo notes and can add a short summary of the findings, and I split severity sorting into its own file. Review the changed files only for architecture/dependency problems, not style.",
      [
        "reviewer-core/review/run.ts",
        "reviewer-core/review/repo-notes.ts",
        "reviewer-core/review/budget.ts",
        "reviewer-core/output/severity.ts",
      ],
    ),
    grounding: ["repo-notes.ts", "severity.ts"],
    practices: [
      "flags repo-notes.ts (or its call from run.ts) for reading the filesystem via node:fs inside reviewer-core, which must have no I/O beyond the injected LLMProvider",
      "flags output/severity.ts for importing from server/src (an outer package) into reviewer-core",
      "flags run.ts for constructing an OpenAI client (new OpenAI / process.env.OPENAI_API_KEY) instead of using the injected input.llm LLMProvider",
      "does not report budget.ts as an architecture violation",
      SEVERITY,
    ],
    threshold: 0.8,
    maxTurns: 10,
  },
  {
    name: "spend cap: finds adapter doing DB and policy, anemic service, route logic; leaves the repository alone",
    kind: "quality",
    prompt: review(
      "I built a monthly LLM spend cap: a budgeted Anthropic provider, a usage module with routes/service/repository, and an estimate endpoint. Does the code sit in the right layers? Tell me what is in the wrong place and where it should move.",
      [
        "adapters/llm/budgeted-anthropic.ts",
        "modules/usage/routes.ts",
        "modules/usage/service.ts",
        "modules/usage/repository.ts",
      ],
    ),
    grounding: ["budgeted-anthropic.ts", "routes.ts"],
    practices: [
      "flags budgeted-anthropic.ts for an adapter that reads or writes the database (Drizzle schema, agentRuns, notifications, llmUsage) and/or makes budget decisions (cap check, 80% warning, retries) that belong in a service or repository",
      "flags UsageService as an anemic service whose methods only pass through to the repository while the real decisions live elsewhere",
      "flags the /usage/estimate handler in routes.ts for holding business logic (the pricing table, cost estimate or allowed/warn decision) or for importing and constructing the concrete TiktokenTokenizer adapter",
      "says concretely where the moved logic should go: the cap and estimate decisions into UsageService (or another service) and persistence into the repository",
      "does not report UsageRepository (repository.ts) as a layering violation",
      SEVERITY,
    ],
    threshold: 0.8,
    maxTurns: 10,
  },
  {
    name: "digest module: finds foreign repository/service construction and foreign table queries; allows pure helper import",
    kind: "quality",
    prompt: review(
      "I added a weekly digest module to the backend (server/src/modules/digest: routes, service, repository). It summarises which PRs got reviewed this week, the critical findings per PR and the files with the most findings. Review it for how well it fits our backend architecture before I open the PR.",
      ["modules/digest/routes.ts", "modules/digest/service.ts", "modules/digest/repository.ts"],
    ),
    grounding: ["service.ts", "repository.ts"],
    practices: [
      "flags service.ts for importing ReviewRepository from the reviews module and constructing it with new, and says to use container.reviewRepo instead",
      "flags service.ts for importing AgentsService from the agents module and constructing it with new, and says to use container.agentsRepo (or another container seam) instead",
      "flags repository.ts (reviewedPullIds and/or topFindingFiles) for querying the reviews and findings tables, which the reviews module owns, and says to move those queries into ReviewRepository behind container.reviewRepo",
      "does not flag the import of pickLatestReviewPerAgent from ../reviews/smart-diff/build.js as a violation (importing another module's pure helper is allowed)",
      SEVERITY,
    ],
    threshold: 0.8,
    maxTurns: 10,
  },
  {
    name: "alerts module (13 files): finds violations hidden in helpers, a leaking port and a module cycle",
    kind: "quality",
    prompt: review(
      "I added an alerts feature to the backend: a new alerts module (server/src/modules/alerts) that posts to Slack when a PR review has blocking findings, a Notifier port in vendor/shared with a Slack adapter, and a small incidents/stats.ts in the neighbouring incidents module that the alerts rules use. Review the change for architecture problems before I open the PR.",
      [
        "modules/alerts/routes.ts",
        "modules/alerts/service.ts",
        "modules/alerts/delivery.ts",
        "modules/alerts/recipients.ts",
        "modules/alerts/rules.ts",
        "modules/alerts/repository.ts",
        "modules/alerts/constants.ts",
        "modules/alerts/formatters.ts",
        "modules/alerts/dedupe.ts",
        "modules/alerts/types.ts",
        "modules/incidents/stats.ts",
        "adapters/slack/slack-notifier.ts",
        "vendor/shared/notifier.ts",
      ],
    ),
    grounding: ["delivery.ts", "recipients.ts", "notifier.ts"],
    practices: [
      "flags modules/alerts/delivery.ts for importing and constructing the concrete SlackNotifier adapter, and says to get the Notifier port from the container (a container getter) instead",
      "states the import chain for the delivery.ts finding (service.ts imports delivery.ts, which imports SlackNotifier), or says delivery.ts is application-layer code because service.ts imports it",
      "flags modules/alerts/recipients.ts for importing drizzle-orm and the db schema and querying container.db directly, and says the query belongs in AlertRepository",
      "flags the Notifier port in vendor/shared/notifier.ts for importing and returning @slack/web-api types (ChatPostMessageResponse, ConversationsListResponse), and says the adapter should map them to types the port owns",
      "reports the dependency cycle between the alerts and incidents modules (alerts/rules.ts imports incidents/stats.ts, which imports alerts/constants.ts and alerts/types.ts) and proposes moving the shared thresholds and types to a place neither module owns",
      "flags modules/alerts/routes.ts for importing and constructing the concrete SlackNotifier in the /alerts/test-send handler",
      "does not report modules/alerts/repository.ts as a violation",
      "does not report adapters/slack/slack-notifier.ts as a violation for importing the Slack SDK",
      "does not report service.ts's use of container.reviewRepo (getPull, reviewsForPull) or its import of pickLatestReviewPerAgent as a module-boundary violation",
      "does not report formatters.ts, dedupe.ts, constants.ts or types.ts in the alerts module as violations",
      SEVERITY,
    ],
    threshold: 0.8,
    maxTurns: 10,
  },
  {
    name: "changelog module: finds impure helpers imported across modules; allows pure helpers, types and container seams",
    kind: "quality",
    prompt: review(
      "I added a changelog module to the backend (server/src/modules/changelog: routes, service, helpers, repository). It drafts a release-notes entry for a reviewed PR from its diff, the issues it links and its blocking findings, and lets us publish it. Review it for how well it fits our backend architecture before I open the PR.",
      [
        "modules/changelog/routes.ts",
        "modules/changelog/service.ts",
        "modules/changelog/helpers.ts",
        "modules/changelog/repository.ts",
      ],
    ),
    practices: [
      "flags service.ts for importing loadDiff from the reviews module, a function that takes the container and does git and database work, as an impure cross-module import, and says to reach that behaviour through the reviews module's own service or a container seam (or move it to a shared place) instead of importing it",
      "flags service.ts for importing fetchLinkedIssues from the reviews module, a function that calls the GitHub client, as an impure cross-module import",
      "flags helpers.ts for importing resolveFeatureModel from the settings module, a function that reads the settings table through container.db, as an impure cross-module import hidden in a helper file",
      "does not report the imports of classifyFile or pickLatestReviewPerAgent from the reviews module, or the type-only import of PullRow, as violations (pure helpers and types may be imported across modules)",
      "does not report service.ts's use of container.reviewRepo (getPull, getRepo, reviewsForPull) as a violation",
      "does not report routes.ts or repository.ts as violations",
      SEVERITY,
    ],
    threshold: 0.8,
    maxTurns: 10,
  },
];
