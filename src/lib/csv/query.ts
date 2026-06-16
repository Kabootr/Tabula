/**
 * Structured query engine (powers AI chat, MVP feature #4). Pure and
 * dependency-free like the rest of `src/lib/csv`. The AI never sees the full
 * data and never computes answers itself — it only translates a natural-language
 * question into a `QuerySpec`, and this engine executes that spec deterministically
 * against the in-memory grid. So every number the user sees is computed locally
 * from the real data, never hallucinated.
 *
 * The spec is a small, SQL-shaped contract: filter → group/aggregate (or project)
 * → sort → limit. It's intentionally narrow — enough to answer the MVP's example
 * questions ("count customers by country", "which city made the most revenue",
 * "show inactive customers") without becoming a query language of its own.
 */

import type { ColumnProfile, ColumnType, ParseResult } from './types';

export type FilterOp =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'isEmpty'
  | 'isNotEmpty';

export interface QueryFilter {
  column: string;
  op: FilterOp;
  /** Omitted for isEmpty / isNotEmpty. */
  value?: string | number;
}

export type AggFn = 'count' | 'sum' | 'avg' | 'min' | 'max';

export interface QueryAggregate {
  fn: AggFn;
  /** Omitted for count(*) — counting rows rather than a column's values. */
  column?: string;
  /** Output column label; defaulted sensibly when absent. */
  as?: string;
}

export interface QuerySort {
  column: string;
  dir?: 'asc' | 'desc';
}

/** The structured operation the AI emits and this engine runs. */
export interface QuerySpec {
  /** AND-combined row filters. */
  filters?: QueryFilter[];
  /** Group rows by these columns before aggregating. */
  groupBy?: string[];
  /** Measures to compute. With no groupBy, produces a single summary row. */
  aggregates?: QueryAggregate[];
  /** Columns to project when not aggregating. Empty/omitted = all columns. */
  select?: string[];
  /** Drop duplicate output rows (projection mode only). */
  distinct?: boolean;
  sort?: QuerySort[];
  /** Keep only the first N output rows (e.g. "top 10"). */
  limit?: number;
}

export interface QueryColumn {
  name: string;
  numeric: boolean;
}

export interface QueryResult {
  columns: QueryColumn[];
  /** Display rows (already capped — see `truncated`). */
  rows: string[][];
  /** Total result rows the query produced, before the display cap. */
  totalRows: number;
  /** True when more rows were produced than are rendered. */
  truncated: boolean;
  /** Set when the result is a single cell — the UI shows it as a big number. */
  scalar: { label: string; value: string } | null;
}

/** Thrown for specs that can't run (e.g. a column the data doesn't have). */
export class QueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryError';
  }
}

const NUMERIC_TYPES: ReadonlySet<ColumnType> = new Set(['integer', 'number', 'currency']);

// At most this many rows are rendered; the full count is kept in `totalRows`.
const MAX_RESULT_ROWS = 500;

/** Parse a cell into a number, tolerating currency symbols and thousands commas. */
function toNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  const v = raw.trim();
  if (v === '') return null;
  const cleaned = v
    .replace(/[$€£¥₹]/g, '')
    .replace(/(?:usd|eur|gbp|inr|jpy|cad|aud)\s*$/i, '')
    .replace(/,/g, '')
    .trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Format a computed numeric measure for display (integers stay clean). */
function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Resolve a column name to its index, tolerantly (trim + case-insensitive),
 * since the name comes from the model. Throws a user-facing error if missing.
 */
function makeResolver(headers: string[]): (name: string) => number {
  const byName = new Map<string, number>();
  headers.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, i);
  });
  return (name: string) => {
    const idx = byName.get(String(name ?? '').trim().toLowerCase());
    if (idx === undefined) {
      throw new QueryError(`I couldn't find a column called “${name}” in this file.`);
    }
    return idx;
  };
}

function passesFilter(cell: string | undefined, f: QueryFilter, numeric: boolean): boolean {
  const c = (cell ?? '').trim();

  switch (f.op) {
    case 'isEmpty':
      return c === '';
    case 'isNotEmpty':
      return c !== '';
  }

  const rawValue = f.value;
  const strValue = String(rawValue ?? '').trim();

  // Ordering and equality on numeric columns compare numbers when both sides parse.
  if (numeric && (f.op === '>' || f.op === '>=' || f.op === '<' || f.op === '<=' || f.op === '=' || f.op === '!=')) {
    const a = toNumber(c);
    const b = typeof rawValue === 'number' ? rawValue : toNumber(strValue);
    if (a !== null && b !== null) {
      switch (f.op) {
        case '>':
          return a > b;
        case '>=':
          return a >= b;
        case '<':
          return a < b;
        case '<=':
          return a <= b;
        case '=':
          return a === b;
        case '!=':
          return a !== b;
      }
    }
    // Fall through to string handling for '='/'!=' when a side isn't numeric;
    // ordering against non-numeric data simply doesn't match.
    if (f.op !== '=' && f.op !== '!=') return false;
  }

  const lc = c.toLowerCase();
  const lv = strValue.toLowerCase();
  switch (f.op) {
    case '=':
      return lc === lv;
    case '!=':
      return lc !== lv;
    case '>':
      return c.localeCompare(strValue) > 0;
    case '>=':
      return c.localeCompare(strValue) >= 0;
    case '<':
      return c.localeCompare(strValue) < 0;
    case '<=':
      return c.localeCompare(strValue) <= 0;
    case 'contains':
      return lc.includes(lv);
    case 'notContains':
      return !lc.includes(lv);
    case 'startsWith':
      return lc.startsWith(lv);
    case 'endsWith':
      return lc.endsWith(lv);
    default:
      return false;
  }
}

interface ResolvedAgg {
  fn: AggFn;
  index: number; // -1 for count(*)
  label: string;
  numeric: boolean;
}

function defaultAggLabel(fn: AggFn, columnName: string | null): string {
  if (fn === 'count') return columnName ? `count of ${columnName}` : 'count';
  return `${fn} of ${columnName ?? 'value'}`;
}

function computeAgg(agg: ResolvedAgg, groupRows: string[][]): string {
  if (agg.fn === 'count') {
    if (agg.index < 0) return groupRows.length.toLocaleString();
    let n = 0;
    for (const row of groupRows) if ((row[agg.index] ?? '').trim() !== '') n++;
    return n.toLocaleString();
  }

  // sum / avg / min / max
  if (agg.numeric || agg.fn === 'sum' || agg.fn === 'avg') {
    const nums: number[] = [];
    for (const row of groupRows) {
      const n = toNumber(row[agg.index]);
      if (n !== null) nums.push(n);
    }
    if (nums.length === 0) return '—';
    switch (agg.fn) {
      case 'sum':
        return formatNumber(nums.reduce((a, b) => a + b, 0));
      case 'avg':
        return formatNumber(nums.reduce((a, b) => a + b, 0) / nums.length);
      case 'min':
        return formatNumber(Math.min(...nums));
      case 'max':
        return formatNumber(Math.max(...nums));
    }
  }

  // min/max on a non-numeric column → lexicographic over non-empty values.
  const vals = groupRows.map((r) => (r[agg.index] ?? '').trim()).filter((v) => v !== '');
  if (vals.length === 0) return '—';
  vals.sort((a, b) => a.localeCompare(b));
  return agg.fn === 'min' ? vals[0] : vals[vals.length - 1];
}

function sortRows(rows: string[][], columns: QueryColumn[], sort: QuerySort[]): void {
  // Resolve each sort key against the *output* columns (group keys, measures, or
  // projected columns). Unresolvable keys are skipped — sorting is non-critical.
  const keys = sort
    .map((s) => {
      const idx = columns.findIndex(
        (c) => c.name.trim().toLowerCase() === String(s.column ?? '').trim().toLowerCase(),
      );
      return idx < 0 ? null : { idx, dir: s.dir === 'desc' ? -1 : 1, numeric: columns[idx].numeric };
    })
    .filter((k): k is { idx: number; dir: number; numeric: boolean } => k !== null);

  if (keys.length === 0) return;

  rows.sort((ra, rb) => {
    for (const k of keys) {
      const a = ra[k.idx] ?? '';
      const b = rb[k.idx] ?? '';
      let cmp: number;
      if (k.numeric) {
        const na = toNumber(a);
        const nb = toNumber(b);
        // Push unparseable values to the end regardless of direction.
        if (na === null && nb === null) cmp = 0;
        else if (na === null) cmp = 1 * k.dir;
        else if (nb === null) cmp = -1 * k.dir;
        else cmp = na - nb;
      } else {
        cmp = a.localeCompare(b);
      }
      if (cmp !== 0) return cmp * k.dir;
    }
    return 0;
  });
}

function finalize(rows: string[][], columns: QueryColumn[], limit?: number): QueryResult {
  const limited = limit && limit > 0 ? rows.slice(0, limit) : rows;
  const totalRows = limited.length;
  const display = limited.slice(0, MAX_RESULT_ROWS);
  const scalar =
    display.length === 1 && columns.length === 1
      ? { label: columns[0].name, value: display[0][0] }
      : null;
  return {
    columns,
    rows: display,
    totalRows,
    truncated: display.length < totalRows,
    scalar,
  };
}

/** Run a `QuerySpec` against the parsed grid, producing a result table. */
export function runQuery(
  result: ParseResult,
  profiles: ColumnProfile[],
  spec: QuerySpec,
): QueryResult {
  const { headers, rows } = result;
  const resolve = makeResolver(headers);
  const isNumericCol = (i: number) => NUMERIC_TYPES.has(profiles[i]?.type ?? 'string');

  // 1. Filter (AND).
  const filters = Array.isArray(spec.filters) ? spec.filters : [];
  const resolvedFilters = filters.map((f) => ({ f, index: resolve(f.column) }));
  const filtered = rows.filter((row) =>
    resolvedFilters.every(({ f, index }) => passesFilter(row[index], f, isNumericCol(index))),
  );

  const groupBy = Array.isArray(spec.groupBy) ? spec.groupBy : [];
  const aggregates = Array.isArray(spec.aggregates) ? spec.aggregates : [];

  // 2a. Aggregation mode (any groupBy or aggregates).
  if (groupBy.length > 0 || aggregates.length > 0) {
    const groupCols = groupBy.map((name) => ({ index: resolve(name), name }));

    // Default to counting rows when grouping without an explicit measure.
    const effectiveAggs: QueryAggregate[] =
      aggregates.length > 0 ? aggregates : [{ fn: 'count' }];

    const resolvedAggs: ResolvedAgg[] = effectiveAggs.map((a) => {
      const hasCol = a.column != null && String(a.column).trim() !== '';
      const index = hasCol ? resolve(a.column as string) : -1;
      const colName = hasCol ? headers[index] : null;
      return {
        fn: a.fn,
        index,
        label: a.as?.trim() || defaultAggLabel(a.fn, colName),
        numeric: a.fn === 'count' ? true : a.fn === 'sum' || a.fn === 'avg' ? true : index >= 0 && isNumericCol(index),
      };
    });

    const columns: QueryColumn[] = [
      ...groupCols.map((g) => ({ name: headers[g.index], numeric: isNumericCol(g.index) })),
      ...resolvedAggs.map((a) => ({ name: a.label, numeric: a.numeric })),
    ];

    let outRows: string[][];
    if (groupCols.length === 0) {
      // Whole-table aggregation → one row.
      outRows = [resolvedAggs.map((a) => computeAgg(a, filtered))];
    } else {
      const groups = new Map<string, { keys: string[]; rows: string[][] }>();
      for (const row of filtered) {
        const keys = groupCols.map((g) => (row[g.index] ?? '').trim());
        const sig = keys.join(' ');
        let g = groups.get(sig);
        if (!g) {
          g = { keys, rows: [] };
          groups.set(sig, g);
        }
        g.rows.push(row);
      }
      outRows = [...groups.values()].map((g) => [
        ...g.keys,
        ...resolvedAggs.map((a) => computeAgg(a, g.rows)),
      ]);
    }

    if (Array.isArray(spec.sort) && spec.sort.length > 0) sortRows(outRows, columns, spec.sort);
    return finalize(outRows, columns, spec.limit);
  }

  // 2b. Projection mode.
  const select = Array.isArray(spec.select) ? spec.select : [];
  const selectIdx = select.length > 0 ? select.map((name) => resolve(name)) : headers.map((_, i) => i);
  const columns: QueryColumn[] = selectIdx.map((i) => ({
    name: headers[i],
    numeric: isNumericCol(i),
  }));

  let projected = filtered.map((row) => selectIdx.map((i) => row[i] ?? ''));

  if (spec.distinct) {
    const seen = new Set<string>();
    projected = projected.filter((row) => {
      const sig = row.join(' ');
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });
  }

  if (Array.isArray(spec.sort) && spec.sort.length > 0) sortRows(projected, columns, spec.sort);
  return finalize(projected, columns, spec.limit);
}
