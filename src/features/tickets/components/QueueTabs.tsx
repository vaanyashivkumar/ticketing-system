import { QUEUE_DEFINITIONS } from '@domain/workflow/statusEngine';
import type { QueueSelection } from './queueBuckets';
import { cn } from '@lib/cn';

/**
 * Queue Engine surface (B04 §Queue Engine) — the six operational queues a destination
 * department maintains, as a filter over its inbound tickets. The bucketing itself is pure and
 * lives in `queueBuckets.ts`.
 */

interface Props {
  readonly value: QueueSelection;
  readonly onChange: (next: QueueSelection) => void;
  readonly counts: Record<QueueSelection, number>;
}

export function QueueTabs({ value, onChange, counts }: Props) {
  const selected = QUEUE_DEFINITIONS.find((q) => q.id === value);
  return (
    <div className="mb-3">
      {/* Toggle buttons rather than a tablist: the control FILTERS a list that stays in the same
          place, and `aria-pressed` says exactly that. A tablist would promise separate panels
          that swap, which is not what happens. */}
      <div role="group" aria-label="Filter by queue" className="flex flex-wrap gap-1.5">
        <QueueButton id="all" label="All" count={counts.all} active={value === 'all'} onClick={onChange} />
        {QUEUE_DEFINITIONS.map((q) => (
          <QueueButton key={q.id} id={q.id} label={q.label} count={counts[q.id]} active={value === q.id} onClick={onChange} />
        ))}
      </div>
      {/* The bucket's own description, so "Waiting" does not have to be guessed at. Comes from
          the queue configuration — it is not written twice. */}
      <p className="mt-1.5 text-caption text-text-muted">
        {selected ? selected.description : 'Every inbound request, whatever state it is in.'}
      </p>
    </div>
  );
}

function QueueButton({
  id,
  label,
  count,
  active,
  onClick,
}: {
  id: QueueSelection;
  label: string;
  count: number;
  active: boolean;
  onClick: (next: QueueSelection) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onClick(id)}
      className={cn(
        // The button vocabulary, re-shaped as a pill: `btn-*` carries the 40px target and the
        // press feedback, `rounded-full` is the only thing this control needs to say differently.
        'rounded-full',
        active ? 'btn-primary' : 'btn-neutral',
        // An empty bucket stays clickable — disabling it would hide the fact that it is empty,
        // which is itself the answer to "is anything waiting on the requester?".
        count === 0 && !active && 'text-text-secondary',
      )}
    >
      {label}
      {/* Separation comes from the button's own `gap`, so the count cannot drift from the label. */}
      <span className={cn('text-caption tabular-nums', active ? 'text-primary-on/80' : 'text-text-muted')}>{count}</span>
    </button>
  );
}
