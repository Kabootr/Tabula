import { useEffect, useRef, useState } from 'react';
import type {
  DimensionKey,
  HealthDimension,
  HealthGrade,
  HealthIssue,
  HealthReport,
  IssueKind,
  Severity,
} from '../../lib/csv/health';
import { formatInt } from '../../lib/format';

/**
 * Data Health Score panel (MVP feature #3) — the showpiece of the workspace.
 * An animated claymation-style gauge, four saturated dimension cards, and a
 * triaged list of fixable issues. All numbers come pre-computed from
 * `analyzeHealth`; this file only renders and animates them.
 */

// --- motion helpers ---------------------------------------------------------

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Ease a value from 0 → target once on mount (cubic ease-out). */
function useCountUp(target: number, duration = 1000): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setValue(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// --- grade + severity theming ----------------------------------------------

interface GradeTheme {
  label: string;
  ring: string; // text-* class — the SVG arc reads it via currentColor
  pill: string;
}

const GRADE_THEME: Record<HealthGrade, GradeTheme> = {
  excellent: { label: 'Excellent', ring: 'text-success', pill: 'bg-success/15 text-success' },
  good: { label: 'Good', ring: 'text-success', pill: 'bg-success/15 text-success' },
  fair: { label: 'Fair', ring: 'text-warning', pill: 'bg-warning/15 text-warning' },
  poor: { label: 'Needs work', ring: 'text-brand-coral', pill: 'bg-brand-coral/15 text-brand-coral' },
  critical: { label: 'Critical', ring: 'text-error', pill: 'bg-error/15 text-error' },
};

interface DimensionTheme {
  card: string;
  track: string;
  fill: string;
  muted: string;
}

// Saturated palette, cycled with no repeats (per DESIGN.md). Teal carries the
// dark voltage card; the rest take dark text on lighter saturations.
const DIMENSION_THEME: Record<DimensionKey, DimensionTheme> = {
  completeness: { card: 'bg-brand-lavender text-ink', track: 'bg-ink/10', fill: 'bg-ink', muted: 'text-ink/60' },
  validity: { card: 'bg-brand-peach text-ink', track: 'bg-ink/10', fill: 'bg-ink', muted: 'text-ink/60' },
  uniqueness: { card: 'bg-brand-ochre text-ink', track: 'bg-ink/10', fill: 'bg-ink', muted: 'text-ink/60' },
  consistency: {
    card: 'bg-brand-teal text-on-dark',
    track: 'bg-on-dark/20',
    fill: 'bg-on-dark',
    muted: 'text-on-dark-soft',
  },
};

interface SeverityTheme {
  label: string;
  dot: string;
  chip: string;
  icon: string;
  bar: string;
}

const SEVERITY_THEME: Record<Severity, SeverityTheme> = {
  high: {
    label: 'High',
    dot: 'bg-error',
    chip: 'bg-error/12 text-error',
    icon: 'bg-error/12 text-error',
    bar: 'bg-error',
  },
  medium: {
    label: 'Medium',
    dot: 'bg-warning',
    chip: 'bg-warning/15 text-warning',
    icon: 'bg-warning/15 text-warning',
    bar: 'bg-warning',
  },
  low: {
    label: 'Low',
    dot: 'bg-muted-soft',
    chip: 'bg-surface-strong text-muted',
    icon: 'bg-surface-strong text-muted',
    bar: 'bg-muted-soft',
  },
};

// --- the gauge --------------------------------------------------------------

const RING_SIZE = 184;
const RING_RADIUS = 78;
const RING_STROKE = 16;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

function HealthRing({ score, grade }: { score: number; grade: HealthGrade }) {
  const theme = GRADE_THEME[grade];
  const display = useCountUp(score);
  const [offset, setOffset] = useState(RING_CIRC);

  useEffect(() => {
    const target = RING_CIRC * (1 - score / 100);
    if (prefersReducedMotion()) {
      setOffset(target);
      return;
    }
    // Next frame so the transition runs from the empty starting state.
    const raf = requestAnimationFrame(() => setOffset(target));
    return () => cancelAnimationFrame(raf);
  }, [score]);

  return (
    <div
      className="relative shrink-0"
      style={{ width: RING_SIZE, height: RING_SIZE }}
      role="img"
      aria-label={`Health score ${score} out of 100, ${theme.label}`}
    >
      <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
        <circle
          className="text-surface-strong"
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={RING_STROKE}
        />
        <circle
          className={`${theme.ring} transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none`}
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_CIRC}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-display text-5xl tabular-nums text-ink">{Math.round(display)}</span>
        <span className="-mt-0.5 text-xs font-semibold tracking-wider text-muted-soft">
          / 100
        </span>
      </div>
    </div>
  );
}

// --- dimension card ---------------------------------------------------------

function DimensionCard({ dim }: { dim: HealthDimension }) {
  const theme = DIMENSION_THEME[dim.key];
  const value = useCountUp(dim.applicable ? dim.score : 0);

  return (
    <div className={`flex flex-col gap-3 rounded-lg p-4 ${theme.card}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider">{dim.label}</span>
        <span className="text-display text-2xl tabular-nums">
          {dim.applicable ? `${Math.round(value)}%` : '—'}
        </span>
      </div>
      <div className={`h-1.5 w-full overflow-hidden rounded-full ${theme.track}`}>
        <div
          className={`h-full rounded-full ${theme.fill}`}
          style={{ width: `${dim.applicable ? value : 0}%` }}
        />
      </div>
      <span className={`text-xs ${theme.muted}`}>
        {dim.applicable
          ? `${formatInt(dim.summary.good)} / ${formatInt(dim.summary.total)} ${dim.summary.noun}`
          : 'Nothing to measure'}
      </span>
    </div>
  );
}

// --- issue card -------------------------------------------------------------

const MAX_CHIPS = 4;

interface FixProps {
  /** Issue kinds that have a one-click fix; their cards show a Fix button. */
  fixableKinds?: ReadonlySet<IssueKind>;
  /** Apply the one-click fix for an issue. */
  onFix?: (kind: IssueKind) => void;
}

function IssueCard({ issue, fixableKinds, onFix }: { issue: HealthIssue } & FixProps) {
  const sev = SEVERITY_THEME[issue.severity];
  const overflow = issue.columns.length - MAX_CHIPS;
  const fixable = onFix != null && fixableKinds?.has(issue.kind) === true;

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-hairline bg-surface-card p-5">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${sev.icon}`}
          aria-hidden="true"
        >
          <IssueIcon kind={issue.kind} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="truncate text-sm font-semibold text-ink">{issue.title}</h4>
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${sev.chip}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${sev.dot}`} />
              {sev.label}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-body">{issue.detail}</p>
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-display text-2xl tabular-nums text-ink">
            {formatInt(issue.count)}
          </span>
          <span className="text-xs font-medium text-muted">
            {issue.unit === 'row' ? 'rows' : issue.unit === 'value' ? 'values' : 'cells'}
          </span>
        </div>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-strong">
          <div
            className={`h-full rounded-full ${sev.bar}`}
            style={{ width: `${Math.max(4, Math.min(100, issue.share * 100))}%` }}
          />
        </div>
      </div>

      {issue.columns.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {issue.columns.slice(0, MAX_CHIPS).map((col) => (
            <span
              key={col.index}
              className="inline-flex max-w-[12rem] items-center gap-1 rounded-full bg-surface-soft px-2 py-0.5 text-[11px] font-medium text-body"
              title={`${col.name}: ${formatInt(col.count)}`}
            >
              <span className="max-w-[8rem] truncate">{col.name || `Column ${col.index + 1}`}</span>
              <span className="tabular-nums text-muted-soft">{formatInt(col.count)}</span>
            </span>
          ))}
          {overflow > 0 && (
            <span className="inline-flex items-center rounded-full bg-surface-soft px-2 py-0.5 text-[11px] font-medium text-muted-soft">
              +{overflow} more
            </span>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-hairline-soft pt-3">
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" />
          </svg>
          {issue.fix}
        </span>
        {fixable ? (
          <button
            type="button"
            onClick={() => onFix?.(issue.kind)}
            className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-on-primary transition-colors hover:bg-primary-active"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Fix
          </button>
        ) : (
          <span className="rounded-full bg-surface-strong px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted">
            Soon
          </span>
        )}
      </div>
    </div>
  );
}

function IssueIcon({ kind }: { kind: IssueKind }) {
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
  switch (kind) {
    case 'missing-values':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 3v18" />
          <path d="m14 13 4 4m0-4-4 4" />
        </svg>
      );
    case 'duplicate-rows':
      return (
        <svg {...common}>
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M4 16V6a2 2 0 0 1 2-2h10" />
        </svg>
      );
    case 'invalid-emails':
      return (
        <svg {...common}>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m2 7 10 6 10-6" />
        </svg>
      );
    case 'invalid-phones':
      return (
        <svg {...common}>
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      );
    case 'invalid-dates':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case 'type-mismatch':
      return (
        <svg {...common}>
          <path d="M12 2v20M2 12h20" />
          <path d="m5 5 14 14" />
        </svg>
      );
    case 'whitespace':
      return (
        <svg {...common}>
          <path d="M4 7V5h16v2M9 5v14M7 19h4" />
        </svg>
      );
    case 'ragged-rows':
      return (
        <svg {...common}>
          <path d="M3 6h18M3 12h12M3 18h7" />
        </svg>
      );
  }
}

// --- clean state ------------------------------------------------------------

function SpotlessState({ rows }: { rows: number }) {
  return (
    <div className="flex items-center gap-4 rounded-lg bg-brand-teal p-5 text-on-dark">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-on-dark/15">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <div>
        <p className="text-sm font-semibold">Spotless — no issues found</p>
        <p className="text-sm text-on-dark-soft">
          We scanned {formatInt(rows)} {rows === 1 ? 'row' : 'rows'} and everything checks out.
        </p>
      </div>
    </div>
  );
}

// --- panel ------------------------------------------------------------------

export function HealthScore({
  report,
  fixableKinds,
  onFix,
}: { report: HealthReport } & FixProps) {
  const theme = GRADE_THEME[report.grade];
  const { issues } = report;
  const ref = useRef<HTMLElement>(null);

  return (
    <section ref={ref} aria-label="Data health score" className="motion-safe:animate-rise">
      <div className="rounded-xl border border-hairline bg-canvas p-6 md:p-8">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            Data Health Score
          </span>
          <span className="text-xs text-muted-soft">
            {issues.length === 0
              ? 'All clear'
              : `${issues.length} ${issues.length === 1 ? 'issue' : 'issues'} found`}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[auto_1fr] lg:items-center">
          <div className="flex flex-col items-center gap-4 text-center">
            <HealthRing score={report.score} grade={report.grade} />
            <div className="flex flex-col items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${theme.pill}`}
              >
                {theme.label}
              </span>
              <p className="max-w-xs text-sm text-body">{report.verdict}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {report.dimensions.map((dim) => (
              <DimensionCard key={dim.key} dim={dim} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6">
        {issues.length === 0 ? (
          <SpotlessState rows={report.totals.rows} />
        ) : (
          <>
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h3 className="text-display text-lg text-ink">What we found</h3>
              <span className="text-xs text-muted-soft">Sorted by severity</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {issues.map((issue, i) => (
                <div
                  key={issue.kind}
                  className="flex motion-safe:animate-rise"
                  style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}
                >
                  <IssueCard issue={issue} fixableKinds={fixableKinds} onFix={onFix} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
