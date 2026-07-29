import { PieChart, Pie, Cell, Legend, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { usePrefersReducedMotion, CHART_ANIMATION_MS } from '@hooks/usePrefersReducedMotion';
import { ChartCard } from '@components/common/ChartCard';
import { AXIS, GRID, tooltipStyle } from '@components/common/chartStyles';

/**
 * Report charts (P16). Lazy-loaded (default export) so Recharts stays out of the main
 * bundle — same treatment as the dashboard. Each chart answers one management question.
 */
const SLA_FILL: Record<string, string> = {
  'Within SLA': 'var(--color-success)',
  Approaching: 'var(--color-warning)',
  Breached: 'var(--color-error)',
};

export default function ReportChartsPanel({
  sla,
  trend,
}: {
  sla: { name: string; count: number }[];
  trend: { day: string; created: number; resolved: number }[];
}) {
  const reduced = usePrefersReducedMotion();
  const slaHasData = sla.some((s) => s.count > 0);
  const trendHasData = trend.some((t) => t.created > 0 || t.resolved > 0);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ChartCard title="SLA health" question="How much open work is at risk of breaching?" hasData={slaHasData}
        series={sla.map((s) => ({ label: s.name, value: s.count }))} valueLabel="Tickets">
        <PieChart>
          <Pie isAnimationActive={!reduced} animationDuration={CHART_ANIMATION_MS} data={sla} dataKey="count" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
            {sla.map((s) => <Cell key={s.name} fill={SLA_FILL[s.name]} />)}
          </Pie>
          <Legend wrapperStyle={{ fontSize: 12, color: 'var(--color-text-secondary)' }} />
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ChartCard>

      <ChartCard title="Volume trend (14 days)" question="Are we resolving as fast as work arrives?" hasData={trendHasData}
        series={trend.map((t) => ({ label: t.day, value: `${t.created} created, ${t.resolved} resolved` }))} valueLabel="Movement">
        <LineChart data={trend} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 10, fill: AXIS }} stroke={GRID} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: AXIS }} stroke={GRID} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12, color: 'var(--color-text-secondary)' }} />
          <Line isAnimationActive={!reduced} animationDuration={CHART_ANIMATION_MS} type="monotone" dataKey="created" name="Created" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
          <Line isAnimationActive={!reduced} animationDuration={CHART_ANIMATION_MS} type="monotone" dataKey="resolved" name="Resolved" stroke="var(--color-success)" strokeWidth={2} dot={false} />
        </LineChart>
      </ChartCard>
    </div>
  );
}
