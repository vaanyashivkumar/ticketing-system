import { Search } from 'lucide-react';
import type { TicketStatus } from '@domain/types/ticket.types';
import { ORDERED_STATUSES, statusLabel } from '@domain/workflow/statusEngine';
import type { ListControls } from './useFilteredTickets';

// Lifecycle order and full labels from the Status Engine. The filter used to offer
// "Awaiting Info" while every row it returned was badged "Awaiting Information".
const STATUSES = ORDERED_STATUSES;

/**
 * Find/filter/sort for a ticket list (D03 §2/§3, defect UI-003).
 *
 * The Department Queue is a destination's primary operational workspace, and it had NO filter, NO
 * sort control and NO search — while the global search in the header is a disabled "coming soon"
 * placeholder. There was, in other words, no way to find a specific ticket anywhere in the
 * application. Invisible at three tickets; disabling at three hundred.
 *
 * D03 §3 classes Search and Filter as high-frequency: they stay visible, never behind a menu.
 */
export function TicketListControls({
  value,
  onChange,
  total,
  showing,
}: {
  value: ListControls;
  onChange: (next: ListControls) => void;
  total: number;
  showing: number;
}) {
  const set = <K extends keyof ListControls>(k: K, v: ListControls[K]) => onChange({ ...value, [k]: v });

  return (
    <div className="mb-4 flex flex-wrap items-end gap-2">
      <label className="relative min-w-48 flex-1">
        <span className="mb-1 block text-label text-text">Search</span>
        <Search size={16} className="pointer-events-none absolute bottom-2.5 left-3 text-text-muted" aria-hidden />
        {/* The shared `.input`, sunken so the filter bar reads as a control strip rather than a
            second surface floating on the page; `pl-9` clears the search glyph. */}
        <input
          type="search"
          value={value.q}
          onChange={(e) => set('q', e.target.value)}
          placeholder="Code, subject or category…"
          className="input bg-surface-sunken pl-9"
        />
      </label>

      <label>
        <span className="mb-1 block text-label text-text">Status</span>
        <select
          value={value.status}
          onChange={(e) => set('status', e.target.value as TicketStatus | '')}
          className="input w-auto bg-surface-sunken px-2"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>
      </label>

      <label>
        <span className="mb-1 block text-label text-text">Sort</span>
        <select
          value={value.sort}
          onChange={(e) => set('sort', e.target.value as ListControls['sort'])}
          className="input w-auto bg-surface-sunken px-2"
        >
          <option value="priority">Priority</option>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </label>

      <p aria-live="polite" className="ml-auto pb-2 text-body-sm text-text-muted">
        {showing === total ? `${total} ticket${total === 1 ? '' : 's'}` : `${showing} of ${total}`}
      </p>
    </div>
  );
}
