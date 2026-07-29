import { api } from './client';
import { DEPARTMENTS } from '@config/departments.config';
import type { DepartmentCode, Capability } from '@domain/types/auth.types';
import type { Priority } from '@domain/types/ticket.types';
import type { AdminUser } from '@services/userService';

/**
 * Notifications, administration and configuration against the backend.
 *
 * Grouped in one module because they share a property worth stating: every one of these is
 * SERVER-AUTHORISED. The prototype's equivalents read localStorage, which the user controls — so
 * the admin screens were, in the D04 sense, governance theatre that a determined user could
 * bypass by editing storage. Against the API they are enforced by `requirePermission` and a
 * session the client cannot forge.
 */

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

// ---- Notifications (§6.5) --------------------------------------------------

export interface ApiNotification {
  id: string;
  ticketId: string | null;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export const NotificationApi = {
  /**
   * No `userId` argument, deliberately. The server scopes the feed to the authenticated identity
   * and ignores any client-supplied id — passing one here would imply a control that does not
   * exist, and the prototype's `forUser(userId)` signature is exactly what must NOT be carried
   * over (a feed is a summary of which tickets a person is involved in).
   */
  async list(): Promise<Result<{ notifications: ApiNotification[]; unread: number }>> {
    return api.get('/notifications?limit=100');
  },

  async markAllRead(): Promise<Result<{ marked: number }>> {
    return api.post('/notifications/read-all');
  },

  /**
   * Mark ONE notification read. The server scopes the update by `userId` in its WHERE clause, so
   * an id belonging to someone else matches nothing and returns the same 404 as an id that does
   * not exist — it cannot be used to discover whether a notification id is real.
   */
  async markOneRead(id: string): Promise<Result<{ ok: boolean }>> {
    return api.patch(`/notifications/${id}`, { read: true });
  },
};

// ---- Admin: users (§6.3) ---------------------------------------------------

export interface ApiAdminUser {
  id: string;
  name: string;
  email: string;
  avatarInitials: string;
  departmentCode: string;
  capabilities: string[];
  active: boolean;
}

/**
 * API user -> the SPA's `AdminUser` (a `User` plus `active`).
 *
 * `departmentId` and the nested `role` are DERIVED from the department code rather than sent by
 * the server, so `DEPARTMENTS` stays the single source of truth for what a department is.
 */
export function toAdminUser(u: ApiAdminUser): AdminUser {
  const code = u.departmentCode as DepartmentCode;
  const departmentId = DEPARTMENTS[code].id;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatarInitials: u.avatarInitials,
    departmentCode: code,
    departmentId,
    role: { departmentId, departmentCode: code, capabilities: u.capabilities as Capability[] },
    active: u.active,
  };
}

export const AdminApi = {
  async users(): Promise<Result<AdminUser[]>> {
    const r = await api.get<{ users: ApiAdminUser[] }>('/admin/users');
    return r.ok ? { ok: true, value: r.value.users.map(toAdminUser) } : r;
  },

  /**
   * The server owns the two lockout guards (no self-deactivation, never the last active
   * sysadmin). They are NOT re-checked here: a second copy would be one more thing to drift, and
   * the client's copy could never be the authority anyway. A refused change surfaces as the
   * server's own message.
   */
  async setActive(userId: string, active: boolean): Promise<Result<{ id: string; active: boolean }>> {
    const r = await api.patch<{ user: { id: string; active: boolean } }>(`/admin/users/${userId}`, { active });
    return r.ok ? { ok: true, value: r.value.user } : r;
  },

  // ---- Admin: audit (§6.6) -------------------------------------------------

  async audit(actorId?: string): Promise<Result<Array<Record<string, unknown>>>> {
    const q = actorId ? `?actorId=${encodeURIComponent(actorId)}&limit=500` : '?limit=500';
    const r = await api.get<{ events: Array<Record<string, unknown>> }>(`/admin/audit${q}`);
    return r.ok ? { ok: true, value: r.value.events } : r;
  },

  /**
   * Background-job health (§13).
   *
   * The scheduler that auto-closes resolved tickets and sends the day-5 warning had NO client
   * surface at all: it ran, or it failed every hour, and nothing anywhere showed which. A
   * background job's worst failure mode is silence — its whole purpose is to act when nobody is
   * watching, so "nobody is watching" is exactly when it must still be observable.
   */
  async jobStatus(): Promise<Result<JobStatusResponse>> {
    return api.get('/admin/jobs/status');
  },

  /** Run the auto-close sweep now — for demonstrating it, and for catching up after an outage. */
  async runAutoClose(): Promise<Result<{ warnedCount: number; closedCount: number }>> {
    return api.post('/admin/jobs/auto-close', {});
  },
};

export interface JobStatusResponse {
  autoClose: {
    started: boolean;
    intervalMs: number;
    lastRunAt: string | null;
    lastResult: { warned: number; closed: number } | null;
    lastError: string | null;
    runCount: number;
  };
  policy: { autoCloseAfterDays: number; autoCloseWarningLeadDays: number };
}

// ---- Configuration (§6.4) --------------------------------------------------

export interface ApiCategory {
  id: string;
  label: string;
  defaultPriority: string;
  enabled: boolean;
  provisional: boolean;
  routeId: string;
}

export const ConfigApi = {
  async categories(): Promise<Result<ApiCategory[]>> {
    const r = await api.get<{ categories: ApiCategory[] }>('/config/categories');
    return r.ok ? { ok: true, value: r.value.categories } : r;
  },

  async setCategoryEnabled(id: string, enabled: boolean): Promise<Result<{ id: string; enabled: boolean }>> {
    const r = await api.patch<{ category: { id: string; enabled: boolean } }>(`/config/categories/${id}`, { enabled });
    return r.ok ? { ok: true, value: r.value.category } : r;
  },

  /**
   * SLA policy. `editable` is the server's answer to "may this be saved here?" — read by
   * `useServerEditable`, which disables the controls when the answer is no. It was permanently
   * false while the API had no Config table; it is true now that writes genuinely persist.
   */
  async sla(): Promise<Result<SlaPolicyResponse>> {
    return api.get('/config/sla');
  },

  /**
   * Save the SLA policy SERVER-SIDE.
   *
   * This method is the point of the whole change. Without it the page called
   * `ConfigService.setSlaPolicy`, which writes to localStorage, and then showed
   * "Saved · versioned · audited" — a green confirmation for a change that governed nothing,
   * because every ticket kept being scheduled against the server's compile-time constants. That
   * was B06's worst finding, and re-enabling the button without this would have recreated it.
   */
  async setSla(policy: ApiSlaPolicy, reason?: string): Promise<Result<SlaPolicyResponse>> {
    return api.put('/config/sla', { value: policy, reason });
  },

  async resetSla(): Promise<Result<SlaPolicyResponse>> {
    return api.post('/config/sla/reset', {});
  },

  async org(): Promise<Result<OrgResponse>> {
    return api.get('/config/org');
  },

  async setOrg(calendar: OrgCalendar, reason?: string): Promise<Result<OrgResponse>> {
    return api.put('/config/org', { value: calendar, reason });
  },

  /** The registry and the stored state together — `implemented` always comes from the build. */
  async flags(): Promise<Result<{ flags: ApiFeatureFlag[]; editable: boolean }>> {
    return api.get('/config/flags');
  },

  async setFlag(key: string, value: boolean, reason?: string): Promise<Result<{ flags: Record<string, boolean> }>> {
    return api.patch(`/config/flags/${key}`, { value, reason });
  },

  /** Configuration history. Each row carries a full snapshot, which is what makes rollback real. */
  async versions(key?: string): Promise<Result<{ versions: ApiConfigVersion[] }>> {
    return api.get(`/config/versions${key ? `?key=${encodeURIComponent(key)}` : ''}`);
  },

  async rollback(versionId: string): Promise<Result<{ ok: boolean }>> {
    return api.post(`/config/versions/${versionId}/rollback`, {});
  },
};

/** Keyed by `Priority`, not `string` — the SPA's SlaPolicy requires all four to be present. */
export interface ApiSlaPolicy {
  resolutionHours: Record<Priority, number>;
  dueSoonThreshold: number;
}

export interface SlaPolicyResponse {
  policy: ApiSlaPolicy;
  editable: boolean;
  defaults?: ApiSlaPolicy;
}

export interface OrgCalendar {
  workingDays: number[];
  workingHours: { start: number; end: number };
  holidays: string[];
  timezone: string;
}

export interface OrgResponse { calendar: OrgCalendar; editable: boolean; defaults?: OrgCalendar }

export interface ApiFeatureFlag {
  key: string;
  description: string;
  modules: string[];
  implemented: boolean;
  enabled: boolean;
  /** False means "never configured", which is not the same as "deliberately off". */
  configured: boolean;
}

export interface ApiConfigVersion {
  id: string;
  key: string;
  value: unknown;
  previous: unknown;
  actorName: string | null;
  reason: string | null;
  restoredFromId: string | null;
  createdAt: string;
}
