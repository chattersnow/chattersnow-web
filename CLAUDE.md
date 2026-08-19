# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Chatter Snow's public website and operations portal — a Next.js App Router site with a public marketing site and an authenticated admin portal for managing events, donations, inventory, and expenses. The full product spec lives in `docs/technical-spec.md`; read it before implementing any portal/data-model feature, since the current codebase is an early skeleton (public "coming soon" page + basic auth flow) and most of the spec is not yet built.

Keep your replies extremely concise and focus on coveying the key information. No unnecessary fluff, no long code snippets.

## Commands

```bash
npm run dev     # start dev server (Next.js, Turbopack by default)
npm run build   # production build
npm run start   # run production build
npm run lint    # eslint (flat config, eslint-config-next core-web-vitals + typescript)
```

There is no test suite configured yet. TypeScript is checked via `next build` / editor tooling, not a standalone `tsc` script.

## Architecture

- **Stack**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 (via `@tailwindcss/postcss`), Supabase (Postgres + Auth + Storage). The React Compiler is enabled (`next.config.ts` → `reactCompiler: true`).
- **Two audiences, one codebase**: per the spec, public routes must work without auth and must never expose donor/financial/inventory/audit data; the portal requires authentication and (eventually) role checks. The spec recommends splitting routes into `(public)` and `(portal)` route groups — the current tree doesn't do this yet (see below), so when adding routes prefer moving toward that structure rather than mixing public and portal pages in the same group.
- **Auth flow (Supabase)**:
  - `src/lib/supabase/client.ts` — browser client (`createBrowserClient`), used in client components (e.g. login page) for `signInWithPassword` / `signInWithOAuth`.
  - `src/lib/supabase/server.ts` — server client (`createServerClient`) bound to Next's `cookies()`, used in server components/route handlers to read the session (`supabase.auth.getUser()`).
  - `src/app/auth/callback/route.ts` — OAuth callback route; exchanges the `code` param for a session and redirects to `next` (defaults to `/home`).
  - Portal pages are server components that call `createSupabaseServerClient()` and `redirect("/portal/login")` when there's no user — this per-page check is the current authorization mechanism (no middleware yet). Any new protected page needs the same guard until a shared layout/middleware is introduced.
  - `/` → `/home` → `/portal/home` is a redirect chain for authenticated users; `/portal` → `/portal/login` or `/home` mirrors it. Keep this in mind when adding routes so redirect chains don't loop.
- **Environment variables** (`.env.local`, not committed): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. A `SUPABASE_SECRET_KEY` will be needed for trusted server-only operations later — per the spec it must never reach browser code (only use it in server components/route handlers, never in `src/lib/supabase/client.ts` or anything marked `"use client"`).
- **Supabase project config** lives in `supabase/config.toml` (local dev stack config, ports, auth settings). There are no migrations yet (`supabase/migrations/` doesn't exist) — the database schema in section 6 of `docs/technical-spec.md` is a logical model, not implemented. When adding schema, create ordered migrations there and enforce access with Postgres RLS (never rely on frontend route-hiding for authorization — see spec section 7).
- **Styling**: Tailwind v4 with design tokens defined as CSS custom properties in `src/app/globals.css` (`--background`, `--purple`, `--rainbow`, etc.) plus a handful of brand-only component classes under `@layer components` (`app-shell`, `brand-display`, `app-eyebrow`, `app-muted`, `rainbow-accent`) for layout/typography that shadcn doesn't cover. Two font families are wired up in `src/app/layout.tsx`: Geist (body, `--font-geist-sans`) and Bricolage Grotesque (display/brand headings, `--font-bricolage-grotesque`, applied via the `brand-display` class or `font-[family-name:var(--font-bricolage-grotesque)]`).
- **Components (shadcn/ui)**: UI is built with [shadcn/ui](https://ui.shadcn.com) (`components.json`, style `base-nova`, Base UI primitives, `lucide-react` icons). Installed primitives live in `src/components/ui/*` (add more with `npx shadcn@latest add <component>`); the `cn()` class-merge helper is in `src/lib/utils.ts`. shadcn's semantic color vars (`--primary`, `--card`, `--border`, `--muted`, `--destructive`, etc., also in `globals.css`) are pointed at the project's existing brand tokens (`--purple-deep`, `--surface`, `--line`, `--purple-soft`) rather than shadcn's generated defaults, so components stay on-brand automatically. Default to shadcn components (`Button`, `Card`, `Field`/`FieldGroup`, `Alert`, etc.) for new interactive UI instead of hand-rolled markup.
- **Path alias**: `@/*` → `src/*` (see `tsconfig.json`).
