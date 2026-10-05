# Examples

Concrete good/bad patterns for [SKILL.md](SKILL.md). "Good" examples are
paths that already exist in `client/src` — follow them exactly, don't
paraphrase.

## Component folder shape

**Good** — real example, `src/app/agents/_components/AgentCard/`:

```
AgentCard/
├── index.ts              # export { AgentCard, AgentCard as default } from "./AgentCard";
├── AgentCard.tsx          # the component
├── AgentCard.test.tsx     # colocated test
├── constants.ts           # e.g. STATUS_LABELS, POLL_INTERVAL_MS
└── helpers.ts              # e.g. formatLastRunAt()
```

**Bad** — flat dump, no folder, no barrel:

```
components/
├── AgentCard.tsx
├── AgentCardHelpers.ts
├── AgentCardConstants.ts
└── agent-card.module.css
```

Why it's bad: nothing signals these four files belong together except a
naming convention a linter can't enforce; adding a fifth related file
means picking a new ad-hoc name instead of just adding it to the folder.

## Where components live

**Good** — route-scoped component nested exactly where it's used:

```
app/repos/[repoId]/pulls/[number]/_components/
└── RunTraceDrawer/
    ├── index.ts
    ├── RunTraceDrawer.tsx
    └── _components/
        ├── FindingsSection/
        ├── PromptBlock/
        └── ToolCallRow/
```

`RunTraceDrawer` and its sub-components are only ever used on the PR
detail page — they stay nested under that route, not promoted to
`src/components/`.

**Bad** — promoting on the first use "just in case":

```
components/
└── RunTraceDrawer/   # used by exactly one route, nothing else
```

Promote it to `src/components/` the day a *second* route needs it, not
before.

## Constants placement

**Good** — colocated, scoped to the one consumer:

```ts
// src/app/repos/[repoId]/pulls/[number]/_components/VerdictBanner/constants.ts
export const VERDICT_COPY: Record<Verdict, string> = {
  approve: "Looks good",
  request_changes: "Changes requested",
  comment: "Comments only",
};
```

**Bad** — a global grab-bag:

```ts
// src/constants.ts  (repo has no such file — don't create one)
export const VERDICT_COPY = { ... };
export const MAX_UPLOAD_SIZE = 5_000_000;
export const AGENT_POLL_INTERVAL = 4000;
export const TOAST_DURATION = 3000;
```

Why it's bad: four unrelated features now import from one file that
changes for four unrelated reasons — every unrelated change risks a merge
conflict, and nothing tells a reader which constants are actually related.

## Business logic placement

**Good** — component calls a domain hook, hook calls the API client:

```tsx
// FindingsPanel.tsx
function FindingsPanel({ runId }: Props) {
  const { data: findings, isPending } = useFindings(runId); // src/lib/hooks/reviews.ts
  if (isPending) return <Skeleton />;
  return <FindingsList findings={findings} />;
}
```

```ts
// src/lib/hooks/reviews.ts
export function useFindings(runId: string) {
  return useQuery({
    queryKey: ["findings", runId],
    queryFn: () => apiFetch<Finding[]>(`/runs/${runId}/findings`), // src/lib/api.ts
  });
}
```

**Bad** — fetch inline in the component:

```tsx
function FindingsPanel({ runId }: Props) {
  const [findings, setFindings] = useState<Finding[]>([]);
  useEffect(() => {
    fetch(`http://localhost:3001/runs/${runId}/findings`)
      .then((r) => r.json())
      .then(setFindings);
  }, [runId]);
  // ...
}
```

Why it's bad: bypasses `ApiError` normalization, React Query caching, and
the SSE/poll fallback already wired for run status elsewhere in the app —
and makes this component untestable without a real network call.

## Barrel files

**Good** — single-export component barrel (the norm, keep using it):

```ts
// AgentCard/index.ts
export { AgentCard, AgentCard as default } from "./AgentCard";
```

**Good** — small, documented, domain-scoped aggregating barrel:

```ts
// src/lib/hooks/index.ts
/* hooks/ barrel — every React Query hook over the F1/feature APIs.
   Import from "@/lib/hooks" for the platform hooks (settings/repos/pulls/context)
   or from a domain file directly (e.g. "@/lib/hooks/reviews") — both resolve here. */
export * from "./core";
export * from "./agents";
export * from "./reviews";
export * from "./trace";
export * from "./repo-intel";
```

**Bad** — a new app-wide aggregating barrel:

```ts
// src/components/index.ts  (don't create this)
export * from "./app-shell";
export * from "./diff-viewer";
export * from "./page-shell";
export * from "./mermaid-diagram";
export * from "./repo-not-found";
export * from "./showcase";
```

Why it's bad: every consumer now pulls in the whole module graph behind
every export just to import one component, which is exactly the
tree-shaking/circular-import failure mode the "avoid barrel files" sources
in [README.md](README.md) describe. Import `@/components/diff-viewer`
directly instead.

## Splitting a component

**Good** reason to split: `AgentEditor` has a `ConfigTab` that is a
distinct, independently reusable piece with its own state — it's a real
`_components/ConfigTab/` subfolder.

**Bad** reason to split: a 210-line component gets an arbitrary
`AgentCardInner.tsx` carved out with no clearer responsibility than the
original, just to get under a line-count rule. If the split doesn't read
as "a genuinely separate concern," inline it back and address the length a
different way (e.g. extract to `helpers.ts` instead of a child component).
