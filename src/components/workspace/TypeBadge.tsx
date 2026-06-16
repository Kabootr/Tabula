import type { ColumnType } from '../../lib/csv/types';

/**
 * Per-column type pill. Colors pull from the saturated brand palette so the
 * preview carries brand voltage — dark text on the lighter saturations
 * (lavender/peach/ochre/mint), white on pink/teal, per DESIGN.md.
 */
const STYLES: Record<ColumnType, { label: string; className: string }> = {
  email: { label: 'Email', className: 'bg-brand-lavender text-ink' },
  url: { label: 'URL', className: 'bg-brand-pink text-on-primary' },
  phone: { label: 'Phone', className: 'bg-brand-coral text-ink' },
  date: { label: 'Date', className: 'bg-brand-peach text-ink' },
  currency: { label: 'Currency', className: 'bg-brand-ochre text-ink' },
  number: { label: 'Number', className: 'bg-brand-mint text-ink' },
  integer: { label: 'Integer', className: 'bg-brand-mint text-ink' },
  boolean: { label: 'Boolean', className: 'bg-surface-strong text-body-strong' },
  string: { label: 'Text', className: 'bg-surface-card text-muted' },
  empty: { label: 'Empty', className: 'bg-hairline-soft text-muted-soft' },
};

export const NUMERIC_TYPES = new Set<ColumnType>(['integer', 'number', 'currency']);

export function TypeBadge({ type }: { type: ColumnType }) {
  const style = STYLES[type];
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style.className}`}
    >
      {style.label}
    </span>
  );
}
