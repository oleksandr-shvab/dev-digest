---
name: response-schema
description: Flag a change to a response's shape — a removed/renamed field, a type change, or altered nullability.
---

# Response schema

Flag a diff that changes the SHAPE of data a caller already reads or sends:

- a response field removed or renamed (a caller reading the old name now
  gets `undefined`)
- a field's type changed (`number` → `string`, an object → an array)
- a response field that was always present becoming optional or nullable
- a request field that was optional becoming required (a caller who omitted
  it now gets a validation error)

For each finding, quote the field's before/after shape from the diff (the
Zod schema or DTO type) and say what a caller reading/sending the old shape
would now get.

## Good / Bad

**Bad** — the field is renamed, not added alongside:
```ts
// before
export const Pull = z.object({ created_at: z.string() });
// after — a caller reading `created_at` now gets undefined
export const Pull = z.object({ createdAt: z.string() });
```

**Good** — the old field stays, the new one is added:
```ts
export const Pull = z.object({
  created_at: z.string(), // kept for existing callers
  createdAt: z.string(),  // new, camelCase alias
});
```

## Do not flag
- A NEW optional field added to a response.
- A field's internal implementation changing while its wire shape (name,
  type, nullability) stays identical.
- A request field narrowed from `optional` to `optional().default(...)` —
  still accepts the same inputs.
