import type { ColumnProfile, ColumnType, ParseResult } from './types';

/**
 * Type-detection engine. Classifies each cell into a semantic type, then picks
 * a column type by majority vote. This drives the smart-preview badges today and
 * will feed the Data Health Score (invalid emails/phones/dates) later.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL = /^(https?:\/\/|www\.)\S+$/i;
const BOOLEAN = /^(true|false|yes|no)$/i;
// Symbol-prefixed ($1,000.50) or code-suffixed (1000 USD) money values.
const CURRENCY =
  /^[+-]?[$€£¥₹]\s?\d{1,3}(,\d{3})*(\.\d+)?$|^[+-]?\d+(\.\d+)?\s?(usd|eur|gbp|inr|jpy|cad|aud)$/i;
const INTEGER = /^[+-]?\d+$/;
const THOUSANDS = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/; // 1,234,567.89
const NUMBER = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/;
const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const SLASH_DATE = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/;
// At least 7 digits with phone punctuation; checked after numerics so plain
// integers stay integers.
const PHONE = /^[+(]?\d[\d\s().-]{6,}$/;

function isDate(v: string): boolean {
  return ISO_DATE.test(v) || SLASH_DATE.test(v);
}

/** Classify a single non-empty, trimmed value into its most specific type. */
export function classifyValue(value: string): ColumnType {
  const v = value.trim();
  if (v === '') return 'empty';
  if (EMAIL.test(v)) return 'email';
  if (URL.test(v)) return 'url';
  if (BOOLEAN.test(v)) return 'boolean';
  if (CURRENCY.test(v)) return 'currency';
  if (INTEGER.test(v)) return 'integer';
  if (THOUSANDS.test(v) || NUMBER.test(v)) return 'number';
  if (isDate(v)) return 'date';
  if (PHONE.test(v)) return 'phone';
  return 'string';
}

// Only the first N non-empty values per column are classified — enough signal
// without scanning every cell of a huge file. Fill counts still cover all rows.
const TYPE_SAMPLE = 200;
const THRESHOLD = 0.6; // a type must win ≥60% of the sample to be assigned

/** Profile every column: detect its type and count filled vs. empty cells. */
export function profileColumns(result: ParseResult): ColumnProfile[] {
  const { headers, rows } = result;
  const cols = headers.length;

  const filled = new Array<number>(cols).fill(0);
  const sampled = new Array<number>(cols).fill(0);
  const tallies: Array<Partial<Record<ColumnType, number>>> = Array.from(
    { length: cols },
    () => ({}),
  );

  for (const row of rows) {
    for (let c = 0; c < cols; c++) {
      const raw = row[c];
      if (raw == null || raw.trim() === '') continue;
      filled[c]++;
      if (sampled[c] < TYPE_SAMPLE) {
        const t = classifyValue(raw);
        tallies[c][t] = (tallies[c][t] ?? 0) + 1;
        sampled[c]++;
      }
    }
  }

  return headers.map((name, c) => {
    const total = sampled[c];
    const tally = tallies[c];
    const ratio = (t: ColumnType) => (total > 0 ? (tally[t] ?? 0) / total : 0);

    let type: ColumnType = 'string';
    let confidence = 0;

    if (filled[c] === 0) {
      type = 'empty';
      confidence = 1;
    } else if (ratio('email') >= THRESHOLD) {
      type = 'email';
      confidence = ratio('email');
    } else if (ratio('url') >= THRESHOLD) {
      type = 'url';
      confidence = ratio('url');
    } else if (ratio('currency') >= THRESHOLD) {
      type = 'currency';
      confidence = ratio('currency');
    } else if (ratio('integer') + ratio('number') >= THRESHOLD) {
      // Numeric column: decimals present anywhere → number, else integer.
      type = (tally.number ?? 0) > 0 ? 'number' : 'integer';
      confidence = ratio('integer') + ratio('number');
    } else if (ratio('date') >= THRESHOLD) {
      type = 'date';
      confidence = ratio('date');
    } else if (ratio('boolean') >= THRESHOLD) {
      type = 'boolean';
      confidence = ratio('boolean');
    } else if (ratio('phone') >= THRESHOLD) {
      type = 'phone';
      confidence = ratio('phone');
    }

    return {
      name,
      index: c,
      type,
      confidence,
      filled: filled[c],
      empty: rows.length - filled[c],
    };
  });
}
