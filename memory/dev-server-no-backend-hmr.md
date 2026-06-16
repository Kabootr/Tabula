---
name: dev-server-no-backend-hmr
description: astro dev does not hot-reload the Hono backend (src/server/**); restart pnpm dev after editing API routes
metadata:
  type: project
---

`astro dev` (pnpm dev) does NOT hot-reload the server-side Hono modules under `src/server/**` — the `app` Hono instance is module-cached and Astro v6 doesn't invalidate it on file change. After editing any backend route (e.g. `src/server/chat.ts`), the running dev server keeps executing the STALE module until you restart `pnpm dev`.

**Why:** This cost real debugging time on the AI chat (#4) feature — a fixed bug appeared "still broken" because the dev server was running old code, not because the fix was wrong.

**How to apply:** When backend behavior doesn't change after editing `src/server/**`, restart `pnpm dev` before assuming the code is wrong. A reliable tell: add a temporary field to a JSON error/response and curl the endpoint — if the new field is absent from the body, the module is stale. Frontend React islands and `src/lib/**` do hot-reload normally; this only affects the Hono API.
