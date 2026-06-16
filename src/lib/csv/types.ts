/**
 * Core data model for Tabula. Every feature — preview, health score, cleaning,
 * diff, export — reads from a `ParseResult` (the raw parsed grid) and the
 * derived `ColumnProfile[]` (per-column type + fill stats). Keep this engine
 * pure and dependency-free; it's the foundation the rest of the app builds on.
 */

export type Delimiter = ',' | '\t' | ';' | '|';

/** Detected semantic type of a column's values. */
export type ColumnType =
  | 'string' // free text
  | 'integer'
  | 'number'
  | 'currency'
  | 'date'
  | 'email'
  | 'phone'
  | 'url'
  | 'boolean'
  | 'empty'; // column has no non-empty values

export interface ParseMeta {
  fileName: string;
  fileSize: number;
  delimiter: Delimiter;
  delimiterLabel: string;
  encoding: string;
  hadBom: boolean;
  rowCount: number; // data rows (excludes the header row)
  columnCount: number;
  /** Rows whose cell count differs from the header — a data-quality smell. */
  raggedRows: number;
}

export interface ParseResult {
  headers: string[];
  /** Data rows only. Cells align to `headers` by index; short rows read ''. */
  rows: string[][];
  meta: ParseMeta;
}

export interface ColumnProfile {
  name: string;
  index: number;
  type: ColumnType;
  /** Share of sampled values matching `type`, 0..1. */
  confidence: number;
  filled: number; // non-empty cell count across all rows
  empty: number; // empty / missing cell count across all rows
}
