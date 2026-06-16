# CLAUDE.md

Guidance for working in this repository. See [prd.md](prd.md) for the full product spec and [DESIGN.md](DESIGN.md) for the design system.

## What this is

**Tabula** — an AI-native workspace for CSV data. Users upload a CSV (or TSV/XLSX), then ask questions, clean, compare, and transform the data in natural language instead of writing Excel formulas or SQL.

Positioning: *"The fastest way to clean, understand, and transform CSV data using AI."* — **Upload. Ask. Transform.**

## Current state vs. vision

This repo is an early **Astro + React + Cloudflare** scaffold. The PRD describes the full product; most of it is **not built yet**. Don't assume a feature or library exists — check before referencing it.

**Installed today** (see [package.json](package.json)):
- Astro 6, React 19 (`@astrojs/react`), Cloudflare adapter (`@astrojs/cloudflare`), Wrangler 4
- **Tailwind 4** via `@tailwindcss/vite` (no `tailwind.config` file — v4 is CSS-first; config lives in [src/styles/global.css](src/styles/global.css))
- **TanStack Query 5** (`@tanstack/react-query`)
- **Hono 4** — the backend API, mounted inside the Astro worker (see "Backend" below)

**Planned but NOT yet installed** (from the PRD's architecture — add as you build):
- TanStack Table (frontend)
- Cloudflare R2 (file storage), D1 (database)
- DuckDB WASM (in-browser data engine)
- Cloudflare Workers AI (AI chat / operations)
- Better Auth (authentication)

When you introduce one of these, prefer the versions and patterns the PRD implies, and wire bindings through [wrangler.jsonc](wrangler.jsonc).

## Built so far (Phase 0 — foundation)

The foundation is in place; later MVP features build on it. Still **check before assuming** anything beyond this list exists.

- **Design system** — DESIGN.md tokens mirrored into [src/styles/global.css](src/styles/global.css) via Tailwind `@theme` (cream canvas, brand palette, radius scale, Inter). Use the generated utilities (`bg-canvas`, `text-ink`, `rounded-xl`, `bg-brand-pink`, …); never inline hex.
- **CSV engine** (client-side, pure, dependency-free) in [src/lib/csv/](src/lib/csv/): `parse.ts` (RFC 4180 parser, delimiter auto-detect, UTF-8/UTF-16 BOM handling), `profile.ts` (per-column type detection), `types.ts` (the `ParseResult` / `ColumnProfile` data model **every feature reads from**).
- **Workspace UI** — one React island, [src/components/workspace/Workspace.tsx](src/components/workspace/Workspace.tsx), composed of `Dropzone`, `DataTable` (smart preview), `FileSummary`, `TypeBadge`. Rendered from [src/pages/index.astro](src/pages/index.astro) via `client:load`.
- Deferred MVP features (#3–#7) are surfaced in-product as disabled "Soon" buttons rather than built ahead.

Still client-only: no R2/D1/AI bindings or DuckDB yet — add them when a feature needs them (keeps the backend thin, per "Backend" below). The `/api/ping` Hono stub is the only backend route.

## Commands

Package manager is **pnpm** (see `pnpm-lock.yaml`). Node `>=22.12.0`.

```bash
pnpm dev              # astro dev — local dev server
pnpm build            # astro build — production build to ./dist
pnpm preview          # astro preview — preview the build
pnpm generate-types   # wrangler types — regenerate worker-configuration.d.ts after editing bindings
```

There is no test or lint script configured yet.

## Architecture & conventions

- **Astro islands**: pages are `.astro`; interactive UI ships as React islands. Add `client:*` directives only where interactivity is needed.
- **Deploy target is Cloudflare Workers** via `@astrojs/cloudflare`. Server code runs in the Workers runtime, not Node — avoid Node-only APIs unless a compat flag is set. `global_fetch_strictly_public` is already enabled.
- **Bindings** (R2, D1, AI, etc.) are declared in [wrangler.jsonc](wrangler.jsonc); run `pnpm generate-types` after changing them. They populate the global ambient `Env` type in `worker-configuration.d.ts`.
- **TypeScript** extends `astro/tsconfigs/strict` — keep things strictly typed. JSX is `react-jsx`.
- **Styling**: Tailwind 4, CSS-first. Global styles + theme tokens go in [src/styles/global.css](src/styles/global.css) (imported once in [src/layouts/Layout.astro](src/layouts/Layout.astro)). There is no `tailwind.config.js` — define `@theme` tokens in CSS. Mirror the [DESIGN.md](DESIGN.md) palette/type scale into `@theme` rather than inventing new values.
- **Data fetching**: TanStack Query. Wrap any data-fetching React island with [QueryProvider](src/components/providers/QueryProvider.tsx) (e.g. `<QueryProvider client:load>`); the shared client lives in [src/lib/query-client.ts](src/lib/query-client.ts). Because islands hydrate independently, each one needs its own provider at its root.

## Backend (Hono inside the Astro worker)

**There is one Worker and one deploy — not a monorepo, not a second service.** The Hono API runs *inside* the worker that `@astrojs/cloudflare` already produces:

- The whole API is a single Hono app in [src/server/index.ts](src/server/index.ts), with `basePath('/api')`. Add feature routers there via `app.route('/upload', ...)`.
- A catch-all Astro endpoint, [src/pages/api/[...path].ts](src/pages/api/%5B...path%5D.ts), forwards every `/api/*` request to `app.fetch(...)`.
- **Astro v6 binding access**: get `env` from `import { env } from "cloudflare:workers"` and the execution context from `context.locals.cfContext`. The old `Astro.locals.runtime.env` was **removed** in v6 — don't use it.
- Hono routes read bindings as `c.env.R2` / `c.env.DB` / `c.env.AI` (typed by the global `Env`).

Rationale: the API only serves this frontend, and DuckDB WASM does the heavy data work in the browser, so the backend stays thin (uploads → R2, persistence → D1, AI proxying → Workers AI). Splitting it into its own Worker would add two configs + internal networking for no benefit. If that changes later, the self-contained `app` object moves to its own Worker with minimal churn.

- **Design system**: [DESIGN.md](DESIGN.md) defines colors, typography, and component styling (a "claymation-meets-data" aesthetic). Follow its tokens when building UI rather than inventing new values.

## MVP scope (build order from the PRD)

1. ✅ File upload (CSV/TSV drag-drop, delimiter + encoding detection) — done; XLSX still deferred
2. ✅ Smart preview (row/column preview, data-type detection) — done
3. Data Health Score (missing values, duplicates, invalid emails/phones/dates)
4. AI chat (natural-language → data operations)
5. One-click cleaning (dedupe, trim, normalize dates, fix case, etc.)
6. CSV diff (added/deleted/modified rows)
7. Export (CSV/XLSX/JSON)

V2 (AI transformations, DuckDB SQL workspace, charts, reports) and V3 (workflow builder, scheduled jobs, API platform, teams) come later — don't build ahead of the MVP unless asked.

## Notes

- The project `name` is `tabula` in both [package.json](package.json) and [wrangler.jsonc](wrangler.jsonc). The worker had to be named before the build/dev server would run.
- This repo was scaffolded from a sibling project (`csv-cleaner`); if `node_modules` ever errors with `ERR_PNPM_UNEXPECTED_VIRTUAL_STORE`, remove `node_modules` and run `pnpm install` fresh.
- Keep [prd.md](prd.md) as the source of truth for product decisions; reflect material changes there.
