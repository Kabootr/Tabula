import type { ReactNode } from 'react';
import type { AvailableOp, CleanOpId } from '../../lib/csv/clean';
import { formatInt } from '../../lib/format';

/**
 * One-click cleaning panel (MVP feature #5). Lists the cleaning operations that
 * have something to do right now (computed by `detectCleanOps`), each with a
 * count and an Apply button, plus "Apply all" and Undo/Redo. All the actual
 * transformation + history lives in the Workspace; this component only renders
 * the available actions and reports clicks upward.
 */

interface Props {
  ops: AvailableOp[];
  onApply: (id: CleanOpId) => void;
  onApplyAll: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Short "what just happened" message, e.g. "Removed 3 duplicate rows." */
  status: string | null;
}

export function CleanPanel({
  ops,
  onApply,
  onApplyAll,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  status,
}: Props) {
  const hasWork = ops.length > 0;

  return (
    <section aria-label="Clean data" className="rounded-xl border border-hairline bg-canvas p-6 md:p-8">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          <BroomIcon />
          Clean
        </span>
        <div className="flex items-center gap-2">
          <HistoryButton label="Undo" onClick={onUndo} disabled={!canUndo}>
            <UndoIcon />
          </HistoryButton>
          <HistoryButton label="Redo" onClick={onRedo} disabled={!canRedo}>
            <RedoIcon />
          </HistoryButton>
        </div>
      </div>

      {hasWork ? (
        <>
          <div className="mt-5 flex items-center justify-between gap-3">
            <p className="text-sm text-body">
              {ops.length} {ops.length === 1 ? 'fix is' : 'fixes are'} available for this data.
            </p>
            <button
              type="button"
              onClick={onApplyAll}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-active"
            >
              <SparkIcon />
              Apply all
            </button>
          </div>

          <ul className="mt-4 flex flex-col gap-3">
            {ops.map(({ op, count }) => (
              <li
                key={op.id}
                className="flex items-center gap-3 rounded-lg border border-hairline bg-surface-card p-4"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-lavender text-ink"
                  aria-hidden="true"
                >
                  <OpIcon id={op.id} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="truncate text-sm font-semibold text-ink">{op.label}</h4>
                    <span className="shrink-0 rounded-full bg-surface-soft px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted">
                      {formatInt(count)} {op.unit === 'row' ? (count === 1 ? 'row' : 'rows') : count === 1 ? 'cell' : 'cells'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{op.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onApply(op.id)}
                  className="inline-flex h-9 shrink-0 items-center rounded-md border border-hairline bg-canvas px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface-soft"
                >
                  Apply
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-5 flex items-center gap-4 rounded-lg bg-brand-teal p-5 text-on-dark">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-on-dark/15">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold">Nothing to clean</p>
            <p className="text-sm text-on-dark-soft">
              This data is already tidy — no automatic fixes are needed.
            </p>
          </div>
        </div>
      )}

      {status && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted">
          <SparkIcon />
          {status}
        </p>
      )}
    </section>
  );
}

function HistoryButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-hairline bg-canvas text-ink transition-colors hover:bg-surface-card disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-canvas"
    >
      {children}
    </button>
  );
}

// --- icons ------------------------------------------------------------------

function OpIcon({ id }: { id: CleanOpId }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (id) {
    case 'trim-whitespace':
      return (
        <svg {...common}>
          <path d="M4 7V5h16v2M9 5v14M7 19h4" />
        </svg>
      );
    case 'remove-duplicate-rows':
      return (
        <svg {...common}>
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M4 16V6a2 2 0 0 1 2-2h10" />
        </svg>
      );
    case 'align-rows':
      return (
        <svg {...common}>
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      );
    case 'remove-empty-rows':
      return (
        <svg {...common}>
          <path d="M3 6h18M3 12h12M3 18h7" />
          <path d="m16 14 4 4m0-4-4 4" />
        </svg>
      );
    case 'normalize-dates':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
  }
}

function BroomIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m13 11 6-6m2-1-3 3M3 21s2-4 6-4 4 2 6 0M3 21l4-4" />
      <path d="M14 6 9.5 10.5" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7v6h6" />
      <path d="M3 13a9 9 0 1 0 3-7.7L3 8" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 7v6h-6" />
      <path d="M21 13a9 9 0 1 1-3-7.7L21 8" />
    </svg>
  );
}
