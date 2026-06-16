/**
 * Builds the compact dataset description the AI sees. The model never receives
 * the full grid — just column names, detected types, a few real sample values,
 * fill rates, and a health summary. That's all it needs to translate a question
 * into a `QuerySpec`, and it keeps the prompt tiny no matter how large the file.
 */

import type { HealthReport } from '../csv/health';
import type { ColumnProfile, ColumnType, ParseResult } from '../csv/types';

export interface DatasetColumn {
  name: string;
  type: ColumnType;
  /** Percentage of rows with a value, 0–100. */
  filledPct: number;
  /** Up to a few distinct, short example values from the data. */
  samples: string[];
}

export interface DatasetHealth {
  score: number;
  grade: string;
  /** Short human descriptions of the top issues, worst-first. */
  topIssues: string[];
}

export interface DatasetSchema {
  fileName: string;
  rowCount: number;
  columnCount: number;
  columns: DatasetColumn[];
  health?: DatasetHealth;
}

const MAX_SAMPLES = 3;
const SAMPLE_SCAN_ROWS = 200;
const SAMPLE_MAX_LEN = 48;

function collectSamples(rows: string[][], colIndex: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const limit = Math.min(rows.length, SAMPLE_SCAN_ROWS);
  for (let r = 0; r < limit && out.length < MAX_SAMPLES; r++) {
    const raw = (rows[r][colIndex] ?? '').trim();
    if (raw === '' || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw.length > SAMPLE_MAX_LEN ? `${raw.slice(0, SAMPLE_MAX_LEN)}…` : raw);
  }
  return out;
}

export function buildSchema(
  result: ParseResult,
  profiles: ColumnProfile[],
  health?: HealthReport,
): DatasetSchema {
  const { headers, rows, meta } = result;

  const columns: DatasetColumn[] = headers.map((name, i) => {
    const profile = profiles[i];
    const filled = profile?.filled ?? 0;
    return {
      name: name || `Column ${i + 1}`,
      type: profile?.type ?? 'string',
      filledPct: meta.rowCount > 0 ? Math.round((filled / meta.rowCount) * 100) : 0,
      samples: collectSamples(rows, i),
    };
  });

  return {
    fileName: meta.fileName,
    rowCount: meta.rowCount,
    columnCount: meta.columnCount,
    columns,
    health: health
      ? {
          score: health.score,
          grade: health.grade,
          topIssues: health.issues.slice(0, 5).map((issue) => issue.detail),
        }
      : undefined,
  };
}
