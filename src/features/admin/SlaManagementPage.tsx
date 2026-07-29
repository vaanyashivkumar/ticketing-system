import { useEffect, useState } from 'react';
import { Timer, RotateCcw, Save, Info } from 'lucide-react';
import { useAuth } from '@hooks/useAuth';
import { ConfigService } from '@services/configService';
import { ConfigApi } from '@services/api/adminApi';
import { USE_API } from '@config/runtime.config';
import { DEFAULT_SLA_POLICY, type EscalationRecipient } from '@config/sla.config';
import type { Priority } from '@domain/types/ticket.types';
import { ORDERED_PRIORITIES } from '@domain/workflow/priorityEngine';
import { PageHeader } from '@components/common/PageHeader';
import { InlineError } from '@components/common/InlineError';
import { LiveRegion } from '@components/common/LiveRegion';
import { useServerEditable } from './useServerEditable';

const PRIORITIES = ORDERED_PRIORITIES;

/** BR-096's four recipient roles, in the words an administrator would use. */
const escalationLabel = (r: EscalationRecipient): string =>
  ({ assignee: 'Assignee', 'destination-queue': 'Destination queue', sysadmin: 'System administrator', requester: 'Requester (FYI)' })[r];

/**
 * SLA Management (P15 §7). The SLA policy is CONFIGURATION, edited here and consumed by the
 * SLA engine — no SLA number is hardcoded in the application. Changes are versioned + audited
 * and apply to newly-anchored tickets; the Due Soon threshold re-derives live for all.
 */
export function SlaManagementPage() {
  const { session } = useAuth();
  const [policy, setPolicy] = useState(() => ConfigService.slaPolicy());
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = useServerEditable();

  /**
   * READ FROM WHERE THE APPLICATION IS WRITING.
   *
   * The initial state above comes from `ConfigService`, i.e. localStorage. In API mode that is
   * not the policy governing anything — the server's is. Showing the browser's copy would put a
   * page titled "SLA Management" in front of an administrator displaying numbers no ticket is
   * scheduled against, which is the read-side version of the write-side defect this page already
   * carries a warning about.
   */
  const [history, setHistory] = useState<{ id: string; label: string; meta: string }[]>(() =>
    USE_API
      ? []
      : ConfigService.versions()
          .filter((v) => v.modules.includes('SLA'))
          .map((v) => ({
            id: v.id,
            label: `v${v.version} · ${v.summary}`,
            meta: `${v.authorName} · ${new Date(v.at).toLocaleString('en-GB')}`,
          })),
  );

  useEffect(() => {
    if (!USE_API) return;
    let live = true;
    void ConfigApi.sla().then((r) => {
      if (live && r.ok) setPolicy((prev) => ({ ...prev, ...r.value.policy }));
    });
    void ConfigApi.versions('sla').then((r) => {
      if (!live || !r.ok) return;
      setHistory(
        r.value.versions.map((v) => ({
          id: v.id,
          label: v.reason ?? 'SLA policy updated',
          meta: `${v.actorName ?? 'Unknown'} · ${new Date(v.createdAt).toLocaleString('en-GB')}`,
        })),
      );
    });
    return () => { live = false; };
  }, [saved]);

  const setHours = (p: Priority, v: string) => {
    const n = Math.max(1, Number(v) || 1);
    setPolicy((prev) => ({ ...prev, resolutionHours: { ...prev.resolutionHours, [p]: n } }));
    setSaved(false);
  };

  const save = async () => {
    if (!session) return;
    setError(null);
    if (!editable.editable) {
      // Belt and braces: the button is disabled, but a refusal must also exist at the action
      // level. A control that is only hidden is not a control (B06 §Administration Access).
      return setError(editable.reason ?? 'This policy cannot be changed here.');
    }
    // Validate before writing. The policy is a live business rule and nothing downstream stops
    // an incoherent one — a target of zero makes every ticket overdue on submission.
    const bad = PRIORITIES.filter((p) => !(policy.resolutionHours[p] > 0));
    if (bad.length) return setError(`Resolution targets must be greater than zero (${bad.join(', ')}).`);
    if (!(policy.dueSoonThreshold > 0 && policy.dueSoonThreshold < 1)) {
      return setError('The Due Soon threshold must be between 0 and 1.');
    }
    for (let i = 1; i < PRIORITIES.length; i += 1) {
      const higher = PRIORITIES[i - 1]!;
      const lower = PRIORITIES[i]!;
      if (policy.resolutionHours[higher] >= policy.resolutionHours[lower]) {
        return setError(
          `${higher} must have a tighter target than ${lower}, or raising a ticket's priority would give it more time.`,
        );
      }
    }
    /**
     * WRITE WHERE THE APPLICATION IS READING.
     *
     * In API mode the policy that governs every deadline lives in the server's Config table, so
     * that is what has to change. This page previously called `ConfigService.setSlaPolicy`
     * unconditionally — a localStorage write — and then reported success, which is B06's worst
     * finding: a green confirmation for a change that governed nothing. `useServerEditable` made
     * that safe by disabling the button; making the server writable again is only safe because
     * the write now goes there.
     */
    if (USE_API) {
      const r = await ConfigApi.setSla(policy, 'Updated via SLA Management');
      if (!r.ok) return setError(r.error);
      /**
       * MERGE, do not replace.
       *
       * The server's policy is a SUBSET of this one: it stores the targets and the threshold, but
       * not `escalation`, whose BR-096 recipients are client-side configuration because no sweeper
       * exists to send to them. Assigning the response wholesale dropped that field and the render
       * below crashed on `policy.escalation.onBreach`.
       *
       * This was written as `r.value.policy as typeof policy` — and the cast is the whole reason
       * it compiled. Asserting a subset is the full type told the compiler to stop checking the
       * exact mismatch it would otherwise have caught. Spreading needs no cast, which is the point.
       */
      setPolicy((prev) => ({ ...prev, ...r.value.policy }));
      setSaved(true);
      return;
    }
    ConfigService.setSlaPolicy(policy, session, 'Updated via SLA Management');
    setSaved(true);
  };

  const reset = async () => {
    if (!session) return;
    setError(null);
    if (!editable.editable) return setError(editable.reason ?? 'This policy cannot be changed here.');
    if (USE_API) {
      const r = await ConfigApi.resetSla();
      if (!r.ok) return setError(r.error);
      // Defaults for the fields the server owns, defaults for the escalation it does not — a
      // reset that left the local half untouched would only be half a reset.
      setPolicy({ ...DEFAULT_SLA_POLICY, ...r.value.policy });
      setSaved(true);
      return;
    }
    ConfigService.resetSlaPolicy(session);
    setPolicy(DEFAULT_SLA_POLICY);
    setSaved(true);
  };

  return (
    <section className="max-w-3xl">
      <PageHeader icon={Timer} title="SLA Management" description="Resolution targets and warning threshold — configuration, not code." />

      {/* The honest disclosure. Without it this page wrote to localStorage in API mode and
          reported success — a change the administrator believed had taken effect and that
          governed nothing. */}
      {!editable.pending && !editable.editable && editable.reason && (
        <div role="status" className="mb-4 flex items-start gap-2 rounded-md border border-warning bg-warning-bg px-3 py-2 text-body-sm text-warning-text">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span><strong>Read-only against this server.</strong> {editable.reason}</span>
        </div>
      )}
      <InlineError message={error} className="mb-4" />
      <LiveRegion message={saved ? 'SLA policy saved. New tickets will use these targets.' : null} />

      <div className="mb-5 flex items-start gap-2 rounded-md border border-info bg-info-bg px-3 py-2 text-body-sm text-info-text">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Targets are in <strong>business hours</strong> (Mon–Fri, {ConfigService.org().workingHours.start}:00–{ConfigService.org().workingHours.end}:00, {ConfigService.org().timezone}).
          The clock pauses while a ticket is <strong>Awaiting Information</strong>. <strong>Overdue is a derived flag</strong>, never a status.
        </span>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-label uppercase text-text-muted">Resolution target by priority</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          {PRIORITIES.map((p) => (
            <label key={p} className="block">
              <span className="mb-1 block text-label text-text">{p}</span>
              <div className="flex items-center gap-1">
                {/* Tabular figures: the four targets are read across as a set, so the digits
                    must occupy the same width in each box or the comparison is ragged. */}
                <input className="input tabular-nums" type="number" min={1} value={policy.resolutionHours[p]} onChange={(e) => setHours(p, e.target.value)} aria-label={`${p} resolution hours`} />
                <span className="text-caption text-text-muted">h</span>
              </div>
            </label>
          ))}
        </div>

        <h2 className="mb-3 mt-5 text-label uppercase text-text-muted">Due Soon threshold</h2>
        <label className="block max-w-xs">
          <span className="mb-1 block text-caption text-text-muted">Flag Due Soon when this fraction of time remains.</span>
          <div className="flex items-center gap-2">
            <input
              className="input tabular-nums"
              type="number" min={0.05} max={0.9} step={0.05}
              value={policy.dueSoonThreshold}
              onChange={(e) => { setPolicy((prev) => ({ ...prev, dueSoonThreshold: Number(e.target.value) || 0.2 })); setSaved(false); }}
              aria-label="Due soon threshold"
            />
            <span className="whitespace-nowrap text-body-sm text-text-secondary">= last {Math.round(policy.dueSoonThreshold * 100)}%</span>
          </div>
        </label>

        {/* BR-096 escalation targets. READ-ONLY and labelled as not firing — the trigger is a
            scheduled SLA sweep and this build has no scheduler, so presenting an editable control
            would be a setting that changes nothing. Shown rather than hidden because an
            administrator asking "who gets told when we breach?" deserves the real answer, which
            today is "the configuration says these four, and nothing sends it". */}
        <h2 className="mb-2 mt-5 text-label uppercase text-text-muted">Breach escalation (BR-096)</h2>
        <div className="rounded-md border border-warning bg-warning-bg px-3 py-2">
          <p className="text-body-sm text-warning-text">
            <strong>Configured, not yet delivered.</strong> Overdue is derived when a ticket is read, and no sweep
            detects a breach nobody has looked at. The server does now run a scheduler, but only for auto-close —
            nothing is registered against these recipients. They are what a breach sweeper would use.
          </p>
          <dl className="mt-2 grid gap-1 text-body-sm sm:grid-cols-2">
            <div>
              <dt className="text-caption uppercase text-text-muted">On breach</dt>
              <dd className="text-text">{policy.escalation.onBreach.map(escalationLabel).join(' · ')}</dd>
            </div>
            <div>
              <dt className="text-caption uppercase text-text-muted">On due soon</dt>
              <dd className="text-text">{policy.escalation.onDueSoon.map(escalationLabel).join(' · ') || 'Nobody'}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-5 flex items-center gap-2 border-t border-border pt-4">
          <button type="button" onClick={() => void save()} disabled={!editable.editable} className="btn-primary">
            <Save size={16} aria-hidden /> Save policy
          </button>
          <button type="button" onClick={() => void reset()} disabled={!editable.editable} className="btn-neutral">
            <RotateCcw size={16} aria-hidden /> Reset to defaults
          </button>
          {saved && <span className="text-body-sm text-success-text">Saved · versioned · audited</span>}
        </div>
      </div>

      <h2 className="mb-2 mt-6 text-label uppercase text-text-muted">Change history (§14)</h2>
      <div className="card">
        {history.length === 0 ? (
          <p className="px-4 py-6 text-center text-body-sm text-text-muted">No SLA changes recorded.</p>
        ) : (
          <ul className="divide-y divide-border">
            {history.map((v) => (
              <li key={v.id} className="flex items-center justify-between px-4 py-2 text-body-sm">
                <span className="text-text">{v.label}</span>
                <span className="text-caption text-text-muted">{v.meta}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
