import { useEffect, useMemo, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import { ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import type { Ticket } from '@domain/types/ticket.types';
import type { TeamMember, TeamScope } from '@domain/team/teamMetrics';
import {
  buildFlowGraph, layoutFlowGraph, initialExpanded, flattenForReading,
  NODE_W, NODE_H, type FlowNode, type FlowLayout,
} from '@domain/team/flowGraph';
import { fanOut, glide, drawIn, morphPath } from '@lib/motion';

/**
 * THE WORK-FLOW MAP — an expandable mind map of where work goes, animated the way NotebookLM's
 * mind maps move (stakeholder reference, 2026-08-04): children FAN OUT of their parent with a
 * stagger, connectors DRAW themselves in, and when the tree re-lays-out, surviving nodes GLIDE to
 * their new positions while their connectors bend along.
 *
 * ── HOW THE ANIMATION LAYER ATTACHES ──────────────────────────────────────────────────────────
 * React commits the FINAL layout — positions, opacity, paths — exactly as before; the tweens only
 * play the journey into it. The diff between the previous layout and this one is computed during
 * render and written onto the elements as data attributes (`data-anim`, `data-spawn-dx`,
 * `data-prev-d` …), and the `useGSAP` pass reads the DOM back rather than threading arrays
 * through. That split is what keeps the two invariants the motion module is built on:
 *
 *   1. A document that never ticks — the hidden preview pane, a background tab, reduced motion —
 *      simply SHOWS the committed layout. Every tween is `fromTo` + `immediateRender: false`, so
 *      nothing touches the DOM until a frame genuinely renders.
 *   2. State is never gated on a tween. Collapse commits IMMEDIATELY and the survivors glide;
 *      there is no "retract, then setState on onComplete", because a callback that only fires on
 *      a ticking document would deadlock the UI in one that never ticks.
 *
 * ── WHY HTML NODES OVER AN SVG LAYER, RATHER THAN ALL SVG ─────────────────────────────────────
 * The connectors want to be curves, which is SVG's job. The nodes want to be focusable, labelled
 * controls that announce their expanded state, which is a `<button>`'s job and something SVG does
 * badly. So the curves are a `pointer-events-none` SVG sitting behind real buttons positioned over
 * it. Keyboard users get the same tree sighted users do.
 *
 * It deliberately does NOT claim `role="tree"` — that contract promises arrow-key navigation, and
 * announcing a tree that only answers Tab is worse than never claiming it. These are buttons with
 * `aria-expanded`, which is exactly what they are.
 */

const KIND_CLASS: Record<FlowNode['kind'], string> = {
  root: 'bg-primary text-primary-on border-transparent',
  department: 'bg-surface-elevated text-text border-border',
  person: 'bg-surface text-text border-border',
  // Leaves are where work LANDS, not who owns it — quieter, so the eye follows the branches.
  destination: 'bg-surface-sunken text-text-secondary border-border',
};

/** What the render-time diff decides about each element; the GSAP pass selects on these. */
type NodeAnim =
  | { readonly kind: 'enter'; readonly dx: number; readonly dy: number }
  | { readonly kind: 'move'; readonly dx: number; readonly dy: number }
  | { readonly kind: 'still' };

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

  const stageRef = useRef<HTMLDivElement>(null);
  /**
   * The layout the PREVIOUS commit rendered — the "from" of every journey. Updated in an effect
   * with a symmetric cleanup, so StrictMode's mount–cleanup–mount leaves it exactly as a single
   * mount would; the render-time diff below then computes the same attributes in dev and prod.
   */
  const prevLayoutRef = useRef<FlowLayout | null>(null);
  const prev = prevLayoutRef.current;

  const { nodeAnims, edgeAnims } = useMemo(() => {
    const prevNodes = new Map((prev?.nodes ?? []).map((n) => [n.node.id, n]));
    const prevEdges = new Map((prev?.edges ?? []).map((e) => [e.id, e.path]));
    const posById = new Map(layout.nodes.map((n) => [n.node.id, n]));

    const nodeAnims = new Map<string, NodeAnim>();
    for (const n of layout.nodes) {
      const before = prevNodes.get(n.node.id);
      if (!before) {
        // New on screen: spawn at the parent's NEW position (the root spawns in place).
        const parent = n.parentId ? posById.get(n.parentId) : undefined;
        nodeAnims.set(n.node.id, {
          kind: 'enter',
          dx: parent ? parent.x - n.x : 0,
          dy: parent ? parent.y - n.y : 0,
        });
      } else if (before.x !== n.x || before.y !== n.y) {
        nodeAnims.set(n.node.id, { kind: 'move', dx: before.x - n.x, dy: before.y - n.y });
      } else {
        nodeAnims.set(n.node.id, { kind: 'still' });
      }
    }

    const edgeAnims = new Map<string, { kind: 'enter' } | { kind: 'morph'; prevD: string }>();
    for (const e of layout.edges) {
      const before = prevEdges.get(e.id);
      if (!before) edgeAnims.set(e.id, { kind: 'enter' });
      else if (before !== e.path) edgeAnims.set(e.id, { kind: 'morph', prevD: before });
    }
    return { nodeAnims, edgeAnims };
  }, [layout, prev]);

  useGSAP(
    () => {
      const stage = stageRef.current;
      if (!stage) return;
      const entering = stage.querySelectorAll('[data-anim="enter"]');
      const moving = stage.querySelectorAll('[data-anim="move"]');
      const drawnIn = stage.querySelectorAll('path[data-anim-edge="enter"]');
      const morphing = stage.querySelectorAll('path[data-anim-edge="morph"]');

      // Survivors settle first; the new branch fans out a beat behind them, the way NotebookLM
      // opens — the tree makes room, then the children arrive into it.
      const fanDelay = moving.length > 0 ? 0.08 : 0;
      if (moving.length) glide(moving);
      if (morphing.length) morphPath(morphing);
      if (entering.length) fanOut(entering, { delay: fanDelay });
      if (drawnIn.length) drawIn(drawnIn, { delay: fanDelay });
    },
    { scope: stageRef, dependencies: [layout] },
  );

  useEffect(() => {
    const before = prevLayoutRef.current;
    prevLayoutRef.current = layout;
    return () => { prevLayoutRef.current = before; };
  }, [layout]);

  const toggle = (id: string) =>
    setExpanded((prevSet) => {
      const next = new Set(prevSet);
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
        {/* The canvas itself eases to its new size, so a branch opening reads as the map growing
            rather than the container snapping. CSS, not GSAP: the resting size is the styled size,
            so an environment with no animation simply has the right dimensions immediately. */}
        <div
          ref={stageRef}
          className="relative transition-[width,height] duration-base ease-standard"
          style={{ width: layout.width, height: layout.height }}
        >
          <svg
            className="pointer-events-none absolute inset-0"
            width={layout.width}
            height={layout.height}
            aria-hidden
            focusable="false"
          >
            {layout.edges.map((e) => {
              const anim = edgeAnims.get(e.id);
              return (
                <path
                  key={e.id}
                  d={e.path}
                  fill="none"
                  stroke="var(--color-border)"
                  strokeWidth="1.5"
                  {...(anim?.kind === 'enter' ? { 'data-anim-edge': 'enter' } : {})}
                  {...(anim?.kind === 'morph'
                    ? { 'data-anim-edge': 'morph', 'data-prev-d': anim.prevD, 'data-next-d': e.path }
                    : {})}
                />
              );
            })}
          </svg>

          {layout.nodes.map(({ node, x, y, hasChildren, isExpanded }) => {
            const anim = nodeAnims.get(node.id);
            const animAttrs =
              anim?.kind === 'enter'
                ? { 'data-anim': 'enter', 'data-spawn-dx': anim.dx, 'data-spawn-dy': anim.dy }
                : anim?.kind === 'move'
                  ? { 'data-anim': 'move', 'data-glide-dx': anim.dx, 'data-glide-dy': anim.dy }
                  : {};
            const label = `${node.label}, ${node.count} ${node.count === 1 ? 'request' : 'requests'}`;
            /**
             * `px-2`/`gap-1.5` are 16px/12px ON THE 8-POINT REMAP — the first version wrote
             * `px-3`/`gap-2` reading them as stock Tailwind (12/8px), and the remapped 24/16px
             * quietly ate ~90px of a 168px node, which is what truncated "All departments" to
             * "All depa…" on screen. Pills, not rectangles, per the NotebookLM reference.
             */
            const common = `absolute flex items-center gap-1.5 rounded-full border px-2 text-body-sm shadow-e1 ${KIND_CLASS[node.kind]}`;
            const chip = `shrink-0 rounded-full px-1.5 text-label-sm tabular-nums ${
              node.kind === 'root'
                ? 'bg-white/20 text-primary-on'
                : node.kind === 'destination'
                  ? 'bg-surface text-text-secondary'
                  : 'bg-surface-sunken text-text-secondary'
            }`;
            const style = { left: x, top: y, width: NODE_W, height: NODE_H };

            if (!hasChildren) {
              return (
                <div key={node.id} className={common} style={style} {...animAttrs}>
                  <span className="min-w-0 flex-1 truncate" title={node.label}>{node.label}</span>
                  <span className={chip}>{node.count}</span>
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
                className={`${common} text-left transition-[color,border-color,box-shadow] duration-fast hover:border-primary hover:shadow-e2`}
                style={style}
                {...animAttrs}
              >
                <ChevronRight
                  size={14}
                  aria-hidden
                  className={`shrink-0 transition-transform duration-fast ${isExpanded ? 'rotate-90' : ''}`}
                />
                <span className="min-w-0 flex-1 truncate" title={node.label}>{node.label}</span>
                <span className={chip}>{node.count}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
