# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Chatter Snow's public website and operations portal — a Next.js App Router site with a public marketing site and an authenticated admin portal for managing events, donations, inventory, expenses, programs, and a content/community calendar. The full product spec lives in `docs/technical-spec.md`; read it before implementing any portal/data-model feature. The portal is well past skeleton stage: it has built-out administration, finance (donations, expenses, reimbursements, revenue), governance, inventory, events, people, programs, volunteers, and content/community-calendar modules (`src/app/portal/(app)/*`), backed by 100+ Supabase migrations covering donations/inventory, events, event sponsors/expenses/revenue, people, role-scoped and data-driven RLS, giveaways, governance (board members, meetings, agendas, resolutions), volunteers, programs, reimbursements, nonprofit-status tracking, and the content/community calendar.

Keep your replies extremely concise and focus on coveying the key information. No unnecessary fluff, no long code snippets.

## Commands

```bash
bun run dev         # start dev server (Next.js, Turbopack by default)
bun run build       # production build
bun run start       # run production build
bun run lint        # eslint (flat config, eslint-config-next core-web-vitals + typescript)
bun run typecheck   # next typegen && tsc --noEmit
bun run test        # unit tests (bun test), excludes e2e/**
bun run test:e2e    # Playwright e2e tests
bun run format      # prettier --write .
bun run format:check
```

Husky runs a pre-commit hook (`.husky/pre-commit`). CI extends coverage over these same checks.

## Ticket workflow

Issues are tracked on the `ChatterWeb` GitHub Project (owner `chattersnow`, project number `1`) via its `Status` field. Keep status in sync with `gh project item-edit`:

- When starting work on a ticket (e.g. creating/checking out its branch), move the linked issue's `Status` to `In progress`.
- When a PR for that ticket is opened, move it to `In review`.

## Architecture

- **Stack**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 (via `@tailwindcss/postcss`), Supabase (Postgres + Auth + Storage). The React Compiler is enabled (`next.config.ts` → `reactCompiler: true`).
- **Two audiences, one codebase**: per the spec, public routes must work without auth and must never expose donor/financial/inventory/audit data; the portal requires authentication and role checks. The route tree already follows the spec's recommended split: public pages live under `src/app/(public)/*` (home, about, contact, events, gears) and portal pages under `src/app/portal/(app)/*` (home, entry, administration, calendar, events, finance, governance, inventory, people, programs, volunteers) — keep new routes in the matching group.
- **Auth flow (Supabase)**:
  - `src/lib/supabase/client.ts` — browser client (`createBrowserClient`), used in client components (e.g. login page) for `signInWithPassword` / `signInWithOAuth`.
  - `src/lib/supabase/server.ts` — server client (`createServerClient`) bound to Next's `cookies()`, used in server components/route handlers to read the session (`supabase.auth.getUser()`).
  - `src/app/auth/callback/route.ts` — OAuth callback route; exchanges the `code` param for a session and redirects to `next` (defaults to `/home`).
  - Portal pages are server components that call `createSupabaseServerClient()` and `redirect("/portal/login")` when there's no user — this per-page check is the current authorization mechanism (no middleware yet). Any new protected page needs the same guard until a shared layout/middleware is introduced.
  - `/` → `/home` is unrelated to auth: `/home` is the public marketing homepage (under the `(public)` route group), and `/` is just a thin redirect to it. The authenticated redirect chain is separate: `/portal` → `/portal/login` (signed out) or `/portal/entry` → `/portal/home` (signed in). Keep this in mind when adding routes so redirect chains don't loop.
- **Environment variables** (`.env.local`, not committed): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL` (app origin, used to build links from Server Actions where there's no `window.location`), and `SUPABASE_SECRET_KEY` (service-role key, for trusted server-only operations — never reaches browser code; only read in `src/lib/supabase/admin.ts`, which is `server-only`-guarded and must only be imported from server components/route handlers/Server Actions, never from `src/lib/supabase/client.ts` or anything marked `"use client"`).
- **Supabase project config** lives in `supabase/config.toml` (local dev stack config, ports, auth settings). `supabase/migrations/` has 18 ordered migrations implementing the schema from section 6 of `docs/technical-spec.md` — donations/inventory, events, event attendance/sponsors/expenses, people, roles + role-scoped RLS, and secured donation/distribution RPCs. When adding schema, keep creating ordered migrations there and enforce access with Postgres RLS (never rely on frontend route-hiding for authorization — see spec section 7).
- **Styling**: Tailwind v4 with design tokens defined as CSS custom properties in `src/app/globals.css` (`--background`, `--purple`, `--rainbow`, etc.) plus a handful of brand-only component classes under `@layer components` (`app-shell`, `brand-display`, `app-eyebrow`, `app-muted`, `rainbow-accent`) for layout/typography that shadcn doesn't cover. Two font families are wired up in `src/app/layout.tsx`: Geist (body, `--font-geist-sans`) and Bricolage Grotesque (display/brand headings, `--font-bricolage-grotesque`, applied via the `brand-display` class or `font-[family-name:var(--font-bricolage-grotesque)]`).
- **Components (shadcn/ui)**: UI is built with [shadcn/ui](https://ui.shadcn.com) (`components.json`, style `base-nova`, Base UI primitives, `lucide-react` icons). Installed primitives live in `src/components/ui/*` (add more with `npx shadcn@latest add <component>`); the `cn()` class-merge helper is in `src/lib/utils.ts`. shadcn's semantic color vars (`--primary`, `--card`, `--border`, `--muted`, `--destructive`, etc., also in `globals.css`) are pointed at the project's existing brand tokens (`--purple-deep`, `--surface`, `--line`, `--purple-soft`) rather than shadcn's generated defaults, so components stay on-brand automatically. Default to shadcn components (`Button`, `Card`, `Field`/`FieldGroup`, `Alert`, etc.) for new interactive UI instead of hand-rolled markup.
- **Path alias**: `@/*` → `src/*` (see `tsconfig.json`).
