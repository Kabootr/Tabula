/**
 * AI chat router (MVP feature #4). This is a pure translator: it takes the user's
 * question plus the dataset *schema* (never the data) and asks Workers AI to emit
 * a single JSON object — either a `QuerySpec` for Tabula to run locally, or a
 * plain answer. All real computation happens client-side in `src/lib/csv/query`,
 * so the model can't hallucinate numbers.
 */

import { Hono } from 'hono';
import type { ChatRequest, ChatResponse, ChatTurn } from '../lib/chat/types';
import type { DatasetSchema } from '../lib/chat/schema';

// Fast, capable instruct model with solid JSON adherence.
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// Bound the prompt: only the most recent turns are sent for follow-up context.
const MAX_TURNS = 10;

function describeSchema(schema: DatasetSchema): string {
  const lines = schema.columns.map((col) => {
    const samples = col.samples.length > 0 ? ` — e.g. ${col.samples.map((s) => `"${s}"`).join(', ')}` : '';
    return `- "${col.name}" (${col.type}, ${col.filledPct}% filled)${samples}`;
  });

  let text = `File: ${schema.fileName} — ${schema.rowCount.toLocaleString()} rows × ${schema.columnCount} columns\nColumns:\n${lines.join('\n')}`;
  if (schema.health) {
    text += `\nData health: ${schema.health.score}/100 (${schema.health.grade}).`;
    if (schema.health.topIssues.length > 0) {
      text += ` Notable issues: ${schema.health.topIssues.join('; ')}`;
    }
  }
  return text;
}

function systemPrompt(schema: DatasetSchema): string {
  return `You are Tabula's data assistant. The user uploaded a tabular file and asks questions about it in plain English. You do NOT have the data itself — only the schema below. Never compute answers or invent numbers; instead translate each question into a single JSON query that Tabula runs locally against the full dataset.

# Dataset
${describeSchema(schema)}

# How to respond
Reply with exactly ONE JSON object and nothing else — no prose, no markdown, no code fences. Use one of two shapes:

A) Answerable from the data:
{"kind":"query","message":"<one short sentence describing what you did>","query":{ ...QuerySpec... }}

B) Greetings, clarifications, or anything the data can't answer:
{"kind":"answer","message":"<your reply>"}

# QuerySpec fields (all optional)
- "filters": array of {"column","op","value"}. op is one of: =, !=, >, >=, <, <=, contains, notContains, startsWith, endsWith, isEmpty, isNotEmpty. Omit "value" for isEmpty/isNotEmpty. Filters are AND-combined.
- "groupBy": array of column names to group by.
- "aggregates": array of {"fn","column","as"}. fn is one of: count, sum, avg, min, max. Omit "column" for count of rows. "as" is the output label.
- "select": array of column names to show when NOT aggregating. Omit for all columns.
- "distinct": true to drop duplicate output rows.
- "sort": array of {"column","dir"} where column is an output column/label and dir is "asc" or "desc".
- "limit": max number of output rows.

# Rules
- Use column names EXACTLY as they appear in the schema. Never invent columns or values.
- "how many"/"count" → aggregates with fn "count".
- "X by Y" or "per Y" → groupBy ["Y"] plus the implied aggregate (count if none stated).
- "top/most/highest/largest N" → sort desc + limit N. "bottom/lowest/least" → sort asc + limit N.
- Text filtering is case-insensitive; use "contains" for partial matches.
- Keep "message" to one short sentence and never put specific numbers in it (you don't know them).

# Examples
User: how many rows?
{"kind":"query","message":"Counting all rows.","query":{"aggregates":[{"fn":"count","as":"rows"}]}}
User: count customers by country
{"kind":"query","message":"Counting rows grouped by country.","query":{"groupBy":["Country"],"aggregates":[{"fn":"count","as":"count"}],"sort":[{"column":"count","dir":"desc"}]}}
User: which city generated the most revenue?
{"kind":"query","message":"Summing revenue per city, highest first.","query":{"groupBy":["City"],"aggregates":[{"fn":"sum","column":"Revenue","as":"total revenue"}],"sort":[{"column":"total revenue","dir":"desc"}],"limit":1}}
User: show inactive customers
{"kind":"query","message":"Filtering to rows where status is inactive.","query":{"filters":[{"column":"Status","op":"=","value":"inactive"}]}}`;
}

/** Pull the first balanced JSON object out of a possibly-noisy model reply. */
function extractJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = trimmed.indexOf('{');
  if (start === -1) throw new Error('no JSON object found');

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return JSON.parse(trimmed.slice(start, i + 1));
    }
  }
  // Unbalanced — last-ditch parse of the remainder.
  return JSON.parse(trimmed.slice(start));
}

/**
 * Normalize whatever `AI.run` returns into something we can parse. Text models
 * usually return `{ response: string }`, but depending on the model/runtime
 * `response` can already be a parsed object (or the payload may be shaped
 * differently) — so we surface a structured object directly when present and
 * otherwise fall back to a string to extract JSON from.
 */
function readModelOutput(out: unknown): { parsed: unknown; text: string } {
  if (typeof out === 'string') return { parsed: undefined, text: out };
  if (out && typeof out === 'object') {
    const record = out as Record<string, unknown>;
    const resp = record.response;
    if (typeof resp === 'string') return { parsed: undefined, text: resp };
    if (resp && typeof resp === 'object') return { parsed: resp, text: JSON.stringify(resp) };
    if (typeof record.text === 'string') return { parsed: undefined, text: record.text };
    return { parsed: undefined, text: JSON.stringify(out) };
  }
  return { parsed: undefined, text: String(out ?? '') };
}

function normalizeResponse(parsed: unknown, fallbackText: string): ChatResponse {
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const message = typeof obj.message === 'string' ? obj.message : fallbackText;
    if (obj.kind === 'query' && obj.query && typeof obj.query === 'object') {
      return { kind: 'query', message, query: obj.query as ChatResponse['query'] };
    }
    return { kind: 'answer', message: message || "I'm not sure how to answer that." };
  }
  return { kind: 'answer', message: fallbackText || "I couldn't process that." };
}

export const chatRoutes = new Hono<{ Bindings: Env }>();

chatRoutes.post('/', async (c) => {
  if (!c.env.AI) {
    return c.json(
      { error: 'AI is not configured in this environment. Run with the Workers AI binding available.' },
      503,
    );
  }

  let body: ChatRequest;
  try {
    body = await c.req.json<ChatRequest>();
  } catch {
    return c.json({ error: 'Invalid request body.' }, 400);
  }

  const { schema, messages } = body ?? {};
  if (!schema || !Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: 'A dataset schema and at least one message are required.' }, 400);
  }

  const turns: ChatTurn[] = messages
    .slice(-MAX_TURNS)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content }));

  if (turns.length === 0 || turns[turns.length - 1].role !== 'user') {
    return c.json({ error: 'The latest message must come from the user.' }, 400);
  }

  let model: { parsed: unknown; text: string };
  try {
    const out = await c.env.AI.run(MODEL, {
      messages: [{ role: 'system', content: systemPrompt(schema) }, ...turns],
      max_tokens: 1024,
      temperature: 0.1,
    });
    model = readModelOutput(out);
  } catch (err) {
    console.error('Workers AI call failed', err);
    return c.json({ error: 'The AI service is unavailable right now. Please try again.' }, 502);
  }

  const text = model.text.trim();
  if (model.parsed === undefined && text === '') {
    return c.json<ChatResponse>({ kind: 'answer', message: "I didn't get a response — try rephrasing your question." });
  }

  try {
    const obj = model.parsed !== undefined ? model.parsed : extractJsonObject(text);
    return c.json<ChatResponse>(normalizeResponse(obj, text));
  } catch {
    // Model replied in prose rather than JSON — surface it as a plain answer.
    return c.json<ChatResponse>({ kind: 'answer', message: text || "I couldn't process that." });
  }
});
