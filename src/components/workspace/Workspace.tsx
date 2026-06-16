import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import type { ParseResult } from '../../lib/csv/types';
import { parseFile } from '../../lib/csv/parse';
import { profileColumns } from '../../lib/csv/profile';
import { analyzeHealth, type IssueKind } from '../../lib/csv/health';
import {
  applyAllCleanOps,
  applyCleanOp,
  detectCleanOps,
  FIXABLE_ISSUE_KINDS,
  opForIssue,
  summarizeApplied,
  type CleanOpId,
} from '../../lib/csv/clean';
import { buildSchema } from '../../lib/chat/schema';
import QueryProvider from '../providers/QueryProvider';
import { Dropzone } from './Dropzone';
import { DataTable } from './DataTable';
import { FileSummary } from './FileSummary';
import { HealthScore } from './HealthScore';
import { CleanPanel } from './CleanPanel';
import { Chat } from './Chat';

type State =
  | { status: 'idle' }
  | { status: 'parsing'; fileName: string }
  | { status: 'ready'; result: ParseResult }
  | { status: 'error'; message: string };

const XLSX_RE = /\.xlsx?$/i;

// Undo/redo history of the working grid. Each cleaning op pushes a new present;
// the past/future stacks make every transform reversible without recomputing.
interface GridHistory {
  past: ParseResult[];
  present: ParseResult;
  future: ParseResult[];
}

type HistoryAction =
  | { type: 'commit'; next: ParseResult }
  | { type: 'undo' }
  | { type: 'redo' };

function historyReducer(state: GridHistory, action: HistoryAction): GridHistory {
  switch (action.type) {
    case 'commit':
      return { past: [...state.past, state.present], present: action.next, future: [] };
    case 'undo':
      if (state.past.length === 0) return state;
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [state.present, ...state.future],
      };
    case 'redo':
      if (state.future.length === 0) return state;
      return {
        past: [...state.past, state.present],
        present: state.future[0],
        future: state.future.slice(1),
      };
  }
}

export default function Workspace() {
  const [state, setState] = useState<State>({ status: 'idle' });

  const handleFile = useCallback(async (file: File) => {
    if (XLSX_RE.test(file.name)) {
      setState({
        status: 'error',
        message:
          'XLSX support is coming soon. For now, export your spreadsheet to CSV and upload that.',
      });
      return;
    }

    setState({ status: 'parsing', fileName: file.name });
    try {
      // Let the parsing state paint before any heavy synchronous work.
      const result = await parseFile(file);
      if (result.headers.length === 0) {
        setState({
          status: 'error',
          message: 'This file looks empty — no columns were found.',
        });
        return;
      }
      setState({ status: 'ready', result });
    } catch (err) {
      setState({
        status: 'error',
        message:
          err instanceof Error ? err.message : 'Something went wrong reading this file.',
      });
    }
  }, []);

  const reset = () => setState({ status: 'idle' });

  return (
    <div className="min-h-screen">
      <TopNav onReset={state.status === 'ready' ? reset : undefined} />
      <main className="mx-auto w-full max-w-[1280px] px-4 py-8 md:px-8 md:py-12">
        {state.status === 'idle' && <Hero onFile={handleFile} />}
        {state.status === 'parsing' && <ParsingState fileName={state.fileName} />}
        {state.status === 'error' && <ErrorState message={state.message} onRetry={reset} />}
        {state.status === 'ready' && (
          <ReadyState
            key={`${state.result.meta.fileName}|${state.result.meta.fileSize}|${state.result.meta.columnCount}`}
            result={state.result}
            onNewFile={handleFile}
          />
        )}
      </main>
    </div>
  );
}

function TopNav({ onReset }: { onReset?: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between px-4 md:px-8">
        <button
          type="button"
          onClick={onReset}
          disabled={!onReset}
          className="flex items-center gap-2 disabled:cursor-default"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-on-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
              <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="2" />
              <line x1="9" y1="9" x2="9" y2="21" stroke="currentColor" strokeWidth="2" />
            </svg>
          </span>
          <span className="text-display text-xl text-ink">Tabula</span>
        </button>
        <span className="hidden text-sm text-muted sm:block">AI workspace for CSV data</span>
      </div>
    </header>
  );
}

function Hero({ onFile }: { onFile: (file: File) => void }) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-center">
        <span className="inline-flex items-center rounded-full bg-surface-card px-3 py-1 text-xs font-semibold text-muted">
          Upload. Ask. Transform.
        </span>
        <h1 className="text-display mt-5 text-4xl text-ink md:text-6xl">
          The fastest way to clean your CSV data
        </h1>
        <p className="mt-4 text-base text-body md:text-lg">
          Upload a file and Tabula reads it instantly — detecting delimiters, encodings, and
          column types. Cleaning, health checks, and natural-language questions come next.
        </p>
      </div>

      <div className="mt-8">
        <Dropzone onFile={onFile} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FeatureCard color="bg-brand-teal text-on-dark" title="Data Health Score" live />
        <FeatureCard color="bg-brand-pink text-on-primary" title="Ask in plain English" live />
        <FeatureCard color="bg-brand-lavender text-ink" title="One-click cleaning" live />
      </div>
    </div>
  );
}

function FeatureCard({ color, title, live = false }: { color: string; title: string; live?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-2 rounded-xl p-4 ${color}`}>
      <span className="text-sm font-semibold">{title}</span>
      {live ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          Live
        </span>
      ) : (
        <span className="rounded-full bg-black/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
          Soon
        </span>
      )}
    </div>
  );
}

function ParsingState({ fileName }: { fileName: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <span className="h-10 w-10 animate-spin rounded-full border-2 border-hairline border-t-ink" />
      <p className="text-sm text-muted">
        Reading <span className="font-semibold text-ink">{fileName}</span>…
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-lg border border-hairline bg-surface-card p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <p className="text-base text-body-strong">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-active"
      >
        Try another file
      </button>
    </div>
  );
}

function ReadyState({
  result: initial,
  onNewFile,
}: {
  result: ParseResult;
  onNewFile: (file: File) => void;
}) {
  const [history, dispatch] = useReducer(
    historyReducer,
    initial,
    (result): GridHistory => ({ past: [], present: result, future: [] }),
  );
  // Short "what just happened" line, shown until the next history navigation.
  const [status, setStatus] = useState<string | null>(null);

  const result = history.present;
  const profiles = useMemo(() => profileColumns(result), [result]);
  const health = useMemo(() => analyzeHealth(result, profiles), [result, profiles]);
  const schema = useMemo(() => buildSchema(result, profiles, health), [result, profiles, health]);
  const cleanOps = useMemo(() => detectCleanOps(result, profiles), [result, profiles]);

  const applyOp = useCallback(
    (id: CleanOpId) => {
      const { result: next, changed } = applyCleanOp(result, profiles, id);
      if (changed === 0) return;
      dispatch({ type: 'commit', next });
      setStatus(summarizeApplied([{ id, changed }]));
    },
    [result, profiles],
  );

  const applyAll = useCallback(() => {
    const { result: next, applied } = applyAllCleanOps(result, profiles);
    if (applied.length === 0) return;
    dispatch({ type: 'commit', next });
    setStatus(summarizeApplied(applied));
  }, [result, profiles]);

  const fixIssue = useCallback(
    (kind: IssueKind) => {
      const op = opForIssue(kind);
      if (op) applyOp(op.id);
    },
    [applyOp],
  );

  const undo = useCallback(() => {
    dispatch({ type: 'undo' });
    setStatus(null);
  }, []);
  const redo = useCallback(() => {
    dispatch({ type: 'redo' });
    setStatus(null);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className="max-w-md truncate text-display text-2xl text-ink"
            title={result.meta.fileName}
          >
            {result.meta.fileName}
          </h1>
          <p className="mt-1 text-sm text-muted">Parsed and ready to explore.</p>
        </div>
        <NewFileButton onFile={onNewFile} />
      </div>

      <FileSummary result={result} />
      <HealthScore report={health} fixableKinds={FIXABLE_ISSUE_KINDS} onFix={fixIssue} />
      <CleanPanel
        ops={cleanOps}
        onApply={applyOp}
        onApplyAll={applyAll}
        onUndo={undo}
        onRedo={redo}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        status={status}
      />
      <QueryProvider>
        <Chat result={result} profiles={profiles} schema={schema} />
      </QueryProvider>
      <FeatureToolbar />
      <DataTable result={result} profiles={profiles} />
    </div>
  );
}

function NewFileButton({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onFile(e.target.files[0]);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md border border-hairline bg-canvas px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface-card"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        New file
      </button>
    </>
  );
}

// These map to the still-deferred MVP features (#6–#7). Disabled buttons keep
// the roadmap visible in-product without building ahead of the foundation.
// Health Score (#3), AI chat (#4), and one-click cleaning (#5) are now live
// and rendered above.
const UPCOMING = ['Diff', 'Export'];

function FeatureToolbar() {
  return (
    <div className="flex flex-wrap gap-2">
      {UPCOMING.map((label) => (
        <button
          key={label}
          type="button"
          disabled
          title="Coming soon"
          className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-md border border-hairline bg-surface-soft px-3 text-sm font-medium text-muted-soft"
        >
          {label}
          <span className="rounded-full bg-surface-strong px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted">
            Soon
          </span>
        </button>
      ))}
    </div>
  );
}
