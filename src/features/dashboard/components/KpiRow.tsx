import type { ResolvedKpi } from '@domain/dashboard/kpiRegistry';
import { useRevealStagger } from '@hooks/useMotion';
import { KpiCard } from './KpiCard';

/**
 * The KPI row, plus the disclosure that makes its numbers checkable.
 *
 * The audit that preceded this build found the status KPIs and the SLA buckets on one screen
 * silently disagreeing about whether Draft and Cancelled were in the denominator — two numbers
 * computed over different populations with nothing saying so, and the discrepancy blamed on the
 * dashboard rather than on the three different filters underneath it.
 *
 * Every KPI now states what it counted. It goes in a `<details>` rather than on each card because
 * the sentences are long and the cards must stay scannable — but it is real text in the DOM,
 * available to sighted and screen-reader users alike, not a `title` attribute that only a mouse
 * can reach.
 */
export function KpiRow({ kpis }: { kpis: readonly ResolvedKpi[] }) {
  /**
   * The tiles cascade in left to right, over a fixed 180ms total however many there are.
   *
   * `kpis.length` is in the dependency list because the row renders before the tickets resolve:
   * without it the stagger would run once against an empty grid and the real tiles would appear
   * unanimated — motion that silently does nothing, which is worse than none, because it looks
   * correct in review and never runs in the app.
   */
  const grid = useRevealStagger<HTMLDivElement>(':scope > a', { amount: 0.18 }, [kpis.length]);

  if (kpis.length === 0) return null;
  return (
    <div>
      {/* The cards are the grid's direct children and are targeted in place. Wrapping each one to
          give it a hook would make the WRAPPER the grid item, and the card would no longer
          stretch to the cell — a layout regression paid for a selector. */}
      {/* INTRINSIC columns, not viewport breakpoints. `xl:grid-cols-6` fired on WINDOW width,
          but the tiles live in CONTENT width — at a 1280px window the sidebar and insets leave
          ~908px, and six columns of that (minus the remapped p-4 = 32px card padding) left ~67px
          of text: one word per line, stretched to the tallest tile. auto-fit + a 180px floor
          derives the column count from the space that actually exists, whatever the sidebar,
          zoom or viewport are doing. */}
      <div ref={grid} className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {kpis.map((k) => (
          <KpiCard key={k.def.id} kpi={k} />
        ))}
      </div>
      <details className="mt-2 rounded-md border border-border bg-surface px-3 py-2">
        <summary className="cursor-pointer text-caption text-text-secondary">How these are counted</summary>
        <dl className="mt-2 space-y-2">
          {kpis.map((k) => (
            <div key={k.def.id}>
              <dt className="text-label-sm text-text">
                {k.def.label}
                {k.def.metric && <span className="ml-1 font-mono text-caption text-text-muted">{k.def.metric}</span>}
              </dt>
              <dd className="text-caption text-text-muted">{k.denominator}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
