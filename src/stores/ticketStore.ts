import { create } from 'zustand';
import type { Session } from '@domain/types/auth.types';
import type { Comment, Priority, Ticket } from '@domain/types/ticket.types';
import { TicketRepository } from '@services/ticketRepository';
import { TicketService, type CreateTicketInput, type ServiceResult } from '@services/ticketService';
import { TicketApi } from '@services/api/ticketApi';
import { USE_API } from '@config/runtime.config';
import { withFreshFlag } from '@domain/sla/slaEngine';
import { ConfigService } from '@services/configService';
import { byPriority } from '@domain/workflow/priorityEngine';

/**
 * Ticket store (Zustand). In-memory mirror; persistence belongs to the repository (prototype) or
 * to the server (API mode). Actions delegate, then refresh, so every view — My Tickets, Queue,
 * Details — stays in sync through one path (P13 §17).
 *
 * ASYNC. Mutations and `refresh` now return Promises, because in API mode each is a round-trip.
 * The prototype path resolves immediately, so a component awaits the same call either way.
 *
 * `byId` / `myTickets` / `departmentQueue` stay SYNCHRONOUS selectors over the in-memory mirror:
 * they are reads of state the store already has, and making them async would force every list to
 * manage a loading state it does not need.
 */
interface TicketState {
  tickets: Ticket[];
  /** True while the first load is in flight — lets views show a skeleton rather than "no tickets". */
  loading: boolean;
  /** Set when a refresh fails, so a view can say the data is stale rather than showing an empty list. */
  loadError: string | null;

  refresh: () => Promise<void>;
  byId: (id: string) => Ticket | undefined;
  /** Fetch ONE ticket with its comments/attachments/activity (the list omits them). */
  fetchOne: (id: string) => Promise<ServiceResult<Ticket>>;
  myTickets: (userId: string) => Ticket[];
  departmentQueue: (deptCode: string) => Ticket[];

  create: (input: CreateTicketInput, session: Session, submit: boolean) => Promise<ServiceResult<Ticket>>;
  commit: (ticketId: string, action: string, session: Session, assignee?: { id: string; name: string }, note?: string) => Promise<ServiceResult<Ticket>>;
  reassign: (ticketId: string, assignee: { id: string; name: string }, session: Session) => Promise<ServiceResult<Ticket>>;
  changePriority: (ticketId: string, priority: Priority, session: Session, reason?: string) => Promise<ServiceResult<Ticket>>;
  comment: (ticketId: string, body: string, session: Session, kind?: Comment['kind']) => Promise<ServiceResult<Ticket>>;
  attach: (ticketId: string, file: { fileName: string; contentType: string; size: number; dataUrl: string }, session: Session) => Promise<ServiceResult<Ticket>>;
}

const loadLocal = (): Ticket[] => {
  const policy = ConfigService.slaPolicy();
  return TicketRepository.all().map((t) => withFreshFlag(t, policy));
};

const bySla = (a: Ticket, b: Ticket) =>
  byPriority(a.priority, b.priority) || b.updatedAt.localeCompare(a.updatedAt);

/** Replace one ticket in the mirror, preserving list order. */
const merge = (list: Ticket[], next: Ticket): Ticket[] => {
  const i = list.findIndex((t) => t.id === next.id);
  if (i === -1) return [next, ...list];
  const copy = [...list];
  copy[i] = next;
  return copy;
};

export const useTicketStore = create<TicketState>((set, get) => ({
  // In API mode nothing is known until the first fetch; in prototype mode the data is already
  // on disk, so seeding synchronously avoids a pointless empty first paint.
  tickets: USE_API ? [] : loadLocal(),
  loading: USE_API,
  loadError: null,

  refresh: async () => {
    if (!USE_API) {
      set({ tickets: loadLocal(), loading: false, loadError: null });
      return;
    }
    set({ loading: true });
    const r = await TicketApi.list();
    if (r.ok) set({ tickets: r.value, loading: false, loadError: null });
    // Keep the previous list on failure. Blanking it would tell the user they have no tickets,
    // which is a different — and wrong — statement from "we could not reach the server".
    else set({ loading: false, loadError: r.error });
  },

  byId: (id) => get().tickets.find((t) => t.id === id),

  fetchOne: async (id) => {
    if (!USE_API) {
      const t = get().byId(id);
      return t ? { ok: true, value: t } : { ok: false, error: 'Ticket not found.' };
    }
    const r = await TicketApi.byId(id);
    if (r.ok) set({ tickets: merge(get().tickets, r.value) });
    return r;
  },

  myTickets: (userId) => get().tickets.filter((t) => t.createdById === userId).sort(bySla),

  departmentQueue: (deptCode) =>
    get().tickets.filter((t) => t.toDeptCode === deptCode && t.status !== 'Draft').sort(bySla),

  create: async (input, session, submit) => {
    if (!USE_API) {
      const r = TicketService.create(input, session, submit);
      await get().refresh();
      return r;
    }
    const r = await TicketApi.create(input, submit);
    if (r.ok) set({ tickets: merge(get().tickets, r.value) });
    return r;
  },

  commit: async (ticketId, action, session, assignee, note) => {
    if (!USE_API) {
      const r = TicketService.commitAction(ticketId, action, session, assignee, note);
      await get().refresh();
      return r;
    }
    const r = await TicketApi.commit(ticketId, action, assignee, note);
    if (r.ok) set({ tickets: merge(get().tickets, r.value) });
    return r;
  },

  reassign: async (ticketId, assignee, session) => {
    if (!USE_API) {
      const r = TicketService.reassign(ticketId, assignee, session);
      await get().refresh();
      return r;
    }
    const r = await TicketApi.reassign(ticketId, assignee);
    if (r.ok) set({ tickets: merge(get().tickets, r.value) });
    return r;
  },

  changePriority: async (ticketId, priority, session, reason) => {
    if (!USE_API) {
      const r = TicketService.changePriority(ticketId, priority, session, reason);
      await get().refresh();
      return r;
    }
    const r = await TicketApi.changePriority(ticketId, priority, reason);
    if (r.ok) set({ tickets: merge(get().tickets, r.value) });
    return r;
  },

  comment: async (ticketId, body, session, kind) => {
    if (!USE_API) {
      const r = TicketService.addComment(ticketId, body, session, kind);
      await get().refresh();
      return r;
    }
    const r = await TicketApi.comment(ticketId, body, kind ?? 'comment');
    if (r.ok) set({ tickets: merge(get().tickets, r.value) });
    return r;
  },

  attach: async (ticketId, file, session) => {
    if (!USE_API) {
      const r = TicketService.addAttachment(ticketId, file, session);
      await get().refresh();
      return r;
    }
    const r = await TicketApi.attach(ticketId, file);
    if (r.ok) set({ tickets: merge(get().tickets, r.value) });
    return r;
  },
}));
