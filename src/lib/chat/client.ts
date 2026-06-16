/** Browser-side helpers for the AI chat: the API call and grounded prompts. */

import type { ColumnType } from '../csv/types';
import type { DatasetSchema } from './schema';
import type { ChatRequest, ChatResponse } from './types';

const NUMERIC_TYPES = new Set<ColumnType>(['integer', 'number', 'currency']);
// Free-text/categorical columns make good "group by" targets.
const CATEGORICAL_TYPES = new Set<ColumnType>(['string', 'boolean']);

export async function postChat(req: ChatRequest): Promise<ChatResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    let message = 'Something went wrong reaching the assistant.';
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      /* keep the default message */
    }
    throw new Error(message);
  }

  return (await res.json()) as ChatResponse;
}

/** A few example questions seeded from this file's actual columns. */
export function suggestQuestions(schema: DatasetSchema): string[] {
  const categorical = schema.columns.find((c) => CATEGORICAL_TYPES.has(c.type));
  const numeric = schema.columns.find((c) => NUMERIC_TYPES.has(c.type));

  const out: string[] = [];
  if (categorical) out.push(`Count rows by ${categorical.name}`);
  if (numeric && categorical) out.push(`Which ${categorical.name} has the highest total ${numeric.name}?`);
  else if (numeric) out.push(`What is the average ${numeric.name}?`);
  out.push('Show the first 10 rows');
  if (out.length < 3) out.push('How many rows are there?');

  // De-dupe and cap.
  return [...new Set(out)].slice(0, 3);
}
