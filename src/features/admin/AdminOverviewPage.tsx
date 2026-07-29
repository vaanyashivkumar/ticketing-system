import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, AlertTriangle, CheckCircle2, Info, Users, Tags, Timer, ScrollText } from 'lucide-react';
import { useAuth } from '@hooks/useAuth';
import { ConfigService } from '@services/configService';
import { UserService, type AdminUser } from '@services/userService';
import { AdminApi, type JobStatusResponse } from '@services/api/adminApi';
import { USE_API } from '@config/runtime.config';
import { DEPARTMENT_LIST } from '@config/departments.config';
import { ROUTES } from '@config/routes.config';
import { STATUS_DEFINITIONS } from '@config/statuses.config';
import { STATUS_TRANSITIONS } from '@config/statusTransitions.config';
import { PRIORITY_DEFINITIONS } from '@config/priority.config';
import { PageHeader } from '@components/common/PageHeader';
import { InlineError } from '@components/common/InlineError';
import { validateConfiguration, INAPPLICABLE_CHECKS, type Severity } from '@domain/admin/configValidation';

/**
 * ADMINISTRATION OVERVIEW (B06 §Administrator Dashboard).
 *
 * The landing page for `/admin`, which previously redirected straight to User Management — so
 * there was no screen that answered "is the configuration sound?" at all.
 *
 * It shows what B06 asks for AND CAN BE COMPUTED: what is configured, what the validator found,
 * and where to go next. It does not show "Routing Conflicts", "Workflow Validation Errors",
 * "Failed Administrative Actions" or "Permission Warnings" as separate tiles, because those are
 * not separate data sources here — they are outputs of one validator, and splitting one result
 * into four tiles that all read zero would imply four independent checks ran.
 */
export function AdminOverviewPage() {
  const { session } = useAuth();
  const [users, setUsers] = useState<readonly AdminUser[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  /**
   * Background-job health (§13). `null` = not asked yet; `false` = asked and could not be reached.
   * The three states are distinct on purpose — "we do not know" must not render as "not running".
   */
  const [jobs, setJobs] = useState<JobStatusResponse | null | false>(null);

  useEffect(() => {
    if (!USE_API) {
      setUsers(UserService.all());
      return;
    }
    let live = true;
    void AdminApi.users().then((r) => {
      if (!live) return;
      // Not silently swallowed. The administrator checks below depend on the user list, and
      // running them against an unknown roster would produce a confident "no administrators"
      // — which is an alarm, not a gap.
      if (r.ok) setUsers(r.value);
      else setUsersError(r.error);
    });
    void AdminApi.jobStatus().then((r) => {
      if (live) setJobs(r.ok ? r.value : false);
    });
    return () => {
      live = false;
    };
  }, []);

  const report = useMemo(
    () =>
      validateConfiguration({
        sla: ConfigService.slaPolicy(),
        org: ConfigService.org(),
        flags: ConfigService.flags(),
        categoryEnabled: ConfigService.isCategoryEnabled,
        ...(users ? { users } : {}),
      }),
    [users],
  );

  const versions = ConfigService.versions();
  if (!session) return null;

  const activeUsers = users?.filter((u) => u.active).length ?? null;
  const sysadmins = users?.filter((u) => u.active && u.role.capabilities.includes('SUPER_ADMIN')).length ?? null;
  const categoryInstances = ROUTES.reduce((n, r) => n + r.categories.length, 0);

  return (
    <section aria-labelledby="admin-overview">
      <PageHeader
        icon={ShieldCheck}
        titleId="admin-overview"
        title="Administration"
        description="What is configured, whether it is sound, and where to change it."
      />

      <InlineError message={usersError} className="mb-4" />

      {/* ---- Background jobs (§13) ------------------------------------------
          A scheduler's failure is SILENT by construction: its whole job is to act when nobody is
          watching, so nothing on any screen changes when it stops. Until now it had no client
          surface at all — it could have been dead for a week and the only symptom would have been
          tickets quietly not closing. `lastError` sits beside `lastRunAt` precisely so "running"
          and "working" cannot be confused. */}
      {USE_API && jobs !== null && (
        <section aria-labelledby="jobs" className="card-p mb-6">
          <h2 id="jobs" className="mb-2 text-label uppercase text-text-muted">Background jobs</h2>
          {jobs === false ? (
            <p role="status" className="flex items-start gap-2 text-body-sm text-warning-text">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
              The scheduler could not be reached, so whether tickets are auto-closing is unknown.
              This is not a report that it is stopped.
            </p>
          ) : (
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
              <div>
                <dt className="text-caption uppercase text-text-muted">Auto-close sweep</dt>
                <dd className="flex items-center gap-1.5 text-body-medium text-text">
                  {jobs.autoClose.started ? (
                    <><CheckCircle2 size={14} className="text-success-text" aria-hidden /> Running every {Math.round(jobs.autoClose.intervalMs / 60000)} min</>
                  ) : (
                    <><AlertTriangle size={14} className="text-warning-text" aria-hidden /> Not started</>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-caption uppercase text-text-muted">Last run</dt>
                <dd className="text-body text-text">
                  {jobs.autoClose.lastRunAt
                    ? `${new Date(jobs.autoClose.lastRunAt).toLocaleString('en-GB')} · ${jobs.autoClose.lastResult?.warned ?? 0} warned, ${jobs.autoClose.lastResult?.closed ?? 0} closed`
                    : 'Not yet run'}
                </dd>
              </div>
              <div>
                <dt className="text-caption uppercase text-text-muted">Policy</dt>
                <dd className="text-body text-text">
                  Closes after {jobs.policy.autoCloseAfterDays} days, warns {jobs.policy.autoCloseWarningLeadDays} days before
                </dd>
              </div>
              {jobs.autoClose.lastError && (
                <div className="sm:col-span-3">
                  <p role="alert" className="flex items-start gap-2 text-body-sm text-error-text">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
                    <span><strong>The last sweep failed.</strong> {jobs.autoClose.lastError}</span>
                  </p>
                </div>
              )}
            </dl>
          )}
        </section>
      )}

      {/* ---- Configuration health ------------------------------------------ */}
      <section aria-labelledby="health" className="card-p mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="health" className="text-label uppercase text-text-muted">
              Configuration health
            </h2>
            <p className="text-caption text-text-secondary">
              Does the running configuration hold together, or would something fail at the point of use?
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-label-sm ${
              report.errors > 0
                ? 'bg-error-bg text-error-text'
                : report.warnings > 0
                  ? 'bg-warning-bg text-warning-text'
                  : 'bg-success-bg text-success-text'
            }`}
          >
            {report.errors > 0 ? (
              <AlertTriangle size={13} aria-hidden />
            ) : (
              <CheckCircle2 size={13} aria-hidden />
            )}
            {report.errors} {report.errors === 1 ? 'error' : 'errors'} · {report.warnings}{' '}
            {report.warnings === 1 ? 'warning' : 'warnings'}
          </span>
        </div>

        {report.issues.length === 0 ? (
          <p className="text-body-sm text-text">
            No issues found across {report.passed.length} checks.
          </p>
        ) : (
          <ul className="space-y-2">
            {report.issues.map((i) => (
              <li key={i.id} className={`rounded-md border px-3 py-2 ${toneFor(i.severity)}`}>
                <p className="text-body-sm">
                  {/* The severity is a WORD, not only a border colour. */}
                  <span className="font-medium uppercase">{i.severity}</span>
                  <span className="ml-2 text-caption uppercase opacity-80">{i.area}</span>
                </p>
                <p className="mt-0.5 text-body-sm">{i.message}</p>
                <p className="mt-0.5 text-caption opacity-90">{i.consequence}</p>
              </li>
            ))}
          </ul>
        )}

        {/* Passing checks are listed, so a clean report is evidence rather than an absence of
            output — "we found nothing" and "we checked nothing" look identical otherwise. */}
        <details className="mt-3">
          <summary className="cursor-pointer text-caption text-text-secondary">
            {report.passed.length} checks passed
          </summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {report.passed.map((p) => (
              <li key={p} className="flex items-start gap-1.5 text-caption text-text-muted">
                <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-success" aria-hidden /> {p}
              </li>
            ))}
          </ul>
        </details>

        <details className="mt-2">
          <summary className="cursor-pointer text-caption text-text-secondary">
            Checks that do not apply to this configuration ({INAPPLICABLE_CHECKS.length})
          </summary>
          <dl className="mt-2 space-y-2">
            {INAPPLICABLE_CHECKS.map((c) => (
              <div key={c.asked}>
                <dt className="text-label-sm text-text">{c.asked}</dt>
                <dd className="text-caption text-text-muted">{c.why}</dd>
              </div>
            ))}
          </dl>
        </details>
        {!users && !usersError && (
          <p className="mt-2 text-caption text-text-muted">
            Administrator checks are pending the user list.
          </p>
        )}
      </section>

      {/* ---- What is configured ------------------------------------------- */}
      <h2 className="mb-2 text-label uppercase text-text-muted">What is configured</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Active users" value={activeUsers} of={users?.length ?? null} to="/admin/users" icon={Users} />
        <Stat label="Administrators" value={sysadmins} to="/admin/users" icon={ShieldCheck} />
        <Stat label="Departments" value={DEPARTMENT_LIST.length} note={`${DEPARTMENT_LIST.filter((d) => d.isDestination).length} receive tickets`} to="/admin/roles" icon={Users} />
        <Stat label="Routes" value={ROUTES.length} note={`${categoryInstances} route-scoped categories`} to="/admin/categories" icon={Tags} />
        <Stat label="Statuses" value={STATUS_DEFINITIONS.length} note={`${STATUS_TRANSITIONS.length} legal transitions`} to="/admin/roles" icon={ScrollText} />
        <Stat label="Priorities" value={PRIORITY_DEFINITIONS.length} note="Each with an SLA target" to="/admin/sla" icon={Timer} />
        <Stat label="Config changes" value={versions.length} note="Versioned and audited" to="/admin/system" icon={ScrollText} />
        <Stat label="Feature flags" value={Object.keys(ConfigService.flags()).length} to="/admin/system" icon={Info} />
      </div>

      {/* ---- Recent configuration changes ---------------------------------- */}
      <section aria-labelledby="recent-changes" className="card-p">
        <h2 id="recent-changes" className="mb-1 text-label uppercase text-text-muted">
          Recent configuration changes
        </h2>
        <p className="mb-3 text-caption text-text-secondary">Who changed what, and when.</p>
        {versions.length === 0 ? (
          <p className="py-4 text-center text-body-sm text-text-muted">
            No configuration has been changed yet. The running configuration is the ratified default.
          </p>
        ) : (
          <ol className="space-y-2">
            {versions.slice(0, 6).map((v) => (
              <li key={v.id} className="border-l-2 border-border pl-3 text-body-sm">
                <span className="text-text">{v.summary}</span>
                <span className="block text-caption text-text-muted">
                  v{v.version} · {v.authorName} · {new Date(v.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                  {v.modules.length > 0 && ` · ${v.modules.join(', ')}`}
                </span>
              </li>
            ))}
          </ol>
        )}
        <Link to="/admin/audit" className="mt-3 inline-block text-body-sm text-primary-text hover:underline">
          Open the full audit log
        </Link>
      </section>
    </section>
  );
}

const toneFor = (s: Severity): string =>
  s === 'error'
    ? 'border-error bg-error-bg text-error-text'
    : s === 'warning'
      ? 'border-warning bg-warning-bg text-warning-text'
      : 'border-info bg-info-bg text-info-text';

function Stat({
  label,
  value,
  of,
  note,
  to,
  icon: Icon,
}: {
  label: string;
  value: number | null;
  of?: number | null;
  note?: string;
  to: string;
  icon: typeof ShieldCheck;
}) {
  return (
    <Link
      to={to}
      className="card-interactive flex flex-col p-3"
    >
      <span className="flex items-center justify-between text-label text-text-muted">
        {label}
        <Icon size={14} className="text-text-muted" aria-hidden />
      </span>
      {/* Tabular figures: these tiles are read as a grid, so the counts have to line up. */}
      <span className="mt-1 text-h2 tabular-nums text-text">
        {/* Never a zero for "we do not know yet" — that is the class of claim this whole build
            has been removing. */}
        {value === null ? <span className="text-body-sm text-text-muted">Not loaded</span> : value}
        {value !== null && of != null && <span className="text-body-sm text-text-muted"> / {of}</span>}
      </span>
      {note && <span className="text-caption text-text-muted">{note}</span>}
    </Link>
  );
}
