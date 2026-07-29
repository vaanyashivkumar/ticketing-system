import { useEffect, useState } from 'react';
import { Tags, AlertTriangle } from 'lucide-react';
import { useAuth } from '@hooks/useAuth';
import { ROUTES } from '@config/routes.config';
import { DEPARTMENTS } from '@config/departments.config';
import { ConfigService } from '@services/configService';
import { ConfigApi } from '@services/api/adminApi';
import { USE_API } from '@config/runtime.config';
import { PageHeader } from '@components/common/PageHeader';
import { InlineError } from '@components/common/InlineError';

/**
 * Category Management (P15 §6). Categories are route-scoped configuration — displayed with
 * their dynamic fields, default priority and status. Enable/disable persists as an audited
 * override. Category CREATION is future work (it would extend the ratified routing matrix,
 * which requires stakeholder approval — the matrix is immutable per the Constitution).
 */
export function CategoryManagementPage() {
  const { session } = useAuth();
  const [version, setVersion] = useState(0);
  const [routeKey, setRouteKey] = useState(`${ROUTES[0].from}>${ROUTES[0].to}`);
  const [error, setError] = useState<string | null>(null);

  const route = ROUTES.find((r) => `${r.from}>${r.to}` === routeKey) ?? ROUTES[0];

  /**
   * The CATEGORIES come from the ratified routing config either way — they are the Constitution's
   * matrix, not server data. Only their ENABLED STATE is owned elsewhere: by ConfigService's
   * audited override map in prototype mode, by the server in API mode.
   */
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean> | null>(null);
  /**
   * `loadError` is not decoration. The previous version discarded the failure with
   * `if (!live || !r.ok) return;` and left `enabledMap` null, and `isEnabled` then fell back to
   * `?? true` — so a failed fetch painted EVERY category with a green "Enabled" badge. An
   * administrator looking at a disabled category saw it reported as live. A default is a claim,
   * and this one was made in exactly the situation where the page knew nothing.
   */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(USE_API);
  useEffect(() => {
    if (!USE_API) { setEnabledMap(null); setLoading(false); return; }
    let live = true;
    setLoading(true);
    void ConfigApi.categories().then((r) => {
      if (!live) return;
      setLoading(false);
      if (!r.ok) { setLoadError(r.error); return; }
      setLoadError(null);
      setEnabledMap(Object.fromEntries(r.value.map((c) => [c.id, c.enabled])));
    });
    return () => { live = false; };
  }, [version]);

  /** `null` = we do not know. The badge renders "Unknown" rather than guessing. */
  const isEnabled = (id: string): boolean | null =>
    USE_API ? (enabledMap ? (enabledMap[id] ?? true) : null) : ConfigService.isCategoryEnabled(id);

  const toggle = async (id: string, enabled: boolean) => {
    if (!session) return;
    setError(null);
    if (USE_API) {
      const r = await ConfigApi.setCategoryEnabled(id, enabled);
      if (!r.ok) setError(r.error);
    } else {
      ConfigService.setCategoryEnabled(id, enabled, session);
    }
    setVersion((v) => v + 1);
  };

  return (
    <section>
      <PageHeader icon={Tags} title="Category Management" description="Categories on each route, their dynamic fields and status." />
      <InlineError message={error} className="mb-4" />
      {loadError && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-error bg-error-bg px-3 py-2 text-body-sm text-error-text">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Could not load the current enabled state: {loadError} The categories below are the ratified
            configuration; whether each one is currently enabled is <strong>not known</strong>.
          </span>
        </div>
      )}
      {loading && <p role="status" className="mb-4 text-body-sm text-text-muted">Loading current category state…</p>}

      <label className="mb-4 block max-w-md">
        <span className="mb-1 block text-label text-text">Route</span>
        <select className="input" value={routeKey} onChange={(e) => setRouteKey(e.target.value)}>
          {ROUTES.map((r) => (
            <option key={`${r.from}>${r.to}`} value={`${r.from}>${r.to}`}>
              {DEPARTMENTS[r.from].name} → {DEPARTMENTS[r.to].name} ({r.categories.length})
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-3">
        {route.categories.map((c) => {
          const enabled = isEnabled(c.id);
          const provisional = c.fields.some((f) => f.provisional);
          return (
            <div key={c.id} className="card-p">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {/* h2, not h3 (A11Y-006): PageHeader is the h1 and there is no h2 between, so
                      this skipped a level and broke heading navigation. The visual size lives in
                      the class, so the level is free to be correct. */}
                  <h2 className="text-body-medium text-text">{c.label}</h2>
                  <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-label-sm text-text-secondary">Default: {c.defaultPriority}</span>
                  {provisional && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-label-sm text-warning-text">
                      <AlertTriangle size={11} aria-hidden /> Provisional fields (OQ-25/26)
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-label-sm ${enabled === null ? 'bg-warning-bg text-warning-text' : enabled ? 'bg-success-bg text-success-text' : 'bg-surface-sunken text-text-secondary'}`}>
                    {enabled === null ? 'Unknown' : enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={enabled === null}
                  onClick={() => { void toggle(c.id, !enabled); }}
                  className="btn-neutral"
                >
                  {enabled === null ? 'Unavailable' : enabled ? 'Disable' : 'Enable'}
                </button>
              </div>
              <p className="mb-1 text-caption uppercase text-text-muted">Dynamic fields ({c.fields.length})</p>
              <ul className="flex flex-wrap gap-1.5">
                {c.fields.map((f) => (
                  // A11Y-008 / design-system C14: muted text on `surface-sunken` is 4.34:1 — below
                  // AA. The two-level hierarchy is kept by promoting the label to `text` rather than
                  // flattening both to one colour: label `text`, descriptor `text-secondary`.
                  <li key={f.key} className="rounded-md bg-surface-sunken px-2 py-0.5 text-body-sm text-text">
                    {f.label} <span className="text-text-secondary">· {f.type}{f.required ? ' · required' : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-caption text-text-muted">
        The routing matrix is immutable (PROJECT_CONSTITUTION §2.3) — creating routes or categories requires stakeholder approval, so it is not offered here.
      </p>
      {/* Stated because the page groups by route and the control does not.
          `HR_INBOUND` is shared by five routes and `ACADEMICS_INBOUND` by four, so 44 of the 71
          route-scoped category instances collapse onto 10 override keys. Disabling "Leave Request"
          under Sales disables it for every department that raises to HR. Route-scoped disabling
          would need a route-scoped override key — a data change, not a UI change — so the
          behaviour is disclosed rather than misrepresented. */}
      <p className="mt-1 text-caption text-warning-text">
        Enabling and disabling is keyed by category, not by route. Several categories are shared across
        routes (the inbound sets for HR and Academics), so changing one here changes it on every route that
        offers it.
      </p>
    </section>
  );
}
