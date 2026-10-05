---
name: deprecation-policy
description: Flag a field, route, or export removed outright instead of deprecated with a replacement and a removal date.
---

# Deprecation policy

Flag a diff that deletes a public field, route, or export instead of
deprecating it first:

- a field/route/export deleted with no `@deprecated` marker, no replacement
  named, and no removal target (a version, a date) ever having been given
- a `@deprecated` marker present but incomplete — no replacement, no removal
  target — which is functionally the same as a silent removal for a caller
  who reads the deprecation notice
- an HTTP route removed with no `Deprecation` / `Sunset` response header
  having been served beforehand, and no changelog entry marking the window

For each finding, say what the diff should have done instead: keep the old
name/route working, mark it `@deprecated` with the replacement and a removal
target, and (for routes) serve a `Deprecation` header during the window.

## Good / Bad

**Bad** — the field is just gone:
```ts
export const Pull = z.object({
  // score removed — no notice, no history
});
```

**Good** — deprecated first, with a replacement and a removal target:
```ts
export const Pull = z.object({
  /** @deprecated use `score_v2`. Removed in v3 (see CHANGELOG). */
  score: z.number().optional(),
  score_v2: z.number(),
});
```
```ts
app.get('/pulls/:id/legacy-score', (req, reply) => {
  reply.header('Deprecation', 'true');
  reply.header('Sunset', '2026-12-31');
  // ...
});
```

## Do not flag
- A field/route that was ALREADY marked `@deprecated` in a prior release and
  is now removed AFTER its stated removal target has passed — that's the
  policy working as intended.
- An internal-only symbol with no external caller.
- A brand-new field/route the diff adds (nothing to deprecate yet).
