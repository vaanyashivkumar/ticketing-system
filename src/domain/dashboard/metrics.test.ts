import { describe, it, expect } from 'vitest';
import { computeKpis } from './metrics';
import { initialSla } from '@domain/sla/slaEngine';
import { DEFAULT_SLA_POLICY } from '@config/sla.config';
import { DEPARTMENTS } from '@config/departments.config';
import type { Session, User } from '@domain/types/auth.types';
import type { SlaState, Ticket, TicketStatus } from '@domain/types/ticket.types';

/**
 * The dashboard KPI row is the number a department head actually reads. It had no test at all,
 * which is how D04 #37 survived: "SLA compliance" was computed as `flag !== 'Overdue'`, and the
 * flag is deliberately OnTrack once a ticket resolves (phase-0 §532) — so a ticket resolved five
 * days late counted as compliant, and resolving a breached ticket RAISED the score.
 */
const mkSession = (deptCode: keyof typeof DEPARTMENTS, id: string): Session => {
  const d = DEPARTMENTS[deptCode];
  const user: User = {
    id, name: 'U', email: 'u@t.test', departmentId: d.id, departmentCode: d.code, avatarInitials: 'U',
    role: { departmentId: d.id, departmentCode: d.code, capabilities: [] },
  };
  return { user, authenticatedAt: new Date().toISOString() };
};

const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h, 0, 0, 0);
const started = at(2026, 7, 16, 9).toISOString(); // Urgent => 8 business hours => due 17:00 same day

const ticket = (id: string, status: TicketStatus, sla: SlaState): Ticket => ({
  id, code: `FIN-000${id}`, subject: 's', description: 'd', status, priority: 'Urgent',
  fromDeptCode: 'SAL', toDeptCode: 'FIN', categoryId: 'c', categoryLabel: 'C', categoryData: {},
  createdById: 'u-sales', createdByName: 'Sales', assignedToId: 'u-raza', assignedToName: 'Fin',
  createdAt: '', updatedAt: '', sla, resolutionNote: null,
  reopenCount: 0, rejectionReason: null, comments: [], attachments: [], activity: [],
});

const session = mkSession('FIN', 'u-raza');
const fresh = () => initialSla('Urgent', started, DEFAULT_SLA_POLICY);

describe('Dashboard KPIs — SLA compliance tells the truth about the past (D04 #37)', () => {
  it('a ticket RESOLVED LATE drags compliance down — it does not read as 100%', () => {
    // Resolved four days after a 17:00 same-day target: an unambiguous breach.
    const late = ticket('1', 'Closed', { ...fresh(), resolvedAt: at(2026, 7, 20, 12).toISOString(), flag: 'OnTrack' });
    const kpis = computeKpis(session, [late]);

    // The live flag is OnTrack — this is exactly what the old rule trusted, and why it lied.
    expect(late.sla.flag).toBe('OnTrack');
    expect(kpis.slaCompliancePct).toBe(0);
  });

  it('a ticket resolved ON TIME reads as compliant', () => {
    const onTime = ticket('2', 'Closed', { ...fresh(), resolvedAt: at(2026, 7, 16, 12).toISOString() });
    expect(computeKpis(session, [onTime]).slaCompliancePct).toBe(100);
  });

  it('one on-time and one late resolution is 50%, not 100%', () => {
    const onTime = ticket('3', 'Closed', { ...fresh(), resolvedAt: at(2026, 7, 16, 12).toISOString() });
    const late = ticket('4', 'Closed', { ...fresh(), resolvedAt: at(2026, 7, 20, 12).toISOString() });
    expect(computeKpis(session, [onTime, late]).slaCompliancePct).toBe(50);
  });

  it('the live Overdue COUNT stays open-only — a resolved breach is history, not an escalation', () => {
    const late = ticket('5', 'Closed', { ...fresh(), resolvedAt: at(2026, 7, 20, 12).toISOString(), flag: 'OnTrack' });
    const breaching = ticket('6', 'InProgress', { ...fresh(), flag: 'Overdue' });
    const kpis = computeKpis(session, [late, breaching]);

    // Only the still-open ticket is an escalation (phase-0 §532)...
    expect(kpis.overdue).toBe(1);
    // ...but BOTH missed their target, so compliance is 0%.
    expect(kpis.slaCompliancePct).toBe(0);
  });

  it('drafts and cancelled tickets are excluded from compliance entirely', () => {
    const draft = ticket('7', 'Draft', fresh());
    const cancelled = ticket('8', 'Cancelled', fresh());
    expect(computeKpis(session, [draft, cancelled]).slaCompliancePct).toBeNull();
  });
});
