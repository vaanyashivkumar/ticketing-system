import { API_BASE_URL } from '@config/runtime.config';
import type {
  Ticket, Comment, Attachment, ActivityEntry, SlaState,
  TicketStatus, Priority, SlaFlag, ActivityAction, CategoryData,
} from '@domain/types/ticket.types';
import type { DepartmentCode } from '@domain/types/auth.types';

/**
 * API row -> SPA domain object.
 *
 * The two shapes genuinely differ, and pretending otherwise would corrupt the UI silently:
 *
 *   - SLA is FLAT on the wire (`slaDueAt`, `slaPausedMsAccrued`, …) and NESTED in the domain
 *     (`sla: SlaState`). The database wants columns it can index and filter; the domain wants one
 *     cohesive value object.
 *   - Timestamps are `Date` once JSON-parsed into the API's own types, but cross the wire as ISO
 *     strings — which is what the SPA's types already expect, so they pass through unchanged.
 *   - `Comment.kind` is snake_case in Postgres (enum identifiers cannot hold a hyphen) and
 *     kebab-case in the domain. Mapped explicitly rather than string-replaced, so an unmapped
 *     value fails loudly instead of producing a kind nothing renders.
 *   - `Attachment.dataUrl` was a base64 payload in the prototype. Against the API it becomes a
 *     download URL, because the bytes live in object storage and the row never carries them
 *     (BACKEND_HANDOFF §15). Consumers use it as an href either way.
 */

/**
 * API rows are genuinely `unknown` at the boundary — they are parsed JSON, not typed objects.
 * `unknown` rather than `any` so every field access has to go through a narrowing helper below;
 * this codebase has no `any` and a network boundary is the worst place to start.
 */
type Row = Record<string, unknown>;

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : v == null ? fallback : String(v));
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' ? v : Number(v ?? fallback) || fallback);
const obj = (v: unknown): Row => (v && typeof v === 'object' ? (v as Row) : {});
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
/** A nested `{ name }` / `{ departmentCode }` include from Prisma. */
const nameOf = (v: unknown, fallback: string): string => str(obj(v).name, fallback);

const COMMENT_KIND: Record<string, Comment['kind']> = {
  comment: 'comment',
  info_request: 'info-request',
  info_response: 'info-response',
};

const iso = (v: unknown): string | null => (typeof v === 'string' ? v : v ? String(v) : null);

function toSla(r: Row): SlaState {
  return {
    startedAt: iso(r.slaStartedAt),
    dueAt: iso(r.slaDueAt),
    resolvedAt: iso(r.slaResolvedAt),
    closedAt: iso(r.slaClosedAt),
    pausedMsAccrued: Number(r.slaPausedMsAccrued ?? 0),
    pausedSince: iso(r.slaPausedSince),
    flag: (r.slaFlag ?? 'OnTrack') as SlaFlag,
  };
}

function toComment(c: Row): Comment {
  return {
    id: str(c.id),
    authorId: str(c.authorId),
    authorName: nameOf(c.author, str(c.authorName, 'Unknown')),
    departmentCode: str(obj(c.author).departmentCode, 'ADM') as DepartmentCode,
    body: str(c.body),
    kind: COMMENT_KIND[str(c.kind)] ?? 'comment',
    at: str(c.createdAt),
  };
}

function toAttachment(a: Row, ticketId: string): Attachment {
  return {
    id: str(a.id),
    fileName: str(a.fileName),
    contentType: str(a.contentType),
    size: num(a.size),
    uploadedById: str(a.uploadedById),
    uploadedByName: nameOf(a.uploadedBy, 'Unknown'),
    at: str(a.createdAt),
    // Not a payload — an authenticated download endpoint. The <a download> works the same.
    dataUrl: `${API_BASE_URL}/tickets/${ticketId}/attachments/${a.id}`,
  };
}

function toActivity(a: Row): ActivityEntry {
  return {
    id: str(a.id),
    actorId: str(a.actorId),
    actorName: nameOf(a.actor, 'System'),
    action: str(a.action) as ActivityAction,
    at: str(a.createdAt),
    // The two column pairs stay SEPARATE across the wire. Collapsing them into one display field
    // is what made the dashboard feed describe a Submitted->Assigned transition as a
    // re-assignment: both write the ASSIGNED action, and the pair they use is the only thing that
    // distinguishes them.
    ...(a.fromStatus ? { from: str(a.fromStatus) } : {}),
    ...(a.toStatus ? { to: str(a.toStatus) } : {}),
    ...(a.fromValue ? { fromValue: str(a.fromValue) } : {}),
    ...(a.toValue ? { toValue: str(a.toValue) } : {}),
    ...(a.note ? { note: str(a.note) } : {}),
  };
}

export function toTicket(r: Row): Ticket {
  return {
    id: str(r.id),
    code: str(r.code),
    subject: str(r.subject),
    description: str(r.description),
    status: str(r.status) as TicketStatus,
    priority: str(r.priority) as Priority,

    fromDeptCode: str(r.fromDeptCode) as DepartmentCode,
    toDeptCode: str(r.toDeptCode) as DepartmentCode,
    categoryId: str(r.categoryId),
    categoryLabel: str(r.categoryLabel),
    ...(r.subcategory ? { subcategory: str(r.subcategory) } : {}),
    categoryData: obj(r.categoryData) as CategoryData,

    createdById: str(r.createdById),
    createdByName: nameOf(r.createdBy, 'Unknown'),
    assignedToId: r.assignedToId ? str(r.assignedToId) : null,
    assignedToName: r.assignedTo ? nameOf(r.assignedTo, 'Unknown') : null,

    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),

    resolutionNote: r.resolutionNote ? str(r.resolutionNote) : null,
    rejectionReason: r.rejectionReason ? str(r.rejectionReason) : null,
    reopenCount: num(r.reopenCount),

    sla: toSla(r),
    // The list endpoint omits these; a ticket with no comments and one with comments not yet
    // loaded must not be conflated, so absent becomes an empty array only at the leaf.
    comments: arr(r.comments).map(toComment),
    attachments: arr(r.attachments).map((a) => toAttachment(a, str(r.id))),
    activity: arr(r.activities).map(toActivity),
  };
}

export const toTickets = (rows: unknown): Ticket[] => arr(rows).map(toTicket);
