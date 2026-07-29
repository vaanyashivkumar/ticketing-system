import type { Priority, SlaFlag, SlaState, Ticket } from '@domain/types/ticket.types';
import type { SlaPolicy, EscalationRecipient } from '@config/sla.config';
import { DEFAULT_ORG_CONFIG } from '@config/org.config';

/**
 * SLA / business-time engine (P13 §15; phase-0 §9). Business time only. Awaiting Information
 * pauses the clock. Overdue is a DERIVED flag (On Track / Due Soon / Overdue), never a status.
 *
 * PURE: the engine owns NO business numbers. Both the SlaPolicy (resolution targets, due-soon
 * threshold) and the BusinessCalendar (working days/hours/holidays) are INJECTED from
 * configuration — P15 §7, "never hardcode SLA values throughout the application".
 */

/**
 * The business calendar, INJECTED (defect CFG-001).
 *
 * P15 §7 lifted the SLA *targets* out of this engine but left the *calendar* hardcoded as
 * `DAY_START = 9` / `DAY_END = 18` plus a Mon–Fri literal — so org.config's `workingHours`,
 * `workingDays` and `holidays` were DEAD CONFIG: an administrator could edit them and nothing
 * changed at all. Same "never hardcode business rules" violation P15 fixed once and left
 * half-finished. Config that looks live but is inert is worse than no config.
 *
 * KNOWN LIMIT, stated rather than hidden: `timezone` is still NOT honoured. This engine uses
 * native `Date.getHours()`/`getDay()` — the HOST machine's zone, not the configured IANA zone.
 * Fixing it needs a real tz implementation and belongs with the backend that owns the
 * authoritative clock (BACKEND_HANDOFF.md); a client clock is spoofable regardless.
 */
export interface BusinessCalendar {
  /** JS day numbers counting as working days (0 = Sun … 6 = Sat; org.config uses 1 = Mon). */
  readonly workingDays: readonly number[];
  readonly workingHours: { readonly start: number; readonly end: number };
  /** ISO dates (YYYY-MM-DD) that are not working days regardless of weekday. */
  readonly holidays: readonly string[];
}

/** Derive the engine's calendar from organisation configuration. */
export function calendarOf(org: {
  workingDays: readonly number[];
  workingHours: { readonly start: number; readonly end: number };
  holidays: readonly string[];
}): BusinessCalendar {
  return { workingDays: org.workingDays, workingHours: org.workingHours, holidays: org.holidays };
}

/** The default calendar — read from configuration, never a literal in this file. */
export const DEFAULT_CALENDAR: BusinessCalendar = calendarOf(DEFAULT_ORG_CONFIG);

const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function isBusinessDay(d: Date, cal: BusinessCalendar): boolean {
  return cal.workingDays.includes(d.getDay()) && !cal.holidays.includes(isoDate(d));
}

/** Add N business hours to a start instant, stepping only within the injected calendar's window. */
export function addBusinessHours(start: Date, hours: number, cal: BusinessCalendar = DEFAULT_CALENDAR): Date {
  const cursor = new Date(start);
  let remaining = hours * 60; // minutes

  // Advance the cursor into the business window if it starts outside it.
  const align = () => {
    while (!isBusinessDay(cursor, cal) || cursor.getHours() >= cal.workingHours.end || cursor.getHours() < cal.workingHours.start) {
      if (!isBusinessDay(cursor, cal) || cursor.getHours() >= cal.workingHours.end) {
        cursor.setDate(cursor.getDate() + 1);
        cursor.setHours(cal.workingHours.start, 0, 0, 0);
      } else if (cursor.getHours() < cal.workingHours.start) {
        cursor.setHours(cal.workingHours.start, 0, 0, 0);
      }
    }
  };

  align();
  while (remaining > 0) {
    const endOfDay = new Date(cursor);
    endOfDay.setHours(cal.workingHours.end, 0, 0, 0);
    const minsLeftToday = (endOfDay.getTime() - cursor.getTime()) / 60000;
    if (remaining <= minsLeftToday) {
      cursor.setMinutes(cursor.getMinutes() + remaining);
      remaining = 0;
    } else {
      remaining -= minsLeftToday;
      cursor.setTime(endOfDay.getTime());
      align();
    }
  }
  return cursor;
}

/**
 * Elapsed BUSINESS hours between two instants — the inverse of addBusinessHours.
 * Reporting uses this so resolution/response times are directly comparable to the SLA
 * targets (which are expressed in business hours), rather than misleading wall-clock.
 */
export function businessHoursBetween(start: Date, end: Date, cal: BusinessCalendar = DEFAULT_CALENDAR): number {
  if (end <= start) return 0;
  let minutes = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    if (isBusinessDay(cursor, cal) && cursor.getHours() >= cal.workingHours.start && cursor.getHours() < cal.workingHours.end) {
      const endOfDay = new Date(cursor);
      endOfDay.setHours(cal.workingHours.end, 0, 0, 0);
      const segmentEnd = end < endOfDay ? end : endOfDay;
      minutes += (segmentEnd.getTime() - cursor.getTime()) / 60000;
      cursor.setTime(segmentEnd.getTime());
    }
    if (cursor >= end) break;
    // Advance to the next business-window opening.
    if (!isBusinessDay(cursor, cal) || cursor.getHours() >= cal.workingHours.end) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(cal.workingHours.start, 0, 0, 0);
    } else if (cursor.getHours() < cal.workingHours.start) {
      cursor.setHours(cal.workingHours.start, 0, 0, 0);
    }
  }
  return minutes / 60;
}

export function initialSla(
  priority: Priority,
  anchoredAt: string,
  policy: SlaPolicy,
  cal: BusinessCalendar = DEFAULT_CALENDAR,
): SlaState {
  const due = addBusinessHours(new Date(anchoredAt), policy.resolutionHours[priority], cal);
  return {
    startedAt: anchoredAt,
    dueAt: due.toISOString(),
    resolvedAt: null,
    closedAt: null,
    pausedMsAccrued: 0,
    pausedSince: null,
    flag: 'OnTrack',
  };
}

/** Derive the SLA flag at a given instant (pure). The due window already encodes priority. */
export function deriveFlag(sla: SlaState, policy: SlaPolicy, at: Date = new Date()): SlaFlag {
  if (sla.resolvedAt || sla.closedAt || !sla.dueAt || !sla.startedAt) return 'OnTrack';
  // Effective elapsed excludes paused time.
  const pausedMs = sla.pausedMsAccrued + (sla.pausedSince ? at.getTime() - new Date(sla.pausedSince).getTime() : 0);
  const effectiveNow = at.getTime() - pausedMs;
  const due = new Date(sla.dueAt).getTime();
  const start = new Date(sla.startedAt).getTime();
  if (effectiveNow >= due) return 'Overdue';
  const total = due - start;
  const remaining = due - effectiveNow;
  return remaining <= total * policy.dueSoonThreshold ? 'DueSoon' : 'OnTrack';
}

/**
 * Did this ticket's RESOLUTION miss its target? (phase-0 §506: the Resolution target runs
 * Submitted → Resolved with pauses excluded.)
 *
 * This is deliberately NOT part of deriveFlag. Per phase-0 §532 `Overdue` is a LIVE escalation
 * flag defined only over active statuses {Submitted, Assigned, In Progress, Reopened}, so a
 * resolved ticket is correctly never "Overdue" — that short-circuit is right and must stay.
 *
 * But stopping the clock must not ERASE a breach that already happened. Compliance is a
 * HISTORICAL metric (BUSINESS_DOMAIN_MODEL §902 — "Metric: Breach rate/SLA compliance"), and
 * reading it off the live flag meant a ticket resolved five days late counted as compliant —
 * so resolving a breached ticket RAISED the score. This derives the fact from stored data
 * (resolvedAt, dueAt, pausedMsAccrued): no schema change, no scheduler.
 *
 * Known limit (unchanged here): `freshClock` on reopen resets the SLA state, so a breach in an
 * earlier cycle is not retained. Per-cycle SLA history would need a stored record.
 */
export function wasBreached(sla: SlaState): boolean {
  const stoppedAt = sla.resolvedAt ?? sla.closedAt;
  if (!stoppedAt || !sla.dueAt) return false;
  // Exclude paused time, exactly as the live derivation does.
  const effectiveStop = Date.parse(stoppedAt) - sla.pausedMsAccrued;
  return effectiveStop > Date.parse(sla.dueAt);
}

/**
 * Did this ticket miss its resolution target — either it is breaching right now, or it already
 * resolved late? The single truth for SLA-compliance metrics; never use `flag !== 'Overdue'`
 * alone, which is blind to everything already resolved.
 */
export function missedTarget(ticket: Ticket): boolean {
  return ticket.sla.flag === 'Overdue' || wasBreached(ticket.sla);
}

/** Recompute the stored flag (used on read/refresh so lists show live SLA state). */
export function withFreshFlag(ticket: Ticket, policy: SlaPolicy, at: Date = new Date()): Ticket {
  const flag = deriveFlag(ticket.sla, policy, at);
  return flag === ticket.sla.flag ? ticket : { ...ticket, sla: { ...ticket.sla, flag } };
}

/**
 * ESCALATION (BR-096) — who should hear about this ticket's SLA state, resolved from the policy
 * rather than from a switch statement somewhere downstream.
 *
 * PURE and identity-free: it returns the ROLES BR-096 names, not user ids. Turning
 * `destination-queue` into a list of people is the notification layer's job, and it already knows
 * how — that is exactly the mapping `recipients()` performs for every other event.
 *
 * ⚠️ NOT WIRED. No caller invokes this, because the trigger is a scheduled SLA sweep and this
 * build has no scheduler: `Overdue` is derived when someone reads a ticket, so a breach nobody
 * looks at is a breach nobody is told about. Stating that here rather than shipping a function
 * whose existence implies the feature works.
 */
export function escalationRecipients(flag: SlaFlag, policy: SlaPolicy): readonly EscalationRecipient[] {
  if (flag === 'Overdue') return policy.escalation.onBreach;
  if (flag === 'DueSoon') return policy.escalation.onDueSoon;
  return [];
}
