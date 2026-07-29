import { useState } from 'react';
import { ShieldAlert, ShieldCheck, Shield } from 'lucide-react';
import {
  PERMISSION_CATALOGUE,
  DERIVATION_LABEL,
  CATALOGUE_GAPS,
  type PermissionRisk,
} from '@config/permissionCatalogue';

/**
 * The permission catalogue (B06 §Permission Management Engine) — a REVIEW surface, not an editor.
 *
 * Permissions are derived, not granted, so there is nothing here to tick. What an administrator
 * actually needs from a catalogue is the ability to answer "who can do the dangerous things, and
 * what enforces it?" — so every row names its derivation and its enforcement point, and rows can
 * be filtered by risk.
 *
 * `enforcedBy: null` renders as a defect, not a blank. A permission nothing checks is dead config,
 * and the catalogue is the one place that would notice.
 */

const RISK_ICON = { high: ShieldAlert, medium: Shield, low: ShieldCheck } as const;
const RISK_STYLE: Record<PermissionRisk, string> = {
  high: 'bg-error-bg text-error-text',
  medium: 'bg-warning-bg text-warning-text',
  low: 'bg-surface-sunken text-text-secondary',
};

export function PermissionCatalogue() {
  const [risk, setRisk] = useState<PermissionRisk | 'all'>('all');
  const [kind, setKind] = useState<'all' | 'static' | 'ticket'>('all');

  const rows = PERMISSION_CATALOGUE.filter(
    (p) => (risk === 'all' || p.risk === risk) && (kind === 'all' || p.kind === kind),
  );
  const unenforced = PERMISSION_CATALOGUE.filter((p) => p.enforcedBy === null);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-caption text-text-muted">Risk</span>
          <select className="input" value={risk} onChange={(e) => setRisk(e.target.value as typeof risk)} aria-label="Filter by risk level">
            <option value="all">Any risk</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-caption text-text-muted">Kind</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Filter by permission kind">
            <option value="all">All permissions</option>
            <option value="static">Identity-level</option>
            <option value="ticket">Per ticket</option>
          </select>
        </label>
        <span className="pb-2 text-caption text-text-muted">
          {rows.length} of {PERMISSION_CATALOGUE.length}
        </span>
      </div>

      {unenforced.length > 0 && (
        <div role="alert" className="mb-3 rounded-md border border-error bg-error-bg px-3 py-2 text-body-sm text-error-text">
          {unenforced.length} permission{unenforced.length === 1 ? '' : 's'} appear in the catalogue but nothing
          checks {unenforced.length === 1 ? 'it' : 'them'}: {unenforced.map((p) => p.id).join(', ')}. A right nobody
          reads is a promise the system does not keep.
        </div>
      )}

      <div className="table-shell overflow-x-auto" role="region" aria-label="Permission catalogue" tabIndex={0}>
        <table className="w-full text-table">
          <caption className="sr-only">
            Every permission in the system, its risk level, where it comes from and what enforces it
          </caption>
          {/* `text-text-secondary` pins AA contrast back over `.th`'s muted token — see the note
              in AuditLogsPage. Remove once globals.css raises the `.th` colour. */}
          <thead>
            <tr className="border-b border-border">
              <th className="th text-text-secondary">Permission</th>
              <th className="th text-text-secondary">Category</th>
              <th className="th text-text-secondary">Risk</th>
              <th className="th text-text-secondary">Derived from</th>
              <th className="th text-text-secondary">Enforced by</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const Icon = RISK_ICON[p.risk];
              return (
                <tr key={p.id} className="border-b border-border align-top last:border-0 row-hover">
                  <td className="td">
                    <span className="text-body-sm text-text">{p.name}</span>
                    <code className="block font-mono text-caption text-text-muted">{p.id}</code>
                    <span className="block max-w-md text-caption text-text-secondary">{p.description}</span>
                  </td>
                  <td className="td text-body-sm text-text-secondary">{p.category}</td>
                  <td className="td">
                    {/* Risk is a WORD plus a shape, never colour alone. */}
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label-sm ${RISK_STYLE[p.risk]}`}>
                      <Icon size={11} aria-hidden /> {p.risk}
                    </span>
                  </td>
                  <td className="td text-caption text-text-secondary">{DERIVATION_LABEL[p.derivation]}</td>
                  <td className="td text-caption text-text-muted">
                    {p.enforcedBy ?? <span className="text-error-text">Nothing — dead permission</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-caption text-text-secondary">
          Catalogue fields that do not apply to this model ({CATALOGUE_GAPS.length})
        </summary>
        <dl className="mt-2 space-y-2">
          {CATALOGUE_GAPS.map((g) => (
            <div key={g.field}>
              <dt className="text-label-sm text-text">{g.field}</dt>
              <dd className="text-caption text-text-muted">{g.why}</dd>
            </div>
          ))}
        </dl>
      </details>
    </>
  );
}
