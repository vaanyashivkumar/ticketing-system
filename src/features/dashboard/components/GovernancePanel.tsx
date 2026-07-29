import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuditService, type AuditEvent } from '@services/AuditService';
import { AdminApi } from '@services/api/adminApi';
import { USE_API } from '@config/runtime.config';
import { UNBUILDABLE_KPIS } from '@domain/dashboard/kpiRegistry';

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Governance overlay (PRD §10.6/§10.7) — the sysadmin's "is the system sound?" panel.
 *
 * It shows AUDIT EVENTS, which are real: six write sites record sign-ins, refused attempts, user
 * activation and configuration changes.
 *
 * It deliberately does NOT show "Workflow Exceptions", "Failed Actions" or "Configuration
 * Warnings", which B05 asked for. Nothing anywhere records a refused transition, a failed
 * operation or a configuration warning, so every number on those tiles would have been invented —
 * and a governance dashboard is the last place to put a number nobody can check. The nearest real
 * signal is `UNAUTHORIZED_ATTEMPT`, which covers static-permission refusals ONLY; per-ticket
 * authorisation refusals are not recorded at all, so it is labelled for what it is rather than
 * promoted to "failed actions".
 */
export function GovernancePanel() {
  const [events, setEvents] = useState<AuditEvent[]>([]);

  useEffect(() => {
    if (!USE_API) {
      setEvents([...AuditService.all()].slice(0, 6));
      return;
    }
    let live = true;
    void AdminApi.audit().then((r) => {
      if (!live || !r.ok) return;
      setEvents(
        r.value.slice(0, 6).map(
          (e) =>
            ({
              id: String(e.id),
              type: String(e.type),
              actorName: e.actorName ? String(e.actorName) : undefined,
              detail: e.detail ? String(e.detail) : undefined,
              at: String(e.createdAt),
            }) as AuditEvent,
        ),
      );
    });
    return () => {
      live = false;
    };
  }, []);

  const blocked = events.filter((e) => e.type === 'UNAUTHORIZED_ATTEMPT').length;

  return (
    <>
      <p className="mb-2 text-body-sm text-text-secondary">
        {blocked > 0 ? (
          <>
            <strong className="text-error-text">{blocked}</strong> blocked permission attempt
            {blocked === 1 ? '' : 's'} in the recent log.
          </>
        ) : (
          'No blocked permission attempts in the recent log.'
        )}
      </p>
      <ol className="space-y-2">
        {events.map((e) => (
          <li key={e.id} className="border-l-2 border-border pl-3 text-body-sm">
            <span className="text-text">{e.type.replaceAll('_', ' ').toLowerCase()}</span>
            {e.actorName && <span className="text-text-secondary"> · {e.actorName}</span>}
            <span className="block text-caption text-text-muted">{fmt(e.at)}</span>
          </li>
        ))}
        {events.length === 0 && <li className="text-body-sm text-text-muted">No governance events recorded yet.</li>}
      </ol>
      <Link to="/admin/audit" className="mt-2 inline-block text-body-sm text-primary-text hover:underline">
        Open the full audit log
      </Link>
      <p className="mt-2 text-caption text-text-muted">
        Records static-permission refusals and sign-ins. Per-ticket authorisation refusals are not
        recorded anywhere, so this is not a complete picture of denied actions.
      </p>
    </>
  );
}

/**
 * The coverage panel — what this dashboard was asked for and cannot honestly show.
 *
 * It exists because the alternative is a comment in a source file that nobody with the authority
 * to ratify the gap will ever read. Rendering "Under Review: 0" would teach a reader that the
 * state exists; rendering nothing at all hides that it was ever requested. This does neither.
 */
export function DataCoveragePanel() {
  return (
    <dl className="space-y-3">
      {UNBUILDABLE_KPIS.map((k) => (
        <div key={k.asked}>
          <dt className="text-label-sm text-text">{k.asked}</dt>
          <dd className="text-caption text-text-muted">{k.reason}</dd>
          <dd className="text-caption text-text-secondary">Would need: {k.wouldNeed}</dd>
        </div>
      ))}
    </dl>
  );
}
