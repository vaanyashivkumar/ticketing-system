import { StorageAdapter } from './storage/localStorageAdapter';
import { newId, nowIso } from '@lib/id';
import type { DepartmentCode } from '@domain/types/auth.types';

/**
 * Centralised Audit Engine (P12 §17 auth events + P15 §8 administrative events).
 * APPEND-ONLY and IMMUTABLE: there is deliberately no update or delete API. Every
 * administrative action records actor · entity · previous value · new value · optional reason.
 */
export type AuditType =
  // Authentication (P12 §17)
  | 'LOGIN' | 'LOGOUT' | 'ROLE_LOADED' | 'PERMISSION_LOADED' | 'UNAUTHORIZED_ATTEMPT' | 'SESSION_RESTORED'
  // Administration (P15 §8)
  | 'USER_UPDATED' | 'USER_ACTIVATED' | 'USER_DEACTIVATED'
  | 'CATEGORY_UPDATED' | 'SLA_MODIFIED' | 'CONFIG_UPDATED' | 'FEATURE_FLAG_UPDATED';

export type AuditEntity = 'session' | 'user' | 'category' | 'sla' | 'config' | 'featureFlag';

export interface AuditEvent {
  readonly id: string;
  readonly at: string;
  readonly type: AuditType;
  readonly actorId: string | null;
  readonly actorName?: string;
  readonly departmentCode?: DepartmentCode;
  readonly entityType?: AuditEntity;
  readonly entityId?: string;
  readonly before?: string;
  readonly after?: string;
  readonly reason?: string;
  readonly detail?: string;
}

const DOMAIN = 'audit';

export interface AdminAuditInput {
  type: AuditType;
  actorId: string;
  actorName: string;
  departmentCode: DepartmentCode;
  entityType: AuditEntity;
  entityId: string;
  before?: string;
  after?: string;
  reason?: string;
}

export const AuditService = {
  /** Authentication / session events. */
  record(type: AuditType, actorId: string | null, detail?: string): void {
    const event: AuditEvent = { id: newId('aud'), at: nowIso(), type, actorId, ...(detail !== undefined ? { detail } : {}) };
    StorageAdapter.append<AuditEvent>(DOMAIN, event, 1000);
  },

  /** Administrative governance events — the full P15 §8 shape. */
  recordAdmin(input: AdminAuditInput): void {
    const event: AuditEvent = { id: newId('aud'), at: nowIso(), ...input };
    StorageAdapter.append<AuditEvent>(DOMAIN, event, 1000);
  },

  all(): readonly AuditEvent[] {
    return [...(StorageAdapter.read<AuditEvent[]>(DOMAIN) ?? [])].sort((a, b) => b.at.localeCompare(a.at));
  },

  forActor(actorId: string): readonly AuditEvent[] {
    return AuditService.all().filter((e) => e.actorId === actorId);
  },
};
