import type { Priority } from '@domain/types/ticket.types';
import { PRIORITY_DEFINITIONS, DEFAULT_PRIORITY, type PriorityDefinition } from '@config/priority.config';

/**
 * Priority Engine — the single answer to every priority question. Holds no list of its own.
 */

const BY_ID = new Map<Priority, PriorityDefinition>(PRIORITY_DEFINITIONS.map((p) => [p.id, p]));

export function priorityDef(priority: Priority): PriorityDefinition {
  const def = BY_ID.get(priority);
  if (!def) throw new Error(`No priority definition for "${priority}"`);
  return def;
}

export const priorityLabel = (priority: Priority): string => priorityDef(priority).label;

/** Severity order, most urgent first. Replaces `PRIORITY_ORDER` and three copied arrays. */
export const ORDERED_PRIORITIES: readonly Priority[] = [...PRIORITY_DEFINITIONS]
  .sort((a, b) => a.rank - b.rank)
  .map((p) => p.id);

/**
 * Least urgent first — the order a CHOOSER should offer.
 *
 * Escalating should be a deliberate move down the list rather than the first thing the cursor
 * lands on, which is why the create form's order was never simply a mistake to be flattened
 * into the sort order.
 */
export const SELECTABLE_PRIORITIES: readonly Priority[] = [...ORDERED_PRIORITIES].reverse();

/** Sort comparator: most urgent first. */
export const byPriority = (a: Priority, b: Priority): number => priorityDef(a).rank - priorityDef(b).rank;

/** Is `a` more urgent than `b`? Used to describe a change as an escalation or a de-escalation. */
export const isMoreUrgent = (a: Priority, b: Priority): boolean => priorityDef(a).rank < priorityDef(b).rank;

/** Chart series colours, keyed by label so a chart can look up its own datum. */
export const PRIORITY_COLOR_BY_LABEL: Readonly<Record<string, string>> = Object.fromEntries(
  PRIORITY_DEFINITIONS.map((p) => [p.label, p.chartColorVar]),
);

export { PRIORITY_DEFINITIONS, DEFAULT_PRIORITY };
export type { PriorityDefinition };
