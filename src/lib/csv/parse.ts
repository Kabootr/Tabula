import type { Delimiter, ParseResult } from './types';

/**
 * Dependency-free CSV/TSV parsing. This is core product IP for a CSV tool, so
 * we own it: an RFC 4180 state machine (quoted fields, escaped quotes, embedded
 * newlines, CRLF), delimiter auto-detection, and BOM/encoding sniffing.
 */

const DELIMITERS: { delim: Delimiter; label: string }[] = [
  { delim: ',', label: 'Comma' },
  { delim: '\t', label: 'Tab' },
  { delim: ';', label: 'Semicolon' },
  { delim: '|', label: 'Pipe' },
];

const DELIMITER_LABELS: Record<Delimiter, string> = {
  ',': 'Comma',
  '\t': 'Tab',
  ';': 'Semicolon',
  '|': 'Pipe',
};

/** Read a File as text, honoring UTF-8/UTF-16 byte-order marks. */
async function readText(
  file: File,
): Promise<{ text: string; encoding: string; hadBom: boolean }> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: decode(bytes, 3, 'utf-8'), encoding: 'UTF-8', hadBom: true };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: decode(bytes, 2, 'utf-16le'), encoding: 'UTF-16 LE', hadBom: true };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: decode(bytes, 2, 'utf-16be'), encoding: 'UTF-16 BE', hadBom: true };
  }
  return { text: decode(bytes, 0, 'utf-8'), encoding: 'UTF-8', hadBom: false };
}

function decode(bytes: Uint8Array, offset: number, encoding: string): string {
  return new TextDecoder(encoding).decode(bytes.subarray(offset));
}

/** Count a character's occurrences in `s`, ignoring those inside quotes. */
function countOutsideQuotes(s: string, ch: string): number {
  let inQuotes = false;
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ch && !inQuotes) count++;
  }
  return count;
}

/**
 * Guess the delimiter. `.tsv` files are always tab-delimited; otherwise pick
 * the candidate with the most occurrences across a leading sample.
 */
export function detectDelimiter(
  sample: string,
  fileName = '',
): { delim: Delimiter; label: string } {
  if (/\.tsv$/i.test(fileName)) return { delim: '\t', label: 'Tab' };

  const window = sample.slice(0, 8192);
  let best: { delim: Delimiter; label: string } = { delim: ',', label: 'Comma' };
  let bestCount = -1;
  for (const candidate of DELIMITERS) {
    const count = countOutsideQuotes(window, candidate.delim);
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

/**
 * Parse delimited text into a 2D grid. Handles quoted fields, doubled-quote
 * escapes (`""`), embedded delimiters/newlines, and CRLF/LF/CR line endings.
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let started = false; // any char seen on the current row?

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      started = true;
    } else if (ch === delimiter) {
      endField();
      started = true;
    } else if (ch === '\r') {
      endRow();
      if (text[i + 1] === '\n') i++;
    } else if (ch === '\n') {
      endRow();
    } else {
      field += ch;
      started = true;
    }
  }

  // Flush a trailing field/row that wasn't terminated by a newline.
  if (started || field.length > 0 || row.length > 0) endRow();

  return rows;
}

/** Read, sniff, and parse a File into Tabula's `ParseResult`. */
export async function parseFile(file: File): Promise<ParseResult> {
  const { text, encoding, hadBom } = await readText(file);
  const { delim } = detectDelimiter(text, file.name);

  const matrix = parseDelimited(text, delim);

  // Drop a single trailing blank row (common: files ending in a newline).
  while (
    matrix.length > 0 &&
    matrix[matrix.length - 1].length === 1 &&
    matrix[matrix.length - 1][0] === ''
  ) {
    matrix.pop();
  }

  const headers = matrix.length > 0 ? matrix[0] : [];
  const rows = matrix.slice(1);

  let raggedRows = 0;
  for (const r of rows) if (r.length !== headers.length) raggedRows++;

  return {
    headers,
    rows,
    meta: {
      fileName: file.name,
      fileSize: file.size,
      delimiter: delim,
      delimiterLabel: DELIMITER_LABELS[delim],
      encoding: hadBom ? `${encoding} (BOM)` : encoding,
      hadBom,
      rowCount: rows.length,
      columnCount: headers.length,
      raggedRows,
    },
  };
}
