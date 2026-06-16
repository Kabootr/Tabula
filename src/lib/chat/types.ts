/**
 * Wire contract for the AI chat, shared by the Hono backend and the React
 * client. The client builds a `ChatRequest` (dataset schema + conversation),
 * the backend returns a `ChatResponse`. When the response carries a `query`,
 * the client runs it locally via the `src/lib/csv/query` engine — the server
 * never touches the actual data.
 */

import type { QuerySpec } from '../csv/query';
import type { DatasetSchema } from './schema';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  schema: DatasetSchema;
  /** Full conversation so far, oldest first, ending with the latest user turn. */
  messages: ChatTurn[];
}

export type ChatKind = 'query' | 'answer';

export interface ChatResponse {
  /** `query` → run `query` against the data; `answer` → just show `message`. */
  kind: ChatKind;
  /** Short natural-language reply shown above any result table. */
  message: string;
  /** Present when `kind` is `query`. */
  query?: QuerySpec;
}
