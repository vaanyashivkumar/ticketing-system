import { useState } from 'react';
import { SlidersHorizontal, Info } from 'lucide-react';
import { useAuth } from '@hooks/useAuth';
import { ConfigService } from '@services/configService';
import { FEATURE_FLAGS } from '@config/org.config';
import { PageHeader } from '@components/common/PageHeader';
import { InlineError } from '@components/common/InlineError';
import { useServerEditable } from './useServerEditable';

const DAYS = [
  { n: 1, label: 'Mon' },
  { n: 2, label: 'Tue' },
  { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' },
  { n: 6, label: 'Sat' },
  { n: 0, label: 'Sun' },
];

/**
 * System Configuration (P15 §9/§13) — the sysadmin governance surface.
 *
 * Lives at /admin behind SYSTEM_CONFIGURATION, NOT at /app/settings. D01 found that the recorded
 * plan ("Settings will host the sysadmin System-Config/Feature-Flags UI") would have shipped org
 * config and feature flags to EVERY user: /app/settings was nav-gated by VIEW_PROFILE — which
 * everyone holds — and its route carried no guard at all.
 *
 * D01 also blocked this page until CFG-001 was fixed: while the SLA engine hardcoded its
 * calendar, an editor here would have let an administrator believe they had changed business
 * hours when nothing changed. The calendar is now injected and genuinely governs SLA, so the
 * control is honest and the page can exist.
 */
export function SystemConfigPage() {
  const { session } = useAuth();
  const [org, setOrg] = useState(() => ConfigService.org());
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = useServerEditable();
  const flags = ConfigService.flags();

  if (!session) return null;

  const save = () => {
    setError(null);
    if (!editable.editable) return setError(editable.reason ?? 'These settings cannot be changed here.');
    if (org.workingHours.end <= org.workingHours.start) {
      return setError('The working day must end after it starts.');
    }
    if (org.workingDays.length === 0) {
      return setError('At least one working day is required, or no ticket could ever be due.');
    }
    ConfigService.setOrg(org, session);
    setSaved(true);
  };

  // The success banner must clear the moment the form changes again, or it keeps asserting that
  // what is on screen is what was saved — which stops being true at the first keystroke.
  const edit = (next: typeof org) => {
    setOrg(next);
    setSaved(false);
  };

  const toggleDay = (n: number) =>
    edit({
      ...org,
      workingDays: org.workingDays.includes(n) ? org.workingDays.filter((d) => d !== n) : [...org.workingDays, n].sort(),
    });

  return (
    <section aria-labelledby="sys-title">
      <PageHeader
        icon={SlidersHorizontal}
        title="System Configuration"
        description="Organisation-wide settings. Changes are versioned and audited."
      />

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
      {saved && !error && (
        <div role="status" className="mb-4 rounded-md border border-success bg-success-bg px-3 py-2 text-body-sm text-success-text">
          Saved. New tickets will use this calendar for their SLA due dates.
        </div>
      )}

      <div className="card-p mb-6">
        <h2 className="mb-1 text-body-medium text-text">Business calendar</h2>
        <p className="mb-4 text-body-sm text-text-secondary">
          SLA targets are counted in business hours. This calendar decides which hours count.
        </p>

        <fieldset className="mb-4">
          <legend className="mb-1.5 text-label text-text">Working days</legend>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d) => {
              const on = org.workingDays.includes(d.n);
              return (
                <button
                  key={d.n}
                  type="button"
                  onClick={() => toggleDay(d.n)}
                  aria-pressed={on}
                  /* `hover:bg-selected-bg` is not redundant: it re-pins the selected tint over
                     .btn-neutral's own hover, which would otherwise wash a pressed day back to
                     the unselected surface under the cursor. */
                  className={`btn-neutral ${on ? 'border-selected-border bg-selected-bg hover:bg-selected-bg' : 'text-text-secondary'}`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-4">
          <label className="text-label text-text">
            Day starts
            <input
              type="number"
              min={0}
              max={23}
              value={org.workingHours.start}
              onChange={(e) => setOrg((o) => ({ ...o, workingHours: { ...o.workingHours, start: Number(e.target.value) } }))}
              className="input mt-1 block w-24 tabular-nums"
            />
          </label>
          <label className="text-label text-text">
            Day ends
            <input
              type="number"
              min={1}
              max={24}
              value={org.workingHours.end}
              onChange={(e) => setOrg((o) => ({ ...o, workingHours: { ...o.workingHours, end: Number(e.target.value) } }))}
              className="input mt-1 block w-24 tabular-nums"
            />
          </label>
          <label className="min-w-56 flex-1 text-label text-text">
            Holidays (ISO dates, comma separated)
            <input
              type="text"
              value={org.holidays.join(', ')}
              placeholder="2026-12-25, 2026-12-26"
              onChange={(e) =>
                setOrg((o) => ({ ...o, holidays: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) }))
              }
              className="input mt-1 block"
            />
          </label>
        </div>

        {/* Honesty: timezone is configured but NOT honoured by the engine. Saying so beats
            letting an administrator believe they changed something that they did not. */}
        <div className="mt-4 flex items-start gap-2 rounded-md border border-border bg-surface-sunken px-3 py-2 text-body-sm text-text-secondary">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Timezone is <strong>{org.timezone}</strong>, but SLA times are currently computed in each
            user&rsquo;s <strong>local device timezone</strong>, not this one. Honouring it requires the backend
            that owns the authoritative clock — until then, treat this field as documentation.
          </span>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={!editable.editable}
          className="btn-primary mt-4"
        >
          Save calendar
        </button>
      </div>

      <div className="card-p">
        <h2 className="mb-1 text-body-medium text-text">Feature flags</h2>
        <p className="mb-4 text-body-sm text-text-secondary">
          A flag can only be enabled once the capability it gates exists in the build. None do yet, so
          all are read-only — enabling one would change nothing and record a governance action that
          did not happen.
        </p>
        <ul className="divide-y divide-border">
          {FEATURE_FLAGS.map((f) => (
            <li key={f.key} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="block text-body text-text">{f.description}</span>
                <span className="block text-caption text-text-muted">
                  {f.key} · {f.modules.join(', ')}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-body-sm text-text-muted">{flags[f.key] ? 'On' : 'Off'}</span>
                {!f.implemented && (
                  <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-label-sm text-text-secondary">
                    Not implemented
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
