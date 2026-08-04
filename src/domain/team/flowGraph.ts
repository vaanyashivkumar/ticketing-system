import type { Ticket } from '@domain/types/ticket.types';
import type { DepartmentCode } from '@domain/types/auth.types';
import { DEPARTMENTS } from '@config/departments.config';
import type { TeamMember, TeamScope } from './teamMetrics';

/**
 * THE WORK-FLOW MAP — the "how work flows" picture as an expandable tree.
 *
 * A flat list of `A → B · 12` rows answers "where does work go" only if you already hold the shape
 * of the organisation in your head. This models the same facts as a tree so the shape is the thing
 * you see: the company, its departments, its people, and where each one's work lands.
 *
 * ── WHY THIS IS A PURE MODULE ─────────────────────────────────────────────────────────────────
 * Layout is arithmetic, and arithmetic is testable. Keeping position assignment out of the
 * component means the tree can be asserted — that a collapsed branch takes no vertical space, that
 * a parent sits level with its children — rather than eyeballed in a browser that, in this
 * project's harness, cannot even composite frames to be eyeballed in.
 *
 * ── WHY NO GRAPH LIBRARY ──────────────────────────────────────────────────────────────────────
 * The bundle already carries a >500 kB warning and Recharts is the one charting dependency that
 * earned its place. A tidy left-to-right tree is a few lines of arithmetic; importing a layout
 * engine to avoid writing them would be the more expensive choice, not the cheaper one.
 *
 * ── ETHICS, unchanged ─────────────────────────────────────────────────────────────────────────
 * Every number here is a COUNT of tickets on a route. No timings, no ordering of people by output.
 * Branches sort by volume because the question is "where does work go"; within a person's branch
 * that orders their DESTINATIONS, never people against each other.
 */

export type FlowNodeKind = 'root' | 'department' | 'person' | 'destination';

export interface FlowNode {
  readonly id: string;
  readonly label: string;
  readonly kind: FlowNodeKind;
  /** Tickets represented by this node and everything under it. */
  readonly count: number;
  readonly children: readonly FlowNode[];
}

/** One ticket's journey, reduced to the two ends the map draws. */
interface Hop {
  readonly fromId: string;
  readonly fromLabel: string;
  readonly fromDept: DepartmentCode;
  readonly toLabel: string;
}

const deptName = (code: DepartmentCode): string => DEPARTMENTS[code].name;

/**
 * Reduce tickets to hops. Mirrors `workFlows`' rules exactly — drafts have not moved, an end
 * inside the team is a person, an end outside collapses to its department, and unassigned work
 * has still moved to the destination department.
 */
function hops(tickets: readonly Ticket[], team: readonly TeamMember[]): Hop[] {
  const byId = new Map(team.map((m) => [m.id, m]));
  const out: Hop[] = [];
  for (const t of tickets) {
    if (t.status === 'Draft') continue;
    const from = byId.get(t.createdById);
    if (!from) continue; // the map is about THIS team's work; inbound-only tickets have no origin here
    const toPerson = t.assignedToId ? byId.get(t.assignedToId) : undefined;
    const toLabel = toPerson ? toPerson.name : deptName(t.toDeptCode);
    if (toPerson && toPerson.id === from.id) continue; // raised and held by one person: no hand-off
    out.push({ fromId: from.id, fromLabel: from.name, fromDept: from.departmentCode, toLabel });
  }
  return out;
}

/** Group, count, and order by volume — routes by traffic, never people by output. */
function destinationsOf(list: readonly Hop[], parentId: string): FlowNode[] {
  const tally = new Map<string, number>();
  for (const h of list) tally.set(h.toLabel, (tally.get(h.toLabel) ?? 0) + 1);
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, count]) => ({ id: `${parentId}>${label}`, label, kind: 'destination' as const, count, children: [] }));
}

function personNode(list: readonly Hop[], member: TeamMember): FlowNode {
  const mine = list.filter((h) => h.fromId === member.id);
  return {
    id: `p:${member.id}`,
    label: member.name,
    kind: 'person',
    count: mine.length,
    children: destinationsOf(mine, `p:${member.id}`),
  };
}

/**
 * Build the tree.
 *
 * `department` scope — root → each person → where their work goes.
 * `company` scope   — root → each department → its people → where their work goes. The extra level
 *   exists because 27 people hanging off one root is a list, not a map; departments are the shape
 *   an MD actually thinks in.
 */
export function buildFlowGraph(
  tickets: readonly Ticket[],
  team: readonly TeamMember[],
  scope: TeamScope,
  rootLabel: string,
): FlowNode {
  const list = hops(tickets, team);

  if (scope === 'company') {
    const codes = [...new Set(team.map((m) => m.departmentCode))];
    const departments = codes
      .map((code) => {
        const members = team.filter((m) => m.departmentCode === code);
        const people = members.map((m) => personNode(list, m)).filter((p) => p.count > 0);
        return {
          id: `d:${code}`,
          label: deptName(code),
          kind: 'department' as const,
          count: people.reduce((n, p) => n + p.count, 0),
          children: people.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
        };
      })
      .filter((d) => d.count > 0)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return {
      id: 'root',
      label: rootLabel,
      kind: 'root',
      count: departments.reduce((n, d) => n + d.count, 0),
      children: departments,
    };
  }

  const people = team
    .map((m) => personNode(list, m))
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return {
    id: 'root',
    label: rootLabel,
    kind: 'root',
    count: people.reduce((n, p) => n + p.count, 0),
    children: people,
  };
}

// ── Layout ────────────────────────────────────────────────────────────────────────────────────

export const NODE_W = 168;
export const NODE_H = 40;
export const COL_GAP = 72;
export const ROW_GAP = 12;
const ROW = NODE_H + ROW_GAP;

export interface PositionedNode {
  readonly node: FlowNode;
  readonly depth: number;
  readonly x: number;
  readonly y: number;
  readonly hasChildren: boolean;
  readonly isExpanded: boolean;
}

export interface FlowEdge {
  readonly id: string;
  /** Cubic bezier, so the connectors curve the way a mind map's do rather than dog-legging. */
  readonly path: string;
}

export interface FlowLayout {
  readonly nodes: readonly PositionedNode[];
  readonly edges: readonly FlowEdge[];
  readonly width: number;
  readonly height: number;
}

/**
 * Tidy left-to-right tree.
 *
 * Visible LEAVES claim a row each; a parent centres on the span of its visible children. A
 * collapsed node is a leaf for layout purposes, so folding a branch genuinely reclaims the space
 * rather than leaving a hole — the property most worth testing here, and the one a reader would
 * assume without checking.
 */
export function layoutFlowGraph(root: FlowNode, expanded: ReadonlySet<string>): FlowLayout {
  const nodes: PositionedNode[] = [];
  const edges: FlowEdge[] = [];
  let nextRow = 0;
  let maxDepth = 0;

  const place = (node: FlowNode, depth: number): number => {
    maxDepth = Math.max(maxDepth, depth);
    const open = expanded.has(node.id) && node.children.length > 0;
    const x = depth * (NODE_W + COL_GAP);

    let y: number;
    if (!open) {
      y = nextRow * ROW;
      nextRow += 1;
    } else {
      const ys = node.children.map((c) => place(c, depth + 1));
      y = (ys[0]! + ys[ys.length - 1]!) / 2;
    }

    nodes.push({
      node, depth, x, y,
      hasChildren: node.children.length > 0,
      isExpanded: open,
    });

    if (open) {
      for (const child of node.children) {
        const cy = nodes.find((n) => n.node.id === child.id)!.y;
        const x1 = x + NODE_W;
        const x2 = x + NODE_W + COL_GAP;
        const mid = x1 + COL_GAP / 2;
        edges.push({
          id: `${node.id}->${child.id}`,
          path: `M ${x1} ${y + NODE_H / 2} C ${mid} ${y + NODE_H / 2}, ${mid} ${cy + NODE_H / 2}, ${x2} ${cy + NODE_H / 2}`,
        });
      }
    }
    return y;
  };

  place(root, 0);

  /**
   * Re-order into pre-order before returning. Positions have to be computed children-first (a
   * parent centres on its children), but the nodes are absolutely positioned, so DOM order is
   * READING order — and post-order would announce every leaf before the branch it belongs to.
   * Sorting here rather than in the component means the guarantee is testable.
   */
  const byId = new Map(nodes.map((n) => [n.node.id, n]));
  const ordered: PositionedNode[] = [];
  const walk = (n: FlowNode): void => {
    const placed = byId.get(n.id);
    if (!placed) return;
    ordered.push(placed);
    if (placed.isExpanded) n.children.forEach(walk);
  };
  walk(root);

  return {
    nodes: ordered,
    edges,
    width: (maxDepth + 1) * NODE_W + maxDepth * COL_GAP,
    height: Math.max(nextRow, 1) * ROW - ROW_GAP,
  };
}

/** Ids to expand initially: the root and, in the company view, nothing below it. */
export function initialExpanded(root: FlowNode): Set<string> {
  return new Set([root.id]);
}

/** Depth-first order, for the screen-reader alternative — the same tree, as a nested list. */
export function flattenForReading(node: FlowNode, depth = 0): { node: FlowNode; depth: number }[] {
  return [{ node, depth }, ...node.children.flatMap((c) => flattenForReading(c, depth + 1))];
}
