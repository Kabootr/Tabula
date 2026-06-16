import { useCallback, useRef, useState } from 'react';
import type { ColumnProfile, ParseResult } from '../../lib/csv/types';
import { parseFile } from '../../lib/csv/parse';
import { profileColumns } from '../../lib/csv/profile';
import { Dropzone } from './Dropzone';
import { DataTable } from './DataTable';
import { FileSummary } from './FileSummary';

type State =
  | { status: 'idle' }
  | { status: 'parsing'; fileName: string }
  | { status: 'ready'; result: ParseResult; profiles: ColumnProfile[] }
  | { status: 'error'; message: string };

const XLSX_RE = /\.xlsx?$/i;

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
      const profiles = profileColumns(result);
      setState({ status: 'ready', result, profiles });
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
          <ReadyState result={state.result} profiles={state.profiles} onNewFile={handleFile} />
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
        <FeatureCard color="bg-brand-teal text-on-dark" title="Data Health Score" />
        <FeatureCard color="bg-brand-pink text-on-primary" title="Ask in plain English" />
        <FeatureCard color="bg-brand-lavender text-ink" title="One-click cleaning" />
      </div>
    </div>
  );
}

function FeatureCard({ color, title }: { color: string; title: string }) {
  return (
    <div className={`flex items-center justify-between gap-2 rounded-xl p-4 ${color}`}>
      <span className="text-sm font-semibold">{title}</span>
      <span className="rounded-full bg-black/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
        Soon
      </span>
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
  result,
  profiles,
  onNewFile,
}: {
  result: ParseResult;
  profiles: ColumnProfile[];
  onNewFile: (file: File) => void;
}) {
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

// These map to the deferred MVP features (#3–#7). Disabled buttons keep the
// roadmap visible in-product without building ahead of the foundation.
const UPCOMING = ['Health Score', 'Ask AI', 'Clean', 'Diff', 'Export'];

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
