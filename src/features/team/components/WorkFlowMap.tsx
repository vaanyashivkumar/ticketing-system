import { useMemo, useState } from 'react';
import { ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import type { Ticket } from '@domain/types/ticket.types';
import type { TeamMember, TeamScope } from '@domain/team/teamMetrics';
import {
  buildFlowGraph, layoutFlowGraph, initialExpanded, flattenForReading,
  NODE_W, NODE_H, type FlowNode,
} from '@domain/team/flowGraph';

/**
 * THE WORK-FLOW MAP — an expandable mind map of where work goes.
 *
 * ── WHY HTML NODES OVER AN SVG LAYER, RATHER THAN ALL SVG ─────────────────────────────────────
 * The connectors want to be curves, which is SVG's job. The nodes want to be focusable, labelled
 * controls that announce their expanded state, which is a `<button>`'s job and something SVG does
 * badly. So the curves are a `pointer-events-none` SVG sitting behind real buttons positioned over
 * it. Keyboard users get the same tree sighted users do, rather than an image with a table beside
 * it as an apology.
 *
 * It deliberately does NOT claim `role="tree"`. That contract promises arrow-key navigation
 * between nodes, and a widget that announces itself as a tree while only responding to Tab is
 * worse than one that never made the claim — a screen-reader user would be pressing keys that do
 * nothing. These are buttons with `aria-expanded`, which is exactly what they are.
 *
 * Reading order is the tree's own order: `layoutFlowGraph` returns nodes pre-ordered, so the DOM
 * sequence of absolutely-positioned elements matches the shape on screen.
 */

const KIND_CLASS: Record<FlowNode['kind'], string> = {
  root: 'bg-primary text-primary-on border-transparent',
  department: 'bg-surface-elevated text-text border-border',
  person: 'bg-surface text-text border-border',
  // Leaves are where work LANDS, not who owns it — quieter, so the eye follows the branches.
  destination: 'bg-surface-sunken text-text-secondary border-border',
};

export function WorkFlowMap({
  tickets, team, scope, rootLabel,
}: {
  tickets: readonly Ticket[];
  team: readonly TeamMember[];
  scope: TeamScope;
  rootLabel: string;
}) {
  const graph = useMemo(
    () => buildFlowGraph(tickets, team, scope, rootLabel),
    [tickets, team, scope, rootLabel],
  );
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => initialExpanded(graph));
  const layout = useMemo(() => layoutFlowGraph(graph, expanded), [graph, expanded]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allIds = useMemo(
    () => flattenForReading(graph).filter((n) => n.node.children.length > 0).map((n) => n.node.id),
    [graph],
  );
  const allOpen = allIds.every((id) => expanded.has(id));

  if (graph.count === 0) {
    return (
      <div className="card card-p mt-3">
        <p className="text-body-sm text-text-secondary">
          No work has moved yet — nothing has been raised or handed over.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-caption text-text-muted">
          Select a box to open or close its branch.
        </p>
        <button
          type="button"
          className="btn-quiet text-caption"
          onClick={() => setExpanded(allOpen ? new Set([graph.id]) : new Set(allIds))}
        >
          {allOpen ? <Minimize2 size={14} aria-hidden /> : <Maximize2 size={14} aria-hidden />}
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      {/*
        The map scrolls in its OWN container. A deep branch is wider than the page, and the one
        thing it must never do is push the page itself sideways.
      */}
      <div className="table-shell overflow-x-auto p-4">
        <div className="relative" style={{ width: layout.width, height: layout.height }}>
          <svg
            className="pointer-events-none absolute inset-0"
            width={layout.width}
            height={layout.height}
            aria-hidden
            focusable="false"
          >
            {layout.edges.map((e) => (
              <path
                key={e.id}
                d={e.path}
                fill="none"
                stroke="var(--color-border)"
                strokeWidth="1.5"
              />
            ))}
          </svg>

          {layout.nodes.map(({ node, x, y, hasChildren, isExpanded }) => {
            const label = `${node.label}, ${node.count} ${node.count === 1 ? 'request' : 'requests'}`;
            const common = `absolute flex items-center gap-2 rounded-md border px-3 text-body-sm ${KIND_CLASS[node.kind]}`;
            const style = { left: x, top: y, width: NODE_W, height: NODE_H };

            if (!hasChildren) {
              return (
                <div key={node.id} className={common} style={style}>
                  <span className="min-w-0 flex-1 truncate">{node.label}</span>
                  <span className="shrink-0 tabular-nums">{node.count}</span>
                </div>
              );
            }
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => toggle(node.id)}
                aria-expanded={isExpanded}
                aria-label={`${label}. ${isExpanded ? 'Collapse' : 'Expand'}`}
                className={`${common} text-left transition-colors duration-fast hover:border-primary`}
                style={style}
              >
                <ChevronRight
                  size={14}
                  aria-hidden
                  className={`shrink-0 transition-transform duration-fast ${isExpanded ? 'rotate-90' : ''}`}
                />
                <span className="min-w-0 flex-1 truncate">{node.label}</span>
                <span className="shrink-0 tabular-nums">{node.count}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
