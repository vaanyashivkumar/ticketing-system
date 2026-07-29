import { useEffect, useState } from 'react';
import { ScrollText, Lock, Search } from 'lucide-react';
import { AuditService, type AuditEvent } from '@services/AuditService';
import { AdminApi } from '@services/api/adminApi';
import { USE_API } from '@config/runtime.config';
import { PageHeader } from '@components/common/PageHeader';

const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' });

const TONE: Record<string, string> = {
  UNAUTHORIZED_ATTEMPT: 'bg-error-bg text-error-text',
  USER_DEACTIVATED: 'bg-warning-bg text-warning-text',
  SLA_MODIFIED: 'bg-info-bg text-info-text',
  CONFIG_UPDATED: 'bg-info-bg text-info-text',
  CATEGORY_UPDATED: 'bg-info-bg text-info-text',
  FEATURE_FLAG_UPDATED: 'bg-info-bg text-info-text',
};

/** Audit Logs (P15 §8). Append-only and immutable — there is no edit or delete affordance. */
export function AuditLogsPage() {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'admin' | 'auth'>('all');
  /**
   * In API mode this is the SERVER's audit trail, which is the only one that means anything: the
   * prototype's log lives in localStorage, so the actor could edit or delete the record of their
   * own actions. The server's is append-only by API surface — nothing exposes an update or delete.
   */
  const [events, setEvents] = useState<AuditEvent[]>([]);
  /**
   * A failed fetch used to be discarded with `if (!live || !r.ok) return;`, leaving the list empty
   * — and the page then rendered "No audit events match." above a footer reading "0 events. Audit
   * entries can never be edited or deleted."
   *
   * On an audit console that is the worst possible failure mode. An empty audit trail is itself an
   * allegation: it says nothing happened, or that something removed the record. The one screen
   * whose entire purpose is evidentiary must never assert an absence it has not verified.
   */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(USE_API);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!USE_API) {
      setEvents([...AuditService.all()]);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    void AdminApi.audit().then((r) => {
      if (!live) return;
      setLoading(false);
      if (!r.ok) { setLoadError(r.error); return; }
      setLoadError(null);
      setEvents(r.value.map((e) => ({
        id: String(e.id),
        type: String(e.type),
        actorId: e.actorId ? String(e.actorId) : undefined,
        actorName: e.actorName ? String(e.actorName) : undefined,
        entityType: e.entityType ? String(e.entityType) : undefined,
        entityId: e.entityId ? String(e.entityId) : undefined,
        detail: e.detail ? String(e.detail) : undefined,
        before: e.before ? String(e.before) : undefined,
        after: e.after ? String(e.after) : undefined,
        at: String(e.createdAt),
      }) as AuditEvent));
    });
    return () => { live = false; };
  }, [attempt]);

  const isAdmin = (e: AuditEvent) => e.entityType !== undefined && e.entityType !== 'session';
  const filtered = events.filter((e) => {
    if (kind === 'admin' && !isAdmin(e)) return false;
    if (kind === 'auth' && isAdmin(e)) return false;
    if (!q) return true;
    return `${e.type} ${e.actorName ?? ''} ${e.entityId ?? ''} ${e.detail ?? ''}`.toLowerCase().includes(q.toLowerCase());
  });

  return (
    <section>
      <PageHeader icon={ScrollText} title="Audit Logs" description="Every governance and authentication event. Append-only." />

      {loadError && (
        <div role="alert" className="mb-4 flex flex-col items-start gap-2 rounded-md border border-error bg-error-bg px-3 py-2 text-body-sm text-error-text">
          <span>
            <strong>The audit trail could not be loaded.</strong> {loadError} What is shown below is
            not the audit trail — it is nothing at all. Do not read this as an absence of events.
          </span>
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            className="btn-neutral"
          >
            Try again
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-[220px] flex-1 items-center">
          <Search size={15} className="pointer-events-none absolute left-3 text-text-muted" aria-hidden />
          <input className="input pl-9" placeholder="Search action, actor, entity…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search audit log" />
        </label>
        <select className="input max-w-[180px]" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Filter event kind">
          <option value="all">All events</option>
          <option value="admin">Administration</option>
          <option value="auth">Authentication</option>
        </select>
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-1 text-label-sm text-text-secondary">
          <Lock size={12} aria-hidden /> Immutable
        </span>
      </div>

      {/* A11Y-003 — read-only table, no focusable content, so a keyboard user could not scroll it
          sideways and never reached the right-hand columns. Same defect as Reports and Roles. */}
      <div className="table-shell overflow-x-auto" role="region" aria-label="Audit log" tabIndex={0}>
        <table className="w-full text-table">
          {/* `.th` is the design-system header, but its `text-text-muted` measures 4.34:1 on
              surface-sunken in the light theme — under the 4.5:1 AA floor at label-sm's 12px.
              `text-text-secondary` (6.92:1) is pinned back over it until the token is fixed
              centrally in globals.css; utilities beat the component layer, so this is the
              sanctioned override rather than a fork of the class. */}
          <thead>
            <tr className="border-b border-border">
              <th className="th text-text-secondary">When</th>
              <th className="th text-text-secondary">Action</th>
              <th className="th text-text-secondary">Actor</th>
              <th className="th text-text-secondary">Entity</th>
              <th className="th text-text-secondary">Previous → New</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0 align-top row-hover">
                {/* Timestamps are figures read down a column, so they stay tabular — but left
                    aligned, not `.td-num`: a date right-aligned against prose reads as an error. */}
                <td className="td whitespace-nowrap tabular-nums text-caption text-text-muted">{fmt(e.at)}</td>
                <td className="td">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-label-sm ${TONE[e.type] ?? 'bg-surface-sunken text-text-secondary'}`}>
                    {e.type.replaceAll('_', ' ').toLowerCase()}
                  </span>
                </td>
                <td className="td text-body-sm text-text-secondary">{e.actorName ?? e.actorId ?? 'system'}</td>
                <td className="td text-body-sm text-text-secondary">
                  {e.entityType ? <>{e.entityType} <code className="font-mono text-caption text-text-muted">{e.entityId}</code></> : <span className="text-text-muted">{e.detail ?? '—'}</span>}
                </td>
                <td className="td max-w-[280px] font-mono text-caption text-text-muted">
                  {e.before || e.after ? <><span className="line-through">{e.before}</span> → <span className="text-text-secondary">{e.after}</span></> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <p role="status" className="px-4 py-8 text-center text-body-sm text-text-muted">Loading the audit trail…</p>}
        {!loading && !loadError && filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-body-sm text-text-muted">No audit events match.</p>
        )}
      </div>
      <p className="mt-3 text-caption text-text-muted">
        {loadError ? 'Event count unavailable.' : `${events.length} events.`} Audit entries can never be edited or deleted — no API exposes an update or delete.
        {USE_API
          ? ' Recorded server-side with IP and user-agent, so an actor cannot suppress the record of their own attempt.'
          : ' Retained in localStorage; IP/device capture and long-term retention arrive with a backend.'}
      </p>
    </section>
  );
}
