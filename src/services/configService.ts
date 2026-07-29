import { StorageAdapter } from './storage/localStorageAdapter';
import { AuditService, type AuditType, type AuditEntity } from './AuditService';
import { DEFAULT_SLA_POLICY, type SlaPolicy } from '@config/sla.config';
import { DEFAULT_ORG_CONFIG, FEATURE_FLAGS, featureFlagByKey, type OrgConfig } from '@config/org.config';
import type { Session } from '@domain/types/auth.types';
import { newId, nowIso } from '@lib/id';

/**
 * Configuration service (P15 §9/§13/§14). Reads = defaults + persisted overrides.
 * Writes are governance actions: every change is VERSIONED (§14) and AUDITED (§8).
 * Business rules live here as data — never hardcoded in features.
 */
const K_SLA = 'config.sla';
const K_ORG = 'config.org';
const K_FLAGS = 'config.flags';
const K_CATS = 'config.categories'; // { [categoryId]: { enabled?: boolean; label?: string } }
const K_VERSIONS = 'config.versions';

/** Matches the audit trail's bound. See pushVersion — a prototype compromise, not a design. */
const CONFIG_VERSION_CAP = 1000;

export interface ConfigVersion {
  readonly id: string;
  readonly version: number;
  readonly at: string;
  readonly authorId: string;
  readonly authorName: string;
  readonly summary: string;
  readonly modules: readonly string[];
}

export interface CategoryOverride {
  enabled?: boolean;
  label?: string;
}

function pushVersion(session: Session, summary: string, modules: string[]): void {
  const versions = StorageAdapter.read<ConfigVersion[]>(K_VERSIONS) ?? [];
  const entry: ConfigVersion = {
    id: newId('cfgv'),
    version: versions.length + 1,
    at: nowIso(),
    authorId: session.user.id,
    authorName: session.user.name,
    summary,
    modules,
  };
  // Bounded (D04 #31) — it previously grew without limit, bypassing the StorageAdapter.append
  // helper built for exactly this. Unbounded growth in localStorage ends as a quota failure.
  //
  // ⚠️ Unlike notifications, evicting a config version LOSES GOVERNANCE HISTORY — the record of
  // who changed what. The cap is high and matches the audit trail's, but it is a PROTOTYPE
  // COMPROMISE, not a design: durable retention is a backend responsibility (BR-086 wants 24
  // months). Documented in BACKEND_HANDOFF.md rather than hidden.
  StorageAdapter.append<ConfigVersion>(K_VERSIONS, entry, CONFIG_VERSION_CAP);
}

function audit(session: Session, type: AuditType, entityType: AuditEntity, entityId: string, before: unknown, after: unknown, reason?: string): void {
  AuditService.recordAdmin({
    type,
    actorId: session.user.id,
    actorName: session.user.name,
    departmentCode: session.user.departmentCode,
    entityType,
    entityId,
    before: JSON.stringify(before),
    after: JSON.stringify(after),
    ...(reason ? { reason } : {}),
  });
}

export const ConfigService = {
  // ---- SLA policy ----
  slaPolicy(): SlaPolicy {
    return StorageAdapter.read<SlaPolicy>(K_SLA) ?? DEFAULT_SLA_POLICY;
  },
  setSlaPolicy(next: SlaPolicy, session: Session, reason?: string): void {
    const before = ConfigService.slaPolicy();
    StorageAdapter.write(K_SLA, next);
    audit(session, 'SLA_MODIFIED', 'sla', 'default', before, next, reason);
    pushVersion(session, 'SLA policy updated', ['SLA', 'Tickets', 'Dashboard']);
  },
  resetSlaPolicy(session: Session): void {
    const before = ConfigService.slaPolicy();
    StorageAdapter.remove(K_SLA);
    audit(session, 'SLA_MODIFIED', 'sla', 'default', before, DEFAULT_SLA_POLICY, 'Reset to defaults');
    pushVersion(session, 'SLA policy reset to defaults', ['SLA']);
  },

  // ---- Organisation config ----
  org(): OrgConfig {
    return StorageAdapter.read<OrgConfig>(K_ORG) ?? DEFAULT_ORG_CONFIG;
  },
  setOrg(next: OrgConfig, session: Session): void {
    const before = ConfigService.org();
    StorageAdapter.write(K_ORG, next);
    audit(session, 'CONFIG_UPDATED', 'config', 'org', before, next);
    pushVersion(session, 'Organisation settings updated', ['Organisation', 'SLA']);
  },

  // ---- Feature flags ----
  flags(): Record<string, boolean> {
    const stored = StorageAdapter.read<Record<string, boolean>>(K_FLAGS) ?? {};
    const base: Record<string, boolean> = {};
    FEATURE_FLAGS.forEach((f) => (base[f.key] = f.defaultState));
    return { ...base, ...stored };
  },
  /**
   * The value a FEATURE should read. A flag whose capability is not implemented is always off,
   * whatever storage says — so a stale override can never make the app claim a capability it
   * does not have.
   */
  isFeatureEnabled(key: string): boolean {
    return (featureFlagByKey(key)?.implemented ?? false) && (ConfigService.flags()[key] ?? false);
  },

  /**
   * Governance write. REFUSES to enable a flag whose feature does not exist (D04 #39): a toggle
   * that flips a badge and writes an audit entry while changing nothing is exactly the
   * governance theatre this phase is removing. Disabling is always allowed.
   */
  setFlag(key: string, value: boolean, session: Session): { ok: true } | { ok: false; error: string } {
    const flag = featureFlagByKey(key);
    if (!flag) return { ok: false, error: `Unknown feature flag "${key}".` };
    if (value && !flag.implemented) {
      return {
        ok: false,
        error: `"${flag.description}" is not implemented in this build — enabling it would change nothing.`,
      };
    }
    const before = ConfigService.flags()[key];
    const next = { ...ConfigService.flags(), [key]: value };
    StorageAdapter.write(K_FLAGS, next);
    audit(session, 'FEATURE_FLAG_UPDATED', 'featureFlag', key, before, value);
    pushVersion(session, `Feature flag "${key}" set to ${value}`, ['Feature flags']);
    return { ok: true };
  },

  // ---- Category overrides ----
  categoryOverrides(): Record<string, CategoryOverride> {
    return StorageAdapter.read<Record<string, CategoryOverride>>(K_CATS) ?? {};
  },
  isCategoryEnabled(categoryId: string): boolean {
    return ConfigService.categoryOverrides()[categoryId]?.enabled ?? true;
  },
  categoryLabel(categoryId: string, fallback: string): string {
    return ConfigService.categoryOverrides()[categoryId]?.label ?? fallback;
  },
  setCategoryEnabled(categoryId: string, enabled: boolean, session: Session): void {
    const all = ConfigService.categoryOverrides();
    const before = all[categoryId]?.enabled ?? true;
    const next = { ...all, [categoryId]: { ...all[categoryId], enabled } };
    StorageAdapter.write(K_CATS, next);
    audit(session, 'CATEGORY_UPDATED', 'category', categoryId, { enabled: before }, { enabled });
    pushVersion(session, `Category "${categoryId}" ${enabled ? 'enabled' : 'disabled'}`, ['Categories', 'Tickets']);
  },

  // ---- Version history ----
  versions(): readonly ConfigVersion[] {
    return [...(StorageAdapter.read<ConfigVersion[]>(K_VERSIONS) ?? [])].sort((a, b) => b.version - a.version);
  },
};
