import { StatusChart, CategoryChart, PriorityChart, SourceDeptChart } from './DashboardCharts';
import type { Scope } from '@domain/dashboard/scope';

/**
 * Deferred chart panel (P14 §18). This module — and the whole Recharts dependency — is
 * lazy-loaded by DashboardPage, so charts never block the initial dashboard render
 * (KPIs and urgent work paint first). Default export so React.lazy() can consume it.
 */
export interface ChartsData {
  status: { status: string; count: number }[];
  category: { name: string; count: number }[];
  priority: { name: string; count: number }[];
  sourceDept: { name: string; count: number }[];
}

export default function DashboardChartsPanel({ data, scope }: { data: ChartsData; scope: Scope }) {
  const wide = scope === 'hub' || scope === 'global';
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <StatusChart data={data.status} />
      {wide ? <SourceDeptChart data={data.sourceDept} /> : <CategoryChart data={data.category} />}
      <PriorityChart data={data.priority} />
      {wide && <CategoryChart data={data.category} />}
    </div>
  );
}
