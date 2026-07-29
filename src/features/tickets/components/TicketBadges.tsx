import type { Priority, SlaFlag, TicketStatus } from '@domain/types/ticket.types';
import { statusDef } from '@domain/workflow/statusEngine';
import { priorityDef } from '@domain/workflow/priorityEngine';
import { STATUS_ICON } from './statusIcons';
import { cn } from '@lib/cn';

/**
 * Status / priority / SLA badges. Colour + text + shape — never colour alone (phase-2 §9).
 *
 * The label, colour and glyph maps that used to live here were four of the scattered copies of
 * status/priority knowledge. They come from the engines now, so the badge can no longer read
 * "Awaiting Information" while the filter control beside it reads "Awaiting Info".
 */

export function StatusBadge({ status }: { status: TicketStatus }) {
  const def = statusDef(status);
  const Icon = STATUS_ICON[status];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label-sm', def.badgeClass)}>
      <Icon size={12} aria-hidden />
      {def.label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const def = priorityDef(priority);
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label-sm', def.badgeClass)}>
      <span aria-hidden>{def.glyph}</span>
      {def.label}
    </span>
  );
}

const SLA_META: Record<SlaFlag, { label: string; style: string }> = {
  OnTrack: { label: 'On track', style: 'bg-success-bg text-success-text' },
  DueSoon: { label: 'Due soon', style: 'bg-warning-bg text-warning-text' },
  Overdue: { label: 'Overdue', style: 'bg-error-bg text-error-text' },
};

export function SlaBadge({ flag }: { flag: SlaFlag }) {
  const m = SLA_META[flag];
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-label-sm', m.style)}>{m.label}</span>;
}
