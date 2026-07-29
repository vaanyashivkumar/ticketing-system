import { describe, it, expect } from 'vitest';
import { addBusinessHours, businessHoursBetween, initialSla, deriveFlag, wasBreached, missedTarget, calendarOf, escalationRecipients, DEFAULT_CALENDAR, type BusinessCalendar } from './slaEngine';
import { DEFAULT_ORG_CONFIG } from '@config/org.config';
import { DEFAULT_SLA_POLICY } from '@config/sla.config';
import type { SlaState, Ticket } from '@domain/types/ticket.types';

/** Business-time is a business rule. These tests defend the SLA maths. */
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);

/**
 * CFG-001 — the business calendar is CONFIGURATION, not a literal.
 *
 * P15 §7 lifted the SLA *targets* out of the engine but left `DAY_START = 9` / `DAY_END = 18`
 * and a Mon–Fri literal hardcoded, so org.config's workingHours / workingDays / holidays were
 * DEAD CONFIG — an administrator could edit them and nothing changed. These tests prove the
 * config is now load-bearing: a DIFFERENT calendar must produce a DIFFERENT answer.
 */
describe('SLA Engine — the business calendar is injected, not hardcoded (CFG-001)', () => {
  const nineToFive: BusinessCalendar = { workingDays: [1, 2, 3, 4, 5], workingHours: { start: 9, end: 17 }, holidays: [] };
  const sixDayWeek: BusinessCalendar = { workingDays: [1, 2, 3, 4, 5, 6], workingHours: { start: 9, end: 18 }, holidays: [] };

  it('THE REGRESSION: a different working-hours window yields a different due date', () => {
    // Thu 16 Jul 2026 16:00 + 4h. Default window closes at 18:00 → 2h today, 2h tomorrow = 11:00.
    expect(addBusinessHours(at(2026, 7, 16, 16), 4).getHours()).toBe(11);
    // A 09:00–17:00 window closes an hour earlier → only 1h today, 3h tomorrow = 12:00.
    expect(addBusinessHours(at(2026, 7, 16, 16), 4, nineToFive).getHours()).toBe(12);
  });

  it('working DAYS are configurable — a six-day week does not skip Saturday', () => {
    // Fri 17 Jul 2026 17:00 + 2h. Mon–Fri: spills over the weekend to Monday 20th.
    expect(addBusinessHours(at(2026, 7, 17, 17), 2).getDate()).toBe(20);
    // Mon–Sat: spills to Saturday 18th.
    expect(addBusinessHours(at(2026, 7, 17, 17), 2, sixDayWeek).getDate()).toBe(18);
  });

  it('holidays are applied — no longer "reserved and unread"', () => {
    const withHoliday: BusinessCalendar = { ...sixDayWeek, workingDays: [1, 2, 3, 4, 5], holidays: ['2026-07-17'] };
    // Thu 16th 17:00 + 2h normally spills to Fri 17th...
    expect(addBusinessHours(at(2026, 7, 16, 17), 2).getDate()).toBe(17);
    // ...but if the 17th is a holiday it must skip to Mon 20th.
    expect(addBusinessHours(at(2026, 7, 16, 17), 2, withHoliday).getDate()).toBe(20);
  });

  it('businessHoursBetween honours the same calendar', () => {
    const start = at(2026, 7, 16, 9);
    const end = at(2026, 7, 16, 18);
    expect(businessHoursBetween(start, end)).toBe(9); // 09:00–18:00 window
    expect(businessHoursBetween(start, end, nineToFive)).toBe(8); // 09:00–17:00 window
  });

  it('the default calendar comes from org configuration, not a literal', () => {
    expect(DEFAULT_CALENDAR.workingHours).toEqual(DEFAULT_ORG_CONFIG.workingHours);
    expect(DEFAULT_CALENDAR.workingDays).toEqual(DEFAULT_ORG_CONFIG.workingDays);
    expect(calendarOf(DEFAULT_ORG_CONFIG)).toEqual(DEFAULT_CALENDAR);
  });
});

/**
 * D04 #37 regression — the SLA-compliance lie.
 *
 * `deriveFlag` returns OnTrack the moment a ticket resolves. That is CORRECT and must stay:
 * phase-0 §532 defines Overdue as a LIVE flag over active statuses only. The defect was reading
 * *compliance* off that flag, so a ticket resolved five days late counted as compliant — and
 * resolving a breached ticket RAISED the score. Compliance is historical
 * (BUSINESS_DOMAIN_MODEL §902) and must come from resolvedAt vs dueAt.
 */
describe('SLA Engine — a breach survives resolution (D04 #37)', () => {
  // Urgent = 8 business hours from Thu 16 Jul 2026 09:00 => due Thu 16 Jul 17:00.
  const started = at(2026, 7, 16, 9).toISOString();
  const base = (): SlaState => initialSla('Urgent', started, DEFAULT_SLA_POLICY);
  const withSla = (sla: SlaState) => ({ sla }) as Ticket;

  it('a ticket resolved AFTER its due date is a breach — though the live flag reads OnTrack', () => {
    const sla: SlaState = { ...base(), resolvedAt: at(2026, 7, 17, 15).toISOString() };
    // Deliberately OnTrack once resolved (phase-0 §532). Do not "fix" this.
    expect(deriveFlag(sla, DEFAULT_SLA_POLICY, at(2026, 7, 20, 10))).toBe('OnTrack');
    // ...but the breach is not erased.
    expect(wasBreached(sla)).toBe(true);
  });

  it('a ticket resolved BEFORE its due date is not a breach', () => {
    expect(wasBreached({ ...base(), resolvedAt: at(2026, 7, 16, 14).toISOString() })).toBe(false);
  });

  it('paused time is excluded — resolving past the due instant is NOT a breach if the clock was paused for longer', () => {
    const s = base();
    const resolvedAt = new Date(Date.parse(s.dueAt!) + 4 * 3600_000).toISOString(); // 4h past due
    const paused: SlaState = { ...s, resolvedAt, pausedMsAccrued: 5 * 3600_000 }; // but 5h paused
    expect(wasBreached(paused)).toBe(false);
    // The same resolution WITHOUT the pause credit is a breach — proving the credit is what matters.
    expect(wasBreached({ ...s, resolvedAt })).toBe(true);
  });

  it('an unresolved ticket records no breach — the live flag governs it', () => {
    expect(wasBreached(base())).toBe(false);
  });

  it('THE REGRESSION: resolving a breached ticket must not make it count as compliant', () => {
    const t = withSla({ ...base(), resolvedAt: at(2026, 7, 20, 12).toISOString(), flag: 'OnTrack' });
    // The old rule was `flag !== 'Overdue'`, which was TRUE here — that was the lie.
    expect(t.sla.flag).not.toBe('Overdue');
    expect(missedTarget(t)).toBe(true);
  });

  it('a currently-breaching open ticket also counts as missed', () => {
    expect(missedTarget(withSla({ ...base(), flag: 'Overdue' }))).toBe(true);
  });

  it('an on-time resolution counts as compliant', () => {
    expect(missedTarget(withSla({ ...base(), resolvedAt: at(2026, 7, 16, 12).toISOString() }))).toBe(false);
  });
});

describe('SLA Engine — business-time arithmetic', () => {
  it('adds hours within a single business day', () => {
    // Thu 16 Jul 2026, 10:00 + 3h = 13:00 same day
    const due = addBusinessHours(at(2026, 7, 16, 10), 3);
    expect(due.getDate()).toBe(16);
    expect(due.getHours()).toBe(13);
  });

  it('spills past the end of the working day to the next business morning', () => {
    // 16:00 + 4h -> 2h today (to 18:00) + 2h tomorrow from 09:00 = 11:00 next day
    const due = addBusinessHours(at(2026, 7, 16, 16), 4);
    expect(due.getDate()).toBe(17);
    expect(due.getHours()).toBe(11);
  });

  it('never lands on a weekend', () => {
    // Fri 17 Jul 2026 17:00 + 3h -> spills over the weekend to Monday 20th
    const due = addBusinessHours(at(2026, 7, 17, 17), 3);
    expect(due.getDay()).not.toBe(0); // Sunday
    expect(due.getDay()).not.toBe(6); // Saturday
    expect(due.getDate()).toBe(20); // Monday
  });

  it('businessHoursBetween is the inverse of addBusinessHours', () => {
    const start = at(2026, 7, 16, 10);
    for (const hours of [1, 3, 8, 16, 40]) {
      const end = addBusinessHours(start, hours);
      expect(Math.round(businessHoursBetween(start, end))).toBe(hours);
    }
  });

  it('businessHoursBetween excludes non-business time', () => {
    // 17:00 Thu -> 10:00 Fri = 1h (Thu 17-18) + 1h (Fri 09-10) = 2h
    expect(Math.round(businessHoursBetween(at(2026, 7, 16, 17), at(2026, 7, 17, 10)))).toBe(2);
    // A whole weekend contributes nothing
    expect(businessHoursBetween(at(2026, 7, 18, 9), at(2026, 7, 19, 18))).toBe(0);
  });
});

describe('SLA Engine — policy injection (no hardcoded numbers)', () => {
  it('uses the INJECTED policy, not a constant', () => {
    const anchored = at(2026, 7, 16, 10).toISOString();
    const fast = initialSla('Urgent', anchored, { ...DEFAULT_SLA_POLICY, resolutionHours: { ...DEFAULT_SLA_POLICY.resolutionHours, Urgent: 2 } });
    const slow = initialSla('Urgent', anchored, { ...DEFAULT_SLA_POLICY, resolutionHours: { ...DEFAULT_SLA_POLICY.resolutionHours, Urgent: 6 } });
    expect(new Date(fast.dueAt!).getHours()).toBe(12); // 10:00 + 2h
    expect(new Date(slow.dueAt!).getHours()).toBe(16); // 10:00 + 6h
    expect(fast.dueAt).not.toBe(slow.dueAt);
  });

  it('honours the configured Due Soon threshold', () => {
    const start = at(2026, 7, 16, 9);
    const due = at(2026, 7, 16, 19); // 10h window
    const sla: SlaState = { startedAt: start.toISOString(), dueAt: due.toISOString(), resolvedAt: null, closedAt: null, pausedMsAccrued: 0, pausedSince: null, flag: 'OnTrack' };
    const now = at(2026, 7, 16, 17); // 2h remaining of 10h = 20%
    expect(deriveFlag(sla, { ...DEFAULT_SLA_POLICY, dueSoonThreshold: 0.2 }, now)).toBe('DueSoon');
    expect(deriveFlag(sla, { ...DEFAULT_SLA_POLICY, dueSoonThreshold: 0.1 }, now)).toBe('OnTrack');
  });
});

describe('SLA Engine — derived flag', () => {
  const base = (over: Partial<SlaState> = {}): SlaState => ({
    startedAt: at(2026, 7, 16, 9).toISOString(),
    dueAt: at(2026, 7, 16, 17).toISOString(),
    resolvedAt: null, closedAt: null, pausedMsAccrued: 0, pausedSince: null, flag: 'OnTrack', ...over,
  });

  it('flags Overdue once the due instant passes', () => {
    expect(deriveFlag(base(), DEFAULT_SLA_POLICY, at(2026, 7, 16, 18))).toBe('Overdue');
  });

  it('a resolved ticket is never Overdue (the clock stops)', () => {
    expect(deriveFlag(base({ resolvedAt: at(2026, 7, 16, 12).toISOString() }), DEFAULT_SLA_POLICY, at(2026, 7, 20, 12))).toBe('OnTrack');
  });

  it('paused time (Awaiting Information) defers the breach', () => {
    // Due 17:00; now 18:00 would be overdue — but 4h of pause pulls effective now back to 14:00.
    const paused = base({ pausedMsAccrued: 4 * 3600_000 });
    expect(deriveFlag(paused, DEFAULT_SLA_POLICY, at(2026, 7, 16, 18))).toBe('OnTrack');
  });

  it('a currently-paused clock keeps accruing pause credit', () => {
    const paused = base({ pausedSince: at(2026, 7, 16, 13).toISOString() });
    // now 18:00, paused since 13:00 => effective now 13:00 => not overdue
    expect(deriveFlag(paused, DEFAULT_SLA_POLICY, at(2026, 7, 16, 18))).toBe('OnTrack');
  });
});

/**
 * BR-096 — "SLA-breach escalation (N10) goes to the assignee, the destination queue, the sysadmin
 * and the requester (FYI); the escalation target is a configurable SLA-policy field."
 *
 * The recipients are asserted against the BUSINESS RULE, not against the config file, so editing
 * the config to something the rule does not say fails here rather than shipping.
 */
describe('escalation targets (BR-096)', () => {
  it('sends a breach to all four parties the rule names', () => {
    expect([...escalationRecipients('Overdue', DEFAULT_SLA_POLICY)].sort()).toEqual(
      ['assignee', 'destination-queue', 'requester', 'sysadmin'].sort(),
    );
  });

  it('keeps the DueSoon warning narrower than the breach', () => {
    const warn = escalationRecipients('DueSoon', DEFAULT_SLA_POLICY);
    const breach = escalationRecipients('Overdue', DEFAULT_SLA_POLICY);
    expect(warn.length).toBeLessThan(breach.length);
    // Nothing has failed yet, so governance and the requester are not told.
    expect(warn).not.toContain('sysadmin');
    expect(warn).not.toContain('requester');
  });

  it('escalates nothing while the ticket is on track', () => {
    expect(escalationRecipients('OnTrack', DEFAULT_SLA_POLICY)).toEqual([]);
  });

  it('reads the policy rather than a hardcoded list', () => {
    const custom = { ...DEFAULT_SLA_POLICY, escalation: { onBreach: ['sysadmin'] as const, onDueSoon: [] as const } };
    expect(escalationRecipients('Overdue', custom)).toEqual(['sysadmin']);
  });
});
