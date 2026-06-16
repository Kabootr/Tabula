import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { ColumnProfile, ParseResult } from '../../lib/csv/types';
import { QueryError, runQuery, type QueryResult } from '../../lib/csv/query';
import type { DatasetSchema } from '../../lib/chat/schema';
import type { ChatResponse, ChatTurn } from '../../lib/chat/types';
import { postChat, suggestQuestions } from '../../lib/chat/client';
import { formatInt } from '../../lib/format';

/**
 * AI chat panel (MVP feature #4). The user asks in plain English; the backend
 * translates the question into a structured query (it never sees the data), and
 * this component runs that query locally against the in-memory grid so every
 * number shown is computed from the real file. Replies that aren't data queries
 * render as plain text.
 */

interface UiMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  result?: QueryResult | null;
  isError?: boolean;
}

interface Props {
  result: ParseResult;
  profiles: ColumnProfile[];
  schema: DatasetSchema;
}

export function Chat({ result, profiles, schema }: Props) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => suggestQuestions(schema), [schema]);
  const nextId = () => ++idRef.current;

  const mutation = useMutation({
    mutationFn: (turns: ChatTurn[]) => postChat({ schema, messages: turns }),
    onSuccess: (response: ChatResponse) => {
      setMessages((prev) => [...prev, buildReply(response, nextId())]);
    },
    onError: (err: unknown) => {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          text: err instanceof Error ? err.message : 'Something went wrong.',
          isError: true,
        },
      ]);
    },
  });

  /** Turn an API response into a rendered assistant message, running any query. */
  function buildReply(response: ChatResponse, id: number): UiMessage {
    if (response.kind === 'query' && response.query) {
      try {
        const queryResult = runQuery(result, profiles, response.query);
        return { id, role: 'assistant', text: response.message, result: queryResult };
      } catch (err) {
        const text =
          err instanceof QueryError
            ? err.message
            : 'I built a query for that, but it failed to run on this file.';
        return { id, role: 'assistant', text, isError: true };
      }
    }
    return { id, role: 'assistant', text: response.message };
  }

  function send(text: string) {
    const trimmed = text.trim();
    if (trimmed === '' || mutation.isPending) return;

    const userMessage: UiMessage = { id: nextId(), role: 'user', text: trimmed };
    const history: ChatTurn[] = [...messages, userMessage].map((m) => ({
      role: m.role,
      content: m.text,
    }));

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    mutation.mutate(history);
  }

  // Keep the latest message in view as the conversation grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, mutation.isPending]);

  const empty = messages.length === 0;

  return (
    <section aria-label="Ask Tabula" className="rounded-xl border border-hairline bg-canvas p-6 md:p-8">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          <SparkIcon />
          Ask Tabula
        </span>
        <span className="text-xs text-muted-soft">Natural-language questions about your data</span>
      </div>

      <div
        ref={scrollRef}
        className="mt-5 flex max-h-[55vh] flex-col gap-4 overflow-y-auto scroll-smooth"
      >
        {empty ? (
          <EmptyState suggestions={suggestions} onPick={send} />
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
        {mutation.isPending && <ThinkingBubble />}
      </div>

      <form
        className="mt-5 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this data…"
          aria-label="Ask a question about your data"
          className="h-11 flex-1 rounded-md border border-hairline bg-canvas px-4 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none"
        />
        <button
          type="submit"
          disabled={mutation.isPending || input.trim() === ''}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-active disabled:cursor-not-allowed disabled:bg-primary-disabled disabled:text-muted-soft"
        >
          <SendIcon />
          <span className="hidden sm:inline">Ask</span>
        </button>
      </form>
    </section>
  );
}

// --- message rendering ------------------------------------------------------

function MessageBubble({ message }: { message: UiMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] rounded-lg rounded-br-sm bg-primary px-4 py-2.5 text-sm text-on-primary">
          {message.text}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p
        className={`max-w-[85%] rounded-lg rounded-bl-sm px-4 py-2.5 text-sm ${
          message.isError ? 'bg-error/10 text-error' : 'bg-surface-card text-body'
        }`}
      >
        {message.text}
      </p>
      {message.result && <QueryResultView result={message.result} />}
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex">
      <div className="inline-flex items-center gap-1 rounded-lg rounded-bl-sm bg-surface-card px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-muted-soft motion-safe:animate-bounce"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyState({
  suggestions,
  onPick,
}: {
  suggestions: string[];
  onPick: (text: string) => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 py-2">
      <p className="text-sm text-body">
        Ask a question about your data and Tabula will answer from the actual rows — try one of
        these:
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="rounded-full border border-hairline bg-surface-soft px-3 py-1.5 text-sm font-medium text-body transition-colors hover:bg-surface-card"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- query result rendering -------------------------------------------------

const RESULT_PREVIEW_ROWS = 50;

function QueryResultView({ result }: { result: QueryResult }) {
  if (result.totalRows === 0) {
    return (
      <div className="rounded-lg border border-hairline bg-surface-soft px-4 py-3 text-sm text-muted">
        No matching rows.
      </div>
    );
  }

  if (result.scalar) {
    return (
      <div className="inline-flex flex-col gap-0.5 rounded-lg border border-hairline bg-surface-soft px-5 py-4">
        <span className="text-display text-3xl tabular-nums text-ink">{result.scalar.value}</span>
        <span className="text-xs font-medium text-muted">{result.scalar.label}</span>
      </div>
    );
  }

  const rows = result.rows.slice(0, RESULT_PREVIEW_ROWS);

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-canvas">
      <div className="max-h-[40vh] overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10">
            <tr>
              {result.columns.map((col, i) => (
                <th
                  key={i}
                  scope="col"
                  className={`border-b border-hairline bg-surface-soft px-3 py-2 text-xs font-semibold text-ink ${
                    i > 0 ? 'border-l' : ''
                  } ${col.numeric ? 'text-right' : ''}`}
                >
                  <span className="block max-w-[16rem] truncate" title={col.name}>
                    {col.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="hover:bg-surface-soft">
                {result.columns.map((col, c) => {
                  const value = row[c] ?? '';
                  return (
                    <td
                      key={c}
                      className={`max-w-[20rem] truncate border-b border-hairline px-3 py-1.5 text-sm text-body ${
                        c > 0 ? 'border-l' : ''
                      } ${col.numeric ? 'text-right tabular-nums' : ''}`}
                      title={value}
                    >
                      {value === '' ? <span className="text-muted-soft">—</span> : value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(result.truncated || rows.length < result.totalRows) && (
        <div className="border-t border-hairline bg-surface-soft px-3 py-2 text-xs text-muted">
          Showing {formatInt(rows.length)} of {formatInt(result.totalRows)} result rows
        </div>
      )}
    </div>
  );
}

// --- icons ------------------------------------------------------------------

function SparkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}
