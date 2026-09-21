<!--
Keep this short. It is a checklist, not a form: delete what doesn't apply.
The full working agreement is in CONTRIBUTING.md.
-->

## What this changes

<!-- One or two sentences, and the issue it closes: "Closes #123". -->

## Checklist

- [ ] `bun run format`, `bun run lint` and `bun run typecheck` pass locally.
- [ ] Tests for the files this touches pass; the full suites are left to CI.
- [ ] **Permissions:** if this adds, moves or tightens a permission check — a
      `requirePermission()` / `hasPermission()` call site, a `has_permission()`
      in an RLS policy or RPC, or a row in `public.resources` — then
      `src/lib/auth/permission-docs.ts` is updated in this PR
      (`docs/permissions.md`).
- [ ] Schema changes are ordered migrations, and the code that depends on them
      is in this PR.
- [ ] Anything touching personal data, RLS or auth is called out above so it
      gets the review it needs.
