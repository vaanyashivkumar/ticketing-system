import { useState } from 'react';
import { FilterX } from 'lucide-react';
import type { DepartmentCode } from '@domain/types/auth.types';
import type { Priority, SlaFlag, TicketStatus } from '@domain/types/ticket.types';
import type { TicketFilters } from '@domain/filters/ticketFilters';
import { activeFilterCount } from '@domain/filters/ticketFilters';
import { DATE_PRESETS, presetRange, matchPreset, type DatePresetKey } from '@domain/filters/dateRangePresets';
import { ORDERED_PRIORITIES } from '@domain/workflow/priorityEngine';
import { STATUS_DEFINITIONS } from '@config/statuses.config';
import { DEPARTMENT_LIST } from '@config/departments.config';

/**
 * Dashboard filters (B05 §Filter Engine).
 *
 * Reuses `TicketFilters` and `applyFilters` — the same model the Reports page uses, moved out of
 * `domain/reports/` and renamed for the occasion. B05 is explicit: "Use shared filtering logic
 * from the ticket list architecture. Avoid duplicating filtering implementations inside each
 * widget." So there is no dashboard filter *logic* here at all; this is a control surface over the
 * existing one, and the filtered set is passed to every widget from one place.
 *
 * The control surface started at four fields on the reasoning that a dashboard narrows the live
 * picture rather than running a report. Stakeholder requests since have added a DATE window and a
 * STATUS filter (2026-07-28) — the latter is how you pull up COMPLETED requests, which the
 * open-work widgets deliberately cut out. `assignee` stays off (it has its own widget). All of it
 * is the same shared `TicketFilters` model, so nothing new was invented to add them.
 *
 * SCOPE: filtering runs after the clamp and only narrows. The department list is every department
 * because a Finance user legitimately filters "show me only what Sales sent" — selecting one they
 * have no traffic with returns nothing rather than revealing anything.
 */
export function DashboardFilters({
  value,
  onChange,
  categories,
}: {
  readonly value: TicketFilters;
  readonly onChange: (next: TicketFilters) => void;
  /**
   * The category labels PRESENT in the scoped set, derived by the caller.
   *
   * Not the routing matrix: offering a category the session has no tickets in produces a filter
   * that can only ever return nothing, and on a matrix of 71 route-scoped categories that is most
   * of the list. Offering what is actually there keeps the control honest and short.
   */
  readonly categories: readonly string[];
}) {
  const set = <K extends keyof TicketFilters>(k: K, v: TicketFilters[K]) => onChange({ ...value, [k]: v });
  const active = activeFilterCount(value);

  // DATE — the model already carries `from`/`to` and `applyFilters` already uses them; this is only
  // a control surface. `customOpen` remembers that the user chose "Custom" (whose date inputs may
  // still be blank); otherwise the selected preset is derived from the range itself, so nothing
  // desyncs. A range that matches no preset but is set reads as custom.
  const [customOpen, setCustomOpen] = useState(false);
  const now = new Date();
  const matched = matchPreset(value.from, value.to, now);
  const dateMode: DatePresetKey | 'custom' | '' =
    customOpen ? 'custom' : (matched ?? (value.from || value.to ? 'custom' : ''));

  const onDateMode = (mode: DatePresetKey | 'custom' | '') => {
    if (mode === '') { setCustomOpen(false); onChange({ ...value, from: '', to: '' }); return; }
    if (mode === 'custom') { setCustomOpen(true); return; }
    setCustomOpen(false);
    onChange({ ...value, ...presetRange(mode, now) });
  };

  const clearAll = () => {
    setCustomOpen(false);
    onChange({ ...value, priority: '', sla: '', department: '', category: '', status: '', from: '', to: '' });
  };

  return (
    <div className="card-p flex flex-wrap items-end gap-2">
      <Field label="Priority">
        <select
          className="input"
          value={value.priority}
          onChange={(e) => set('priority', e.target.value as Priority | '')}
          aria-label="Filter by priority"
        >
          <option value="">Any priority</option>
          {ORDERED_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>

      <Field label="SLA">
        <select
          className="input"
          value={value.sla}
          onChange={(e) => set('sla', e.target.value as SlaFlag | '')}
          aria-label="Filter by SLA state"
        >
          <option value="">Any SLA state</option>
          <option value="OnTrack">On track</option>
          <option value="DueSoon">Due soon</option>
          <option value="Overdue">Overdue</option>
        </select>
      </Field>

      <Field label="Department">
        <select
          className="input"
          value={value.department}
          onChange={(e) => set('department', e.target.value as DepartmentCode | '')}
          aria-label="Filter by department"
        >
          <option value="">Any department</option>
          {DEPARTMENT_LIST.map((d) => (
            <option key={d.code} value={d.code}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Category">
        <select
          className="input"
          value={value.category}
          onChange={(e) => set('category', e.target.value)}
          aria-label="Filter by category"
        >
          <option value="">Any category</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      {/* Status — how you narrow to COMPLETED requests (Resolved / Closed), which the live widgets
          otherwise cut out. Uses the model's existing `status` field; STATUS_DEFINITIONS is the one
          source of the status vocabulary, ordered by lifecycle. */}
      <Field label="Status">
        <select
          className="input"
          value={value.status}
          onChange={(e) => set('status', e.target.value as TicketStatus | '')}
          aria-label="Filter by status"
        >
          <option value="">Any status</option>
          {STATUS_DEFINITIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Date">
        <select
          className="input"
          value={dateMode}
          onChange={(e) => onDateMode(e.target.value as DatePresetKey | 'custom' | '')}
          aria-label="Filter by created date"
        >
          <option value="">Any time</option>
          {DATE_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
      </Field>

      {/* Custom range — two date inputs that write straight to from/to. Shown only when "Custom"
          is chosen, so the common presets stay a single control. */}
      {dateMode === 'custom' && (
        <>
          <Field label="From">
            <input
              type="date"
              className="input"
              value={value.from}
              max={value.to || undefined}
              onChange={(e) => set('from', e.target.value)}
              aria-label="From date"
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              className="input"
              value={value.to}
              min={value.from || undefined}
              onChange={(e) => set('to', e.target.value)}
              aria-label="To date"
            />
          </Field>
        </>
      )}

      {active > 0 && (
        <button type="button" onClick={clearAll} className="btn-neutral text-primary-text">
          <FilterX size={14} aria-hidden /> Clear {active}
        </button>
      )}
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="mb-1 block text-caption text-text-muted">{label}</span>
    {children}
  </label>
);
