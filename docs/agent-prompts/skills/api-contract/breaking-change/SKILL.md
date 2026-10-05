---
name: breaking-change
description: Flag a removed or narrowed public API contract — a route, method, param, or exported symbol a caller relies on.
---

# Breaking change

Flag a diff that removes or narrows something a caller of this API already
depends on:

- an HTTP route, method, or path/query param removed, renamed, or made
  required when it was optional
- an exported function, class, or type deleted or renamed with no alias kept
- an accepted enum/union value removed (a caller who used to send it now gets
  rejected)
- a route or symbol moved to a different path/module with the old one gone

For each finding, name the exact caller-visible difference: what request or
import that used to succeed now fails, and how (404, validation error,
`TypeError: X is not a function`).

## Good / Bad

**Bad** — the old route is gone, no redirect, no alias:
```ts
// before: GET /pulls/:id
// after:
app.get('/pull-requests/:id', handler); // GET /pulls/:id now 404s
```

**Good** — the old route stays, the new one is added alongside it:
```ts
app.get('/pulls/:id', handler);        // kept
app.get('/pull-requests/:id', handler); // new, additive
```

## Do not flag
- A brand-new route, param, or export the diff introduces (nothing could
  depend on it yet).
- An enum/union value ADDED, or an optional param/field added.
- An internal-only function or route never exported/exposed outside this
  service.
