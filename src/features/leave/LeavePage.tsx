import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarDays, Check, X, Hourglass } from 'lucide-react';
import { useAuth } from '@hooks/useAuth';
import { useLeaveStore } from '@stores/leaveStore';
import { PageHeader } from '@components/common/PageHeader';
import { mockUserById } from '@config/mockUsers.config';
import {
  LEAVE_TYPES, LEAVE_EMPLOYEES, STAGE_LABEL, approverForStage,
} from '@config/leave.config';
import { computeBalance, leaveDayCount, splitPaidUnpaid } from '@domain/leave/leaveEngine';
import type { LeaveRecord, LeaveTypeName } from '@domain/leave/leaveTypes';

/**
 * LEAVE — the ratified leave-application module (Constitution amendment, 2026-07-24). One screen:
 * the signed-in person's balance and history, the application form, and — when they are an
 * approver with work waiting — their stage of the Line manager → HR → MD chain.
 *
 * Left-anchored (max-w, never mx-auto) to share the one content left edge every page keeps.
 */

const nameOf = (id: string): string => mockUserById(id)?.name ?? id;

const fmtDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const STATUS_BADGE: Record<LeaveRecord['status'], string> = {
  Pending: 'bg-warning-bg text-warning-text',
  Approved: 'bg-success-bg text-success-text',
  Rejected: 'bg-error-bg text-error-text',
  Cancelled: 'bg-surface-sunken text-text-muted',
};

function BalanceTiles({ userId }: { userId: string }) {
  const balanceFor = useLeaveStore((s) => s.balanceFor);
  // Depend on records so the tiles recompute after an application or decision.
  useLeaveStore((s) => s.records);
  const b = balanceFor(userId);
  const tiles = [
    { label: 'Accrued to date', value: b.accrued, hint: '2.5 days per completed month since joining' },
    { label: 'Taken & reserved', value: b.consumed, hint: 'Approved and pending paid days' },
    { label: 'Available', value: b.available, hint: 'What you can still draw on', strong: true },
  ];
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
      {tiles.map((t) => (
        <div key={t.label} className="card-p">
          <div className="text-label text-text-muted">{t.label}</div>
          <div className={`mt-2 text-display tabular-nums ${t.strong ? 'text-primary-text' : 'text-text'}`}>
            {t.value}
            <span className="ml-1 text-body-sm text-text-muted">days</span>
          </div>
          <div className="mt-1 text-caption text-text-muted">{t.hint}</div>
        </div>
      ))}
    </div>
  );
}

function ApplyForm({ userId }: { userId: string }) {
  const apply = useLeaveStore((s) => s.apply);
  const records = useLeaveStore((s) => s.records);
  const [type, setType] = useState<LeaveTypeName>('Annual');
  const [startDate, setStart] = useState('');
  const [endDate, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  const join = LEAVE_EMPLOYEES[userId]?.joinDate ?? startDate;
  const preview = useMemo(() => {
    if (!startDate || !endDate) return null;
    const requestedDays = leaveDayCount(startDate, endDate);
    if (requestedDays <= 0) return { requestedDays: 0, paidDays: 0, unpaidDays: 0 };
    const { available } = computeBalance(join, startDate, records, { employeeId: userId });
    const split = splitPaidUnpaid(type, requestedDays, available);
    return { requestedDays, available, ...split };
  }, [startDate, endDate, type, join, records, userId]);

  const canSubmit = !!startDate && !!endDate && (preview?.requestedDays ?? 0) > 0;

  const [submitting, setSubmitting] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    const rec = await apply({ employeeId: userId, type, startDate, endDate, reason: reason.trim() || undefined });
    setSubmitting(false);
    if (!rec) { setFlash('Could not submit — please try again.'); return; }
    const routed = rec.stage ? `Sent to ${STAGE_LABEL[rec.stage]} for approval.` : 'Auto-approved.';
    setFlash(
      `Applied for ${rec.requestedDays} day${rec.requestedDays === 1 ? '' : 's'}` +
      (rec.unpaidDays > 0 ? ` (${rec.paidDays} paid, ${rec.unpaidDays} unpaid).` : '.') +
      ` ${routed}`,
    );
    setStart(''); setEnd(''); setReason('');
  };

  return (
    <form onSubmit={submit} className="card-p" aria-labelledby="leave-apply-h">
      <h2 id="leave-apply-h" className="text-h3 text-text">Apply for leave</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-label-sm text-text-secondary">Leave type</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as LeaveTypeName)}>
            {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-label-sm text-text-secondary">Reason (optional)</span>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Family event" />
        </label>
        <label className="block">
          <span className="mb-1 block text-label-sm text-text-secondary">Start date</span>
          <input type="date" className="input" value={startDate} onChange={(e) => setStart(e.target.value)} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-label-sm text-text-secondary">End date</span>
          <input type="date" className="input" value={endDate} min={startDate || undefined} onChange={(e) => setEnd(e.target.value)} required />
        </label>
      </div>

      {preview && preview.requestedDays > 0 && (
        <div className="mt-4 rounded-md border border-border bg-surface-sunken px-3 py-2 text-body-sm text-text-secondary">
          <strong className="text-text">{preview.requestedDays}</strong> day{preview.requestedDays === 1 ? '' : 's'} requested
          {preview.unpaidDays > 0 ? (
            <> — <strong className="text-text">{preview.paidDays}</strong> paid,{' '}
              <strong className="text-warning-text">{preview.unpaidDays} unpaid</strong>{' '}
              (exceeds your available balance; the extra days are recorded unpaid).</>
          ) : (
            <> — all paid from your available balance.</>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={!canSubmit || submitting}>
          {submitting ? 'Submitting…' : 'Submit application'}
        </button>
        {flash && <span className="text-body-sm text-success-text">{flash}</span>}
      </div>
    </form>
  );
}

function ApprovalQueue({ userId }: { userId: string }) {
  const pendingFor = useLeaveStore((s) => s.pendingFor);
  const decide = useLeaveStore((s) => s.decide);
  useLeaveStore((s) => s.records);
  const pending = pendingFor(userId);
  if (pending.length === 0) return null;

  return (
    <section aria-labelledby="leave-approvals-h" className="card-p">
      <h2 id="leave-approvals-h" className="flex items-center gap-2 text-h3 text-text">
        <Hourglass size={18} aria-hidden /> Awaiting your approval
        <span className="rounded-full bg-warning-bg px-2 text-label-sm text-warning-text">{pending.length}</span>
      </h2>
      <ul className="mt-4 space-y-3">
        {pending.map((r) => (
          <li key={r.id} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-body-medium text-text">
                <span className="mr-2 font-mono text-body-sm text-primary-text">{r.code}</span>
                {nameOf(r.employeeId)}
              </span>
              <span className="text-caption text-text-muted">applied {fmtDate(r.createdAt.slice(0, 10))}</span>
            </div>
            <div className="mt-1 text-body-sm text-text-secondary">
              {r.type} · {fmtDate(r.startDate)} → {fmtDate(r.endDate)} · {r.requestedDays} day{r.requestedDays === 1 ? '' : 's'}
              {r.unpaidDays > 0 && <span className="text-warning-text"> ({r.unpaidDays} unpaid)</span>}
            </div>
            {r.reason && <div className="mt-1 text-caption text-text-muted">“{r.reason}”</div>}
            <div className="mt-1 text-caption text-text-muted">You are approving as: {STAGE_LABEL[r.stage!]}</div>
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn-primary" onClick={() => decide(r.id, userId, 'Approved')}>
                <Check size={14} aria-hidden /> Approve
              </button>
              <button type="button" className="btn-danger" onClick={() => decide(r.id, userId, 'Rejected')}>
                <X size={14} aria-hidden /> Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function stageProgress(r: LeaveRecord): string {
  if (r.status === 'Approved') return 'Fully approved';
  if (r.status === 'Rejected') {
    const at = r.history.at(-1);
    return at ? `Rejected by ${STAGE_LABEL[at.stage]}` : 'Rejected';
  }
  if (r.status === 'Cancelled') return 'Withdrawn';
  if (r.stage) return `Awaiting ${STAGE_LABEL[r.stage]} (${nameOf(approverForStage(r.stage, r.employeeId) ?? '')})`;
  return '—';
}

function Ledger({ userId }: { userId: string }) {
  const ledgerFor = useLeaveStore((s) => s.ledgerFor);
  const cancel = useLeaveStore((s) => s.cancel);
  useLeaveStore((s) => s.records);
  const rows = ledgerFor(userId);

  return (
    <section aria-labelledby="leave-ledger-h">
      <h2 id="leave-ledger-h" className="mb-2 text-h3 text-text">My leave history</h2>
      {rows.length === 0 ? (
        <div className="card flex items-center justify-center p-8 text-body-sm text-text-secondary">
          No leave on record yet.
        </div>
      ) : (
        <div className="table-shell overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Reference</th>
                <th className="th">Type</th>
                <th className="th">Dates</th>
                <th className="th td-num">Days</th>
                <th className="th td-num">Paid</th>
                <th className="th td-num">Unpaid</th>
                <th className="th">Status</th>
                <th className="th">Progress</th>
                <th className="th"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="row-hover">
                  {/* The reference every notification about this application names. */}
                  <td className="td whitespace-nowrap font-mono text-body-sm text-primary-text">{r.code}</td>
                  <td className="td">{r.type}</td>
                  <td className="td whitespace-nowrap">{fmtDate(r.startDate)} → {fmtDate(r.endDate)}</td>
                  <td className="td td-num">{r.requestedDays}</td>
                  <td className="td td-num">{r.paidDays}</td>
                  <td className="td td-num">{r.unpaidDays > 0 ? <span className="text-warning-text">{r.unpaidDays}</span> : 0}</td>
                  <td className="td">
                    <span className={`rounded-full px-2 py-0.5 text-label-sm ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                  </td>
                  <td className="td text-caption text-text-muted">{stageProgress(r)}</td>
                  <td className="td">
                    {r.status === 'Pending' && (
                      <button type="button" className="btn-quiet text-caption" onClick={() => cancel(r.id, userId)}>
                        Withdraw
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function LeavePage() {
  const { user } = useAuth();
  const load = useLeaveStore((s) => s.load);
  const loading = useLeaveStore((s) => s.loading);
  const loadError = useLeaveStore((s) => s.loadError);

  // In API mode this fetches the caller's balance, ledger and pending approvals; in localStorage
  // mode it is instant. Re-runs if the signed-in identity changes.
  useEffect(() => {
    if (user) void load(user.id);
  }, [user, load]);

  if (!user) return null;

  return (
    <section aria-labelledby="leave-title" className="max-w-4xl space-y-6">
      <PageHeader
        icon={CalendarDays}
        titleId="leave-title"
        title="Leave"
        description="Your balance, applications, and approvals — Line manager → HR → MD."
      />
      {loadError && (
        <div className="rounded-md border border-error bg-error-bg px-3 py-2 text-body-sm text-error-text">
          {loadError}
        </div>
      )}
      {loading ? (
        <div className="card flex items-center justify-center p-8 text-body-sm text-text-secondary">
          Loading your leave…
        </div>
      ) : (
        <>
          <BalanceTiles userId={user.id} />
          <ApplyForm userId={user.id} />
          <ApprovalQueue userId={user.id} />
          <Ledger userId={user.id} />
        </>
      )}
    </section>
  );
}
