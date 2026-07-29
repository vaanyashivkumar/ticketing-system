import { Link } from 'react-router-dom';
import { cn } from '@lib/cn';
import { CountUp } from '@components/common/CountUp';
import type { ResolvedKpi, KpiState } from '@domain/dashboard/kpiRegistry';

/**
 * KPI card (B05 §KPI Design Rules).
 *
 * Rebuilt rather than extended: the previous card knew only a label, a number and a colour token,
 * with no concept of the metric it rendered. That produced three defects it could not be patched
 * out of.
 *
 * 1. **Status was colour-only** — the card's own header claimed "colour reinforces, never carries
 *    meaning alone", and then carried the entire breach signal in a Tailwind text colour. A user
 *    who cannot perceive the red could not tell "Overdue 12" from neutral information. `state`
 *    now renders as a WORD.
 * 2. **`aria-label` overrode all inner text**, so a card announced "SLA compliance: 94%" and
 *    nothing else — not the question it answers, not where it leads. The accessible name now comes
 *    from the visible text, with the question attached as a description rather than replacing it.
 * 3. **A null value announced as nothing.** "SLA compliance: —" read out as "SLA compliance:"
 *    followed by silence. Null renders explicit words now.
 *
 * It is a pure presenter: everything it shows was resolved by `resolveKpi`, so the number and the
 * link it drills to were computed from one context and cannot disagree.
 */

const STATE_WORD: Record<KpiState, string | null> = {
  // `ok` is deliberately silent. Annotating every healthy number with "OK" is noise, and noise is
  // what trains people to stop reading the annotations that matter.
  ok: null,
  attention: 'Needs attention',
  critical: 'Action needed',
  unknown: 'No data yet',
};

const STATE_STYLE: Record<KpiState, string> = {
  ok: 'text-text',
  attention: 'text-warning-text',
  critical: 'text-error-text',
  unknown: 'text-text-muted',
};

export function KpiCard({ kpi }: { kpi: ResolvedKpi }) {
  const { def, result, to } = kpi;
  const Icon = def.icon;
  const descId = `kpi-${def.id}-desc`;
  const word = STATE_WORD[result.state];
  const hasValue = result.value !== null;

  return (
    <Link
      to={to}
      aria-describedby={descId}
      className="group flex flex-col justify-between rounded-lg border border-border bg-surface p-4 transition-[border-color,box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:border-border-strong hover:shadow-e2 focus-visible:border-border-strong motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-label text-text-muted">{def.label}</span>
        <Icon size={16} className={cn('shrink-0', STATE_STYLE[result.state])} aria-hidden />
      </div>

      <div className="mt-2 flex items-baseline gap-1">
        {hasValue ? (
          <>
            <CountUp
              value={result.value!}
              className={cn('text-display leading-none tabular-nums', STATE_STYLE[result.state])}
            />
            {result.suffix && <span className="text-body-sm text-text-muted">{result.suffix}</span>}
          </>
        ) : (
          // Words, not a dash. The dash was the entire accessible value.
          <span className="text-body-sm text-text-muted">{def.nullHint}</span>
        )}
      </div>

      {word && <span className={cn('mt-1 text-label-sm', STATE_STYLE[result.state])}>{word}</span>}

      <span id={descId} className="mt-1 text-caption text-text-muted">
        {def.question}
      </span>
    </Link>
  );
}
