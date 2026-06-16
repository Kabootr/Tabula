/**
 * Data Health Score engine (MVP feature #3). Pure and dependency-free, like the
 * rest of `src/lib/csv` — it reads a `ParseResult` + the derived
 * `ColumnProfile[]` and returns a `HealthReport`: an overall 0–100 score, four
 * sub-scores (completeness, validity, uniqueness, consistency), and a sorted
 * list of concrete, fixable issues. The UI never recomputes any of this; it just
 * renders the report.
 */

import { classifyValue, EMAIL } from './profile';
import type { ColumnProfile, ColumnType, ParseResult } from './types';

export type Severity = 'high' | 'medium' | 'low';

/** Letter-grade band derived from the overall score. */
export type HealthGrade = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

export type DimensionKey =
  | 'completeness'
  | 'validity'
  | 'uniqueness'
  | 'consistency';

/** A "N of M items are good" fraction the UI turns into a caption. */
export interface DimensionSummary {
  good: number;
  total: number;
  noun: string;
}

export interface HealthDimension {
  key: DimensionKey;
  label: string;
  /** 0–100, rounded for display. */
  score: number;
  /** False when the dataset has nothing to measure (e.g. no typed columns). */
  applicable: boolean;
  summary: DimensionSummary;
}

export type IssueKind =
  | 'missing-values'
  | 'duplicate-rows'
  | 'invalid-emails'
  | 'invalid-phones'
  | 'invalid-dates'
  | 'type-mismatch'
  | 'whitespace'
  | 'ragged-rows';

export interface AffectedColumn {
  name: string;
  index: number;
  count: number;
}

export interface HealthIssue {
  kind: IssueKind;
  title: string;
  /** Number of affected cells or rows (see `unit`). */
  count: number;
  unit: 'cell' | 'row' | 'value';
  detail: string;
  severity: Severity;
  dimension: DimensionKey;
  /** 0–1 share of the relevant population this issue affects (drives the bar). */
  share: number;
  /** Columns where it shows up, worst-first. Empty for whole-row issues. */
  columns: AffectedColumn[];
  /** The one-click cleaning action that would resolve it (roadmap feature #5). */
  fix: string;
}

export interface HealthReport {
  score: number;
  grade: HealthGrade;
  verdict: string;
  dimensions: HealthDimension[];
  issues: HealthIssue[];
  totals: {
    rows: number;
    columns: number;
    cells: number;
    filledCells: number;
    missingCells: number;
    duplicateRows: number;
  };
}

// --- value-level validators -------------------------------------------------
// Email reuses the detector's regex. Phone and date get dedicated checks: a bare
// run of digits classifies as `integer` (not `phone`), and the date regex
// accepts impossible dates like 2021-13-45 — so we validate those properly here
// rather than leaning on `classifyValue`.

const NUMERIC: ReadonlySet<ColumnType> = new Set(['integer', 'number', 'currency']);

function isValidEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

function isValidPhone(value: string): boolean {
  const v = value.trim();
  if (!/^[+(]?[\d\s().\-]+$/.test(v)) return false;
  const digits = (v.match(/\d/g) ?? []).length;
  return digits >= 7 && digits <= 15;
}

function isRealYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= daysInMonth[m - 1];
}

function isValidDate(value: string): boolean {
  const v = value.trim();
  const iso =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(
      v,
    );
  if (iso) return isRealYmd(+iso[1], +iso[2], +iso[3]);

  const slash = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(v);
  if (slash) {
    const a = +slash[1];
    const b = +slash[2];
    let year = +slash[3];
    if (year < 100) year += year < 50 ? 2000 : 1900;
    // Ambiguous ordering: accept if either D/M or M/D resolves to a real date.
    return isRealYmd(year, a, b) || isRealYmd(year, b, a);
  }
  return false;
}

interface ColumnValidator {
  kind: IssueKind;
  valid: (value: string) => boolean;
}

/** The validity check (if any) to run on a column, based on its detected type. */
function columnValidator(type: ColumnType): ColumnValidator | null {
  switch (type) {
    case 'email':
      return { kind: 'invalid-emails', valid: isValidEmail };
    case 'phone':
      return { kind: 'invalid-phones', valid: isValidPhone };
    case 'date':
      return { kind: 'invalid-dates', valid: isValidDate };
    case 'integer':
    case 'number':
    case 'currency':
      return { kind: 'type-mismatch', valid: (v) => NUMERIC.has(classifyValue(v)) };
    case 'boolean':
      return { kind: 'type-mismatch', valid: (v) => classifyValue(v) === 'boolean' };
    case 'url':
      return { kind: 'type-mismatch', valid: (v) => classifyValue(v) === 'url' };
    default:
      return null; // free text / empty columns have no format to validate
  }
}

// --- scoring helpers --------------------------------------------------------

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

const DIMENSION_WEIGHT: Record<DimensionKey, number> = {
  completeness: 0.3,
  validity: 0.3,
  uniqueness: 0.2,
  consistency: 0.2,
};

function gradeFor(score: number): HealthGrade {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'fair';
  if (score >= 40) return 'poor';
  return 'critical';
}

const VERDICT: Record<HealthGrade, string> = {
  excellent: 'This dataset is clean and ready to use.',
  good: 'Solid data — a few small things are worth tidying.',
  fair: 'Usable, but several issues deserve a look before analysis.',
  poor: 'Significant quality problems to fix before you rely on this.',
  critical: 'This data needs serious cleanup before it can be trusted.',
};

function severityFromShare(share: number, high = 0.2, medium = 0.05): Severity {
  if (share >= high) return 'high';
  if (share >= medium) return 'medium';
  return 'low';
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** Turn a per-column tally into a worst-first list, dropping zero counts. */
function affectedColumns(
  counts: number[],
  headers: string[],
): AffectedColumn[] {
  const out: AffectedColumn[] = [];
  for (let c = 0; c < counts.length; c++) {
    if (counts[c] > 0) {
      out.push({ name: headers[c] || `Column ${c + 1}`, index: c, count: counts[c] });
    }
  }
  return out.sort((a, b) => b.count - a.count);
}

const FIX: Record<IssueKind, string> = {
  'missing-values': 'Fill or drop empty cells',
  'duplicate-rows': 'Remove duplicate rows',
  'invalid-emails': 'Flag invalid emails',
  'invalid-phones': 'Standardize phone numbers',
  'invalid-dates': 'Normalize dates',
  'type-mismatch': 'Fix mismatched values',
  whitespace: 'Trim whitespace',
  'ragged-rows': 'Align row columns',
};

// --- the analyzer -----------------------------------------------------------

/** Analyze a parsed file against its column profiles into a `HealthReport`. */
export function analyzeHealth(
  result: ParseResult,
  profiles: ColumnProfile[],
): HealthReport {
  const { headers, rows } = result;
  const cols = headers.length;
  const rowCount = rows.length;
  const totalCells = rowCount * cols;
  const raggedRows = result.meta.raggedRows;

  // Missing cells come straight from the profiles (they already count every row).
  const missingByCol = profiles.map((p) => p.empty);
  const missingCells = missingByCol.reduce((a, b) => a + b, 0);
  const filledCells = Math.max(0, totalCells - missingCells);

  const validators = profiles.map((p) => columnValidator(p.type));

  // Single pass over the grid for everything that needs per-cell inspection.
  const invalidByCol = new Array<number>(cols).fill(0);
  const whitespaceByCol = new Array<number>(cols).fill(0);
  let validatableCells = 0;
  let invalidCells = 0;
  let whitespaceCells = 0;
  const seen = new Set<string>();
  let duplicateRows = 0;

  for (const row of rows) {
    const signature = row.join('');
    if (seen.has(signature)) duplicateRows++;
    else seen.add(signature);

    for (let c = 0; c < cols; c++) {
      const raw = row[c];
      if (raw == null) continue;
      const trimmed = raw.trim();

      if (trimmed !== '' && trimmed.length !== raw.length) {
        whitespaceByCol[c]++;
        whitespaceCells++;
      }
      if (trimmed === '') continue; // empties are accounted for as missing

      const validator = validators[c];
      if (validator) {
        validatableCells++;
        if (!validator.valid(raw)) invalidByCol[c]++;
      }
    }
  }
  invalidCells = invalidByCol.reduce((a, b) => a + b, 0);

  // Sub-scores (0–1). A dimension with nothing to measure is "not applicable"
  // and is excluded from the weighted overall rather than scored as perfect.
  const whitespaceShare = totalCells > 0 ? whitespaceCells / totalCells : 0;
  const raggedShare = rowCount > 0 ? raggedRows / rowCount : 0;

  const sub: Record<DimensionKey, number> = {
    completeness: totalCells > 0 ? clamp01(filledCells / totalCells) : 1,
    validity: validatableCells > 0 ? clamp01(1 - invalidCells / validatableCells) : 1,
    uniqueness: rowCount > 0 ? clamp01(1 - duplicateRows / rowCount) : 1,
    consistency: clamp01(1 - whitespaceShare - raggedShare),
  };

  const dimensions: HealthDimension[] = [
    {
      key: 'completeness',
      label: 'Completeness',
      score: Math.round(sub.completeness * 100),
      applicable: totalCells > 0,
      summary: { good: filledCells, total: totalCells, noun: 'cells filled' },
    },
    {
      key: 'validity',
      label: 'Validity',
      score: Math.round(sub.validity * 100),
      applicable: validatableCells > 0,
      summary: {
        good: validatableCells - invalidCells,
        total: validatableCells,
        noun: 'values valid',
      },
    },
    {
      key: 'uniqueness',
      label: 'Uniqueness',
      score: Math.round(sub.uniqueness * 100),
      applicable: rowCount > 0,
      summary: { good: rowCount - duplicateRows, total: rowCount, noun: 'rows unique' },
    },
    {
      key: 'consistency',
      label: 'Consistency',
      score: Math.round(sub.consistency * 100),
      applicable: totalCells > 0,
      summary: {
        good: totalCells - whitespaceCells,
        total: totalCells,
        noun: 'cells tidy',
      },
    },
  ];

  // Weighted overall across applicable dimensions only.
  let weightSum = 0;
  let weighted = 0;
  for (const d of dimensions) {
    if (!d.applicable) continue;
    weightSum += DIMENSION_WEIGHT[d.key];
    weighted += DIMENSION_WEIGHT[d.key] * sub[d.key];
  }
  const score = rowCount === 0 ? 100 : weightSum > 0 ? Math.round((weighted / weightSum) * 100) : 100;
  const grade = gradeFor(score);
  const verdict =
    rowCount === 0 ? 'No data rows to assess yet.' : VERDICT[grade];

  // Concrete issues, only when present.
  const issues: HealthIssue[] = [];

  if (missingCells > 0) {
    const columns = affectedColumns(missingByCol, headers);
    const share = totalCells > 0 ? missingCells / totalCells : 0;
    issues.push({
      kind: 'missing-values',
      title: 'Missing values',
      count: missingCells,
      unit: 'cell',
      detail: `${missingCells.toLocaleString()} empty cells across ${columns.length} ${
        columns.length === 1 ? 'column' : 'columns'
      }.`,
      severity: severityFromShare(share),
      dimension: 'completeness',
      share,
      columns,
      fix: FIX['missing-values'],
    });
  }

  if (duplicateRows > 0) {
    const share = rowCount > 0 ? duplicateRows / rowCount : 0;
    issues.push({
      kind: 'duplicate-rows',
      title: 'Duplicate rows',
      count: duplicateRows,
      unit: 'row',
      detail: `${duplicateRows.toLocaleString()} rows are exact copies of an earlier row.`,
      severity: severityFromShare(share, 0.1, 0.02),
      dimension: 'uniqueness',
      share,
      columns: [],
      fix: FIX['duplicate-rows'],
    });
  }

  // Validity issues, grouped by the validator's kind across columns.
  const validityKinds: {
    kind: Extract<IssueKind, 'invalid-emails' | 'invalid-phones' | 'invalid-dates' | 'type-mismatch'>;
    title: string;
    detail: (n: number) => string;
  }[] = [
    {
      kind: 'invalid-emails',
      title: 'Invalid emails',
      detail: (n) => `${n.toLocaleString()} values don't look like valid email addresses.`,
    },
    {
      kind: 'invalid-phones',
      title: 'Invalid phone numbers',
      detail: (n) => `${n.toLocaleString()} values aren't recognizable phone numbers.`,
    },
    {
      kind: 'invalid-dates',
      title: 'Malformed dates',
      detail: (n) => `${n.toLocaleString()} values aren't valid calendar dates.`,
    },
    {
      kind: 'type-mismatch',
      title: 'Type mismatches',
      detail: (n) => `${n.toLocaleString()} values don't match their column's detected type.`,
    },
  ];

  for (const spec of validityKinds) {
    const counts = invalidByCol.map((n, c) =>
      validators[c]?.kind === spec.kind ? n : 0,
    );
    const total = counts.reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    const columns = affectedColumns(counts, headers);
    // Severity from the worst-affected column's share of its filled cells.
    const worstShare = columns.reduce((max, col) => {
      const filled = profiles[col.index].filled || 1;
      return Math.max(max, col.count / filled);
    }, 0);
    issues.push({
      kind: spec.kind,
      title: spec.title,
      count: total,
      unit: 'value',
      detail: spec.detail(total),
      severity: severityFromShare(worstShare),
      dimension: 'validity',
      share: worstShare,
      columns,
      fix: FIX[spec.kind],
    });
  }

  if (whitespaceCells > 0) {
    const columns = affectedColumns(whitespaceByCol, headers);
    const share = totalCells > 0 ? whitespaceCells / totalCells : 0;
    issues.push({
      kind: 'whitespace',
      title: 'Untrimmed whitespace',
      count: whitespaceCells,
      unit: 'cell',
      detail: `${whitespaceCells.toLocaleString()} cells have leading or trailing spaces.`,
      severity: severityFromShare(share, 0.1, 0.02),
      dimension: 'consistency',
      share,
      columns,
      fix: FIX.whitespace,
    });
  }

  if (raggedRows > 0) {
    issues.push({
      kind: 'ragged-rows',
      title: 'Ragged rows',
      count: raggedRows,
      unit: 'row',
      detail: `${raggedRows.toLocaleString()} rows have a different column count than the header.`,
      severity: raggedShare >= 0.05 ? 'high' : 'medium',
      dimension: 'consistency',
      share: raggedShare,
      columns: [],
      fix: FIX['ragged-rows'],
    });
  }

  issues.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    return bySeverity !== 0 ? bySeverity : b.count - a.count;
  });

  return {
    score,
    grade,
    verdict,
    dimensions,
    issues,
    totals: {
      rows: rowCount,
      columns: cols,
      cells: totalCells,
      filledCells,
      missingCells,
      duplicateRows,
    },
  };
}
