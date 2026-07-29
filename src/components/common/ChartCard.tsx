import type { ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';

/**
 * The canonical Recharts card: title + business-question subtitle + empty state + an
 * ACCESSIBLE DATA TABLE (D06-1).
 *
 * This exact block (`ChartCard` / `Card`) was hand-copied verbatim between the dashboard and
 * reports charts (D04 #18), including its `AXIS` / `GRID` / `tooltipStyle` companions — those
 * live beside this component in `./chartStyles` (kept out of this file so it stays
 * component-only for React Fast Refresh).
 *
 * ---
 * D06-1 — why the table exists.
 *
 * This card previously wrapped the chart in `role="img"` with `aria-label={title + question}`
 * and nothing else. `role="img"` makes the SVG's contents PRESENTATIONAL, so that markup did
 * not merely fail to expose the data — it actively hid it. A screen-reader user heard
 * "Ticket status distribution. How is the work spread across the lifecycle? Image." and learned
 * precisely nothing about the work. The label looked like accessibility work had been done,
 * which is worse than an obviously bare chart, because it stops anyone looking again.
 *
 * D02 framed the dashboard as a Decision Support System. A decision support system some of its
 * users cannot read is not supporting their decisions. The fix is the one D06 §8 prescribes:
 * the numbers exist in TEXT, not only in pixels.
 *
 * The table is `sr-only` rather than visible because the sighted user already has the chart —
 * this closes the gap without duplicating content on screen. It is a real `<table>` with a
 * caption and scoped headers, so screen-reader table navigation works: row by row, with the
 * header announced against each cell.
 */
export interface ChartSeriesPoint {
  readonly label: string;
  readonly value: number | string;
}

export function ChartCard({
  title,
  question,
  hasData,
  // Defaulted, though the prop is required by the type. TypeScript protects every call site in
  // this repo; this protects the RUNTIME from a caller that isn't type-checked — a stale
  // hot-reloaded module served against a newer component crashed the whole Reports page through
  // the error boundary during D06. A missing table is a degraded chart; a thrown TypeError is a
  // blank page. The type still forbids omitting it, so this cannot mask a real mistake in source.
  series = [],
  valueLabel = 'Count',
  children,
}: {
  title: string;
  question: string;
  hasData: boolean;
  /** The plotted data, as text. REQUIRED — a chart with no table is unreadable to some users. */
  series: readonly ChartSeriesPoint[];
  /** Column heading for the measure, e.g. "Tickets", "Hours". */
  valueLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="card-p">
      <h3 className="text-body-medium text-text">{title}</h3>
      <p className="mb-3 text-caption text-text-muted">{question}</p>
      {hasData ? (
        <>
          {/**
           * `aria-hidden` on the visual chart: the table below is the accessible rendering, and
           * exposing both would read every value twice.
           *
           * `inert` is REQUIRED alongside it, not decoration. Recharts renders `<g tabindex="0">`
           * inside a Pie, so `aria-hidden` alone produced a serious `aria-hidden-focus` failure —
           * a keyboard user could Tab into a subtree the screen reader had been told does not
           * exist, landing on something with no announced name, role or context. `inert` removes
           * it from the tab order AND the accessibility tree, which is the pairing that is
           * actually correct. (Introduced and caught within D06 — axe flagged it immediately.)
           *
           * `inert` is not in React 18's JSX types; the cast is the documented workaround and the
           * attribute is emitted verbatim.
           */}
          <div className="h-56" aria-hidden {...({ inert: '' } as Record<string, string>)}>
            <ResponsiveContainer width="100%" height="100%">
              {children as React.ReactElement}
            </ResponsiveContainer>
          </div>
          {/*
            `sr-only` WRAPS the table; it is not applied TO it. A <table> keeps `display: table`
            and `table-layout: auto`, which makes it as wide as its min-content REGARDLESS of the
            utility's `width: 1px` — so the "invisible" table was still 463px wide and dragged the
            document 234px past the viewport on mobile, giving every charted page a horizontal
            scrollbar. Measured live at 375px. A plain <div> honours the width, and the table
            inside it is clipped by the wrapper's `overflow: hidden`.
          */}
          <div className="sr-only">
          <table>
            <caption>{`${title}. ${question}`}</caption>
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">{valueLabel}</th>
              </tr>
            </thead>
            <tbody>
              {series.map((p) => (
                <tr key={p.label}>
                  <th scope="row">{p.label}</th>
                  <td>{p.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      ) : (
        <div className="flex h-56 items-center justify-center rounded-md bg-surface-sunken text-body-sm text-text-secondary">
          Not enough data yet
        </div>
      )}
    </div>
  );
}
