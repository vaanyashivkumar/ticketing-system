import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { usePrefersReducedMotion, CHART_ANIMATION_MS } from '@hooks/usePrefersReducedMotion';
import { ChartCard } from '@components/common/ChartCard';
import { AXIS, GRID, tooltipStyle } from '@components/common/chartStyles';
import { useAxisWidth } from '@components/common/useAxisWidth';

/**
 * Dashboard charts (P14 §11; Recharts, ratified R5). Each chart answers ONE business
 * question (stated in its description) and degrades to an empty state — never decorative.
 * Fills use design tokens; every chart carries a title + accessible description.
 */
import { PRIORITY_COLOR_BY_LABEL } from '@domain/workflow/priorityEngine';

const PALETTE = ['var(--color-primary)', 'var(--color-accent)', 'var(--color-info)', 'var(--color-warning)', 'var(--color-success)', 'var(--color-secondary)'];
const PRIORITY_FILL = PRIORITY_COLOR_BY_LABEL;

export function StatusChart({ data }: { data: { status: string; count: number }[] }) {
  const reduced = usePrefersReducedMotion();
  return (
    <ChartCard title="Ticket status distribution" question="How is the work spread across the lifecycle?" hasData={data.length > 0}
      series={data.map((d) => ({ label: d.status, value: d.count }))} valueLabel="Tickets">
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
        <XAxis dataKey="status" tick={{ fontSize: 11, fill: AXIS }} interval={0} angle={-25} textAnchor="end" height={50} stroke={GRID} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: AXIS }} stroke={GRID} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--color-row-hover)' }} />
        <Bar isAnimationActive={!reduced} animationDuration={CHART_ANIMATION_MS} dataKey="count" radius={[3, 3, 0, 0]} fill="var(--color-primary)" />
      </BarChart>
    </ChartCard>
  );
}

export function CategoryChart({ data }: { data: { name: string; count: number }[] }) {
  const reduced = usePrefersReducedMotion();
  const yAxisWidth = useAxisWidth();
  return (
    <ChartCard title="Top categories" question="Which request types dominate your workload?" hasData={data.length > 0}
      series={data.map((d) => ({ label: d.name, value: d.count }))} valueLabel="Tickets">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: AXIS }} stroke={GRID} />
        {/* D04 #27: was a hardcoded 130px, which ate most of the plot area at sm (where the
            2-column split makes each chart narrower than it is single-column). Proportional,
            floored so labels stay legible. */}
        <YAxis type="category" dataKey="name" width={yAxisWidth} tick={{ fontSize: 11, fill: AXIS }} stroke={GRID} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--color-row-hover)' }} />
        <Bar isAnimationActive={!reduced} animationDuration={CHART_ANIMATION_MS} dataKey="count" radius={[0, 3, 3, 0]}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Bar>
      </BarChart>
    </ChartCard>
  );
}

export function PriorityChart({ data }: { data: { name: string; count: number }[] }) {
  const reduced = usePrefersReducedMotion();
  return (
    <ChartCard title="Priority mix" question="How much urgent work is in play?" hasData={data.length > 0}
      series={data.map((d) => ({ label: d.name, value: d.count }))} valueLabel="Tickets">
      <PieChart>
        <Pie isAnimationActive={!reduced} animationDuration={CHART_ANIMATION_MS} data={data} dataKey="count" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
          {data.map((d) => <Cell key={d.name} fill={PRIORITY_FILL[d.name] ?? 'var(--color-info)'} />)}
        </Pie>
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--color-text-secondary)' }} />
        <Tooltip contentStyle={tooltipStyle} />
      </PieChart>
    </ChartCard>
  );
}

export function SourceDeptChart({ data }: { data: { name: string; count: number }[] }) {
  const reduced = usePrefersReducedMotion();
  return (
    <ChartCard title="Incoming by department" question="Which departments are sending you the most work?" hasData={data.length > 0}
      series={data.map((d) => ({ label: d.name, value: d.count }))} valueLabel="Tickets">
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: AXIS }} stroke={GRID} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: AXIS }} stroke={GRID} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--color-row-hover)' }} />
        <Bar isAnimationActive={!reduced} animationDuration={CHART_ANIMATION_MS} dataKey="count" radius={[3, 3, 0, 0]} fill="var(--color-accent)" />
      </BarChart>
    </ChartCard>
  );
}
