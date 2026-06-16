import type { ParseResult } from '../../lib/csv/types';
import { formatBytes, formatInt } from '../../lib/format';

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-0.5 rounded-md border px-3 py-2 ${
        warn ? 'border-warning/40 bg-warning/10' : 'border-hairline bg-surface-card'
      }`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </span>
      <span className="text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}

/** Compact stat strip describing the parsed file. */
export function FileSummary({ result }: { result: ParseResult }) {
  const m = result.meta;
  return (
    <div className="flex flex-wrap gap-2">
      <Stat label="Rows" value={formatInt(m.rowCount)} />
      <Stat label="Columns" value={formatInt(m.columnCount)} />
      <Stat label="Size" value={formatBytes(m.fileSize)} />
      <Stat label="Delimiter" value={m.delimiterLabel} />
      <Stat label="Encoding" value={m.encoding} />
      {m.raggedRows > 0 && (
        <Stat label="Ragged rows" value={formatInt(m.raggedRows)} warn />
      )}
    </div>
  );
}
