/**
 * One-click cleaning engine (MVP feature #5). Pure and dependency-free like the
 * rest of `src/lib/csv` — every operation reads a `ParseResult` (+ derived
 * `ColumnProfile[]`) and returns a *new* `ParseResult`, never mutating the
 * input. The UI keeps a history of these snapshots so cleaning is fully
 * undoable.
 *
 * Each op is deterministic and intentionally conservative: it only touches what
 * it can fix without guessing (it trims, dedupes, aligns, drops blanks, and
 * reformats dates it can parse unambiguously — it never invents replacement
 * data). The set mirrors the fixable issues `analyzeHealth` reports, so applying
 * an op makes the matching Health Score issue go away.
 */

import { profileColumns } from './profile';
import type { IssueKind } from './health';
import type { ColumnProfile, ParseResult } from './types';

export type CleanOpId =
  | 'trim-whitespace'
  | 'remove-duplicate-rows'
  | 'align-rows'
  | 'remove-empty-rows'
  | 'normalize-dates';

export interface CleanOp {
  id: CleanOpId;
  /** Button label, imperative (e.g. "Trim whitespace"). */
  label: string;
  /** One-line description of what it does. */
  description: string;
  /** Whether `count`/`changed` measures cells or rows. */
  unit: 'cell' | 'row';
  /** The Health Score issue this op resolves, if it maps to one. */
  issue?: IssueKind;
  /** How many cells/rows this op would affect right now (0 = nothing to do). */
  detect(result: ParseResult, profiles: ColumnProfile[]): number;
  /** Apply the op, returning a fresh grid and how many cells/rows changed. */
  apply(result: ParseResult, profiles: ColumnProfile[]): CleanResult;
}

export interface CleanResult {
  result: ParseResult;
  /** Cells or rows actually changed (matches the op's `unit`). */
  changed: number;
}

export interface AvailableOp {
  op: CleanOp;
  count: number;
}

export interface AppliedOp {
  id: CleanOpId;
  changed: number;
}

// --- shared helpers ---------------------------------------------------------

/**
 * Build a new `ParseResult` from replacement rows, keeping the original meta but
 * recomputing the row count and ragged-row tally so health/profile stay honest.
 */
function withRows(base: ParseResult, rows: string[][]): ParseResult {
  const cols = base.headers.length;
  let ragged = 0;
  for (const row of rows) if (row.length !== cols) ragged++;
  return {
    ...base,
    rows,
    meta: { ...base.meta, rowCount: rows.length, raggedRows: ragged },
  };
}

const isEmptyRow = (row: string[]): boolean => row.every((c) => (c ?? '').trim() === '');

// Row signature for exact-duplicate detection. JSON encodes cell boundaries
// unambiguously, so ["a","b"] and ["ab"] never collide.
const rowSignature = (row: string[]): string => JSON.stringify(row);

// --- date normalization -----------------------------------------------------
// Reformats dates this can parse to a single real calendar date into ISO
// `YYYY-MM-DD`. Ambiguous slash dates (where both D/M and M/D are valid and
// differ) and values carrying a time component are left untouched on purpose.

function isRealYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= daysInMonth[m - 1];
}

const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const SLASH_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/;

/** ISO `YYYY-MM-DD` if the value is an unambiguous, real date; otherwise null. */
function toIsoDate(value: string): string | null {
  const v = value.trim();
  if (v === '') return null;

  const iso = ISO_DATE_ONLY.exec(v);
  if (iso) {
    const y = +iso[1];
    const m = +iso[2];
    const d = +iso[3];
    return isRealYmd(y, m, d) ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
  }

  const slash = SLASH_DATE.exec(v);
  if (slash) {
    const a = +slash[1];
    const b = +slash[2];
    let year = +slash[3];
    if (year < 100) year += year < 50 ? 2000 : 1900;
    const monthFirst = isRealYmd(year, a, b); // a = month, b = day
    const dayFirst = isRealYmd(year, b, a); // a = day, b = month
    if (monthFirst && dayFirst && a !== b) return null; // ambiguous → leave as-is
    if (monthFirst) return `${year}-${pad2(a)}-${pad2(b)}`;
    if (dayFirst) return `${year}-${pad2(b)}-${pad2(a)}`;
    return null; // not a real date
  }

  return null; // ISO-with-time or unrecognized → leave unchanged
}

function dateColumns(profiles: ColumnProfile[]): number[] {
  const out: number[] = [];
  for (const p of profiles) if (p.type === 'date') out.push(p.index);
  return out;
}

// --- operations -------------------------------------------------------------

const trimWhitespace: CleanOp = {
  id: 'trim-whitespace',
  label: 'Trim whitespace',
  description: 'Remove leading and trailing spaces from every cell.',
  unit: 'cell',
  issue: 'whitespace',
  detect(result) {
    let n = 0;
    for (const row of result.rows) {
      for (const cell of row) if (cell != null && cell.trim() !== cell) n++;
    }
    return n;
  },
  apply(result) {
    let changed = 0;
    const rows = result.rows.map((row) => {
      let copy: string[] | null = null;
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (cell == null) continue;
        const trimmed = cell.trim();
        if (trimmed !== cell) {
          if (copy === null) copy = row.slice();
          copy[c] = trimmed;
          changed++;
        }
      }
      return copy ?? row;
    });
    return { result: withRows(result, rows), changed };
  },
};

const removeDuplicateRows: CleanOp = {
  id: 'remove-duplicate-rows',
  label: 'Remove duplicate rows',
  description: 'Delete rows that are exact copies of an earlier row.',
  unit: 'row',
  issue: 'duplicate-rows',
  detect(result) {
    const seen = new Set<string>();
    let duplicates = 0;
    for (const row of result.rows) {
      const sig = rowSignature(row);
      if (seen.has(sig)) duplicates++;
      else seen.add(sig);
    }
    return duplicates;
  },
  apply(result) {
    const seen = new Set<string>();
    const rows: string[][] = [];
    for (const row of result.rows) {
      const sig = rowSignature(row);
      if (seen.has(sig)) continue;
      seen.add(sig);
      rows.push(row);
    }
    return { result: withRows(result, rows), changed: result.rows.length - rows.length };
  },
};

const alignRows: CleanOp = {
  id: 'align-rows',
  label: 'Align ragged rows',
  description: 'Pad short rows and trim extra cells to match the header width.',
  unit: 'row',
  issue: 'ragged-rows',
  detect(result) {
    const cols = result.headers.length;
    let n = 0;
    for (const row of result.rows) if (row.length !== cols) n++;
    return n;
  },
  apply(result) {
    const cols = result.headers.length;
    let changed = 0;
    const rows = result.rows.map((row) => {
      if (row.length === cols) return row;
      changed++;
      if (row.length > cols) return row.slice(0, cols);
      const padded = row.slice();
      while (padded.length < cols) padded.push('');
      return padded;
    });
    return { result: withRows(result, rows), changed };
  },
};

const removeEmptyRows: CleanOp = {
  id: 'remove-empty-rows',
  label: 'Remove empty rows',
  description: 'Delete rows where every cell is blank.',
  unit: 'row',
  detect(result) {
    let n = 0;
    for (const row of result.rows) if (isEmptyRow(row)) n++;
    return n;
  },
  apply(result) {
    const rows = result.rows.filter((row) => !isEmptyRow(row));
    return { result: withRows(result, rows), changed: result.rows.length - rows.length };
  },
};

const normalizeDates: CleanOp = {
  id: 'normalize-dates',
  label: 'Normalize dates',
  description: 'Convert recognized dates to ISO format (YYYY-MM-DD).',
  unit: 'cell',
  detect(result, profiles) {
    const cols = dateColumns(profiles);
    if (cols.length === 0) return 0;
    let n = 0;
    for (const row of result.rows) {
      for (let i = 0; i < cols.length; i++) {
        const cell = row[cols[i]];
        if (cell == null) continue;
        const iso = toIsoDate(cell);
        if (iso !== null && iso !== cell) n++;
      }
    }
    return n;
  },
  apply(result, profiles) {
    const cols = dateColumns(profiles);
    if (cols.length === 0) return { result, changed: 0 };
    let changed = 0;
    const rows = result.rows.map((row) => {
      let copy: string[] | null = null;
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        const cell = row[c];
        if (cell == null) continue;
        const iso = toIsoDate(cell);
        if (iso !== null && iso !== cell) {
          if (copy === null) copy = row.slice();
          copy[c] = iso;
          changed++;
        }
      }
      return copy ?? row;
    });
    return { result: withRows(result, rows), changed };
  },
};

// --- registry + public API --------------------------------------------------

export const CLEAN_OPS: readonly CleanOp[] = [
  trimWhitespace,
  removeDuplicateRows,
  alignRows,
  removeEmptyRows,
  normalizeDates,
];

// Order for "Apply all": tidy cells and shapes first, dedupe last so that
// trimming/normalizing first lets near-duplicates collapse together.
const APPLY_ALL_ORDER: readonly CleanOpId[] = [
  'trim-whitespace',
  'align-rows',
  'remove-empty-rows',
  'normalize-dates',
  'remove-duplicate-rows',
];

/** Health Score issue kinds that have a one-click fix. */
export const FIXABLE_ISSUE_KINDS: ReadonlySet<IssueKind> = new Set(
  CLEAN_OPS.map((op) => op.issue).filter((k): k is IssueKind => k != null),
);

/** The cleaning op that resolves a given Health Score issue, if any. */
export function opForIssue(kind: IssueKind): CleanOp | undefined {
  return CLEAN_OPS.find((op) => op.issue === kind);
}

/** The ops with something to do right now, in registry order. */
export function detectCleanOps(result: ParseResult, profiles: ColumnProfile[]): AvailableOp[] {
  const out: AvailableOp[] = [];
  for (const op of CLEAN_OPS) {
    const count = op.detect(result, profiles);
    if (count > 0) out.push({ op, count });
  }
  return out;
}

/** Run a single op by id. Throws on an unknown id (a programming error). */
export function applyCleanOp(
  result: ParseResult,
  profiles: ColumnProfile[],
  id: CleanOpId,
): CleanResult {
  const op = CLEAN_OPS.find((o) => o.id === id);
  if (!op) throw new Error(`Unknown clean operation: ${id}`);
  return op.apply(result, profiles);
}

/**
 * Apply every applicable op in a safe order, re-profiling between steps so each
 * op sees the grid the previous one produced. Returns the final grid plus a
 * per-op tally of what changed.
 */
export function applyAllCleanOps(
  result: ParseResult,
  profiles: ColumnProfile[],
): { result: ParseResult; applied: AppliedOp[] } {
  let current = result;
  let currentProfiles = profiles;
  const applied: AppliedOp[] = [];

  for (const id of APPLY_ALL_ORDER) {
    const op = CLEAN_OPS.find((o) => o.id === id);
    if (!op || op.detect(current, currentProfiles) === 0) continue;
    const res = op.apply(current, currentProfiles);
    if (res.changed === 0) continue;
    current = res.result;
    currentProfiles = profileColumns(current);
    applied.push({ id, changed: res.changed });
  }

  return { result: current, applied };
}

// Past-tense phrases for the "what just happened" status line.
const APPLIED_PHRASE: Record<CleanOpId, (n: number) => string> = {
  'trim-whitespace': (n) => `trimmed ${n.toLocaleString()} ${n === 1 ? 'cell' : 'cells'}`,
  'remove-duplicate-rows': (n) =>
    `removed ${n.toLocaleString()} duplicate ${n === 1 ? 'row' : 'rows'}`,
  'align-rows': (n) => `aligned ${n.toLocaleString()} ${n === 1 ? 'row' : 'rows'}`,
  'remove-empty-rows': (n) => `removed ${n.toLocaleString()} empty ${n === 1 ? 'row' : 'rows'}`,
  'normalize-dates': (n) => `normalized ${n.toLocaleString()} ${n === 1 ? 'date' : 'dates'}`,
};

/** Human summary of one or more applied ops, e.g. "Trimmed 12 cells and removed 3 duplicate rows." */
export function summarizeApplied(applied: AppliedOp[]): string {
  const parts = applied.filter((a) => a.changed > 0).map((a) => APPLIED_PHRASE[a.id](a.changed));
  if (parts.length === 0) return '';
  const joined =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`;
}
