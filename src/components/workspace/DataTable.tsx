import type { ColumnProfile, ParseResult } from '../../lib/csv/types';
import { NUMERIC_TYPES, TypeBadge } from './TypeBadge';
import { formatInt } from '../../lib/format';

// Cap the DOM at a sane number of rows; all rows stay in memory for stats.
// Row virtualization / DuckDB paging come in a later phase for huge files.
const PREVIEW_ROWS = 100;

interface Props {
  result: ParseResult;
  profiles: ColumnProfile[];
}

/** Smart preview (MVP feature #2): scrollable grid with detected types. */
export function DataTable({ result, profiles }: Props) {
  const rows = result.rows.slice(0, PREVIEW_ROWS);

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-canvas">
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10">
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 w-12 border-b border-hairline bg-surface-soft px-3 py-2 text-right text-[11px] font-semibold text-muted-soft"
              >
                #
              </th>
              {result.headers.map((header, i) => (
                <th
                  key={i}
                  scope="col"
                  className="border-b border-l border-hairline bg-surface-soft px-3 py-2 align-top"
                >
                  <div className="flex flex-col gap-1">
                    <span
                      className="max-w-[16rem] truncate text-sm font-semibold text-ink"
                      title={header || `Column ${i + 1}`}
                    >
                      {header || (
                        <span className="italic text-muted-soft">Column {i + 1}</span>
                      )}
                    </span>
                    <TypeBadge type={profiles[i]?.type ?? 'string'} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="hover:bg-surface-soft">
                <td className="sticky left-0 w-12 border-b border-hairline bg-canvas px-3 py-1.5 text-right text-xs tabular-nums text-muted-soft">
                  {r + 1}
                </td>
                {result.headers.map((_, c) => {
                  const value = row[c] ?? '';
                  const numeric = NUMERIC_TYPES.has(profiles[c]?.type ?? 'string');
                  return (
                    <td
                      key={c}
                      className={`max-w-[20rem] truncate border-b border-l border-hairline px-3 py-1.5 text-sm text-body ${
                        numeric ? 'text-right tabular-nums' : ''
                      }`}
                      title={value}
                    >
                      {value === '' ? <span className="text-muted-soft">—</span> : value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-hairline bg-surface-soft px-3 py-2 text-xs text-muted">
        Showing {formatInt(rows.length)} of {formatInt(result.meta.rowCount)} rows
      </div>
    </div>
  );
}
