import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { app } from '../../server';

// API routes must run on-request, not be prerendered.
export const prerender = false;

/**
 * Bridge: hand every /api/* request to the Hono app.
 *
 * In Astro v6 the Cloudflare bindings come from the `cloudflare:workers`
 * module (the old `locals.runtime.env` was removed), and the execution
 * context lives at `locals.cfContext`.
 */
export const ALL: APIRoute = (context) =>
  app.fetch(context.request, env, context.locals.cfContext);
