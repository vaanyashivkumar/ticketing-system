import { api } from './client';
import { toTicket, toTickets } from './mappers';
import type { Ticket } from '@domain/types/ticket.types';
import type { CreateTicketInput } from '@services/ticketService';
import type { FeedItem } from '@domain/dashboard/activityFeed';

/** Uniform result shape, matching what the prototype services already return. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: string }): Result<T> => r;

/**
 * Ticket operations against the backend.
 *
 * Note what is NOT here: no permission checks, no transition validation, no guard enforcement.
 * All of that is the SERVER's job now, and duplicating it client-side would create a second
 * authority that can disagree with the real one. The SPA's domain engines still run — but as UX,
 * to grey out a button before the user clicks it, never as the decision.
 */
export const TicketApi = {
  async list(): Promise<Result<Ticket[]>> {
    const r = await api.get<Ticket[]>('/tickets?limit=200', (b) => toTickets((b as { tickets: unknown }).tickets));
    return unwrap(r);
  },

  /**
   * The list endpoint omits comments/attachments/activity for weight; the detail endpoint
   * includes them. Details pages must therefore fetch the ticket individually rather than
   * reading it out of the list, or the timeline would silently render empty.
   */
  async byId(id: string): Promise<Result<Ticket>> {
    const r = await api.get<Ticket>(`/tickets/${id}`, (b) => toTicket((b as { ticket: Record<string, unknown> }).ticket));
    return unwrap(r);
  },

  async create(input: CreateTicketInput, submit: boolean): Promise<Result<Ticket>> {
    // `fromDeptCode` and `createdById` are deliberately NOT sent — the server takes them from the
    // session. Sending them would be ignored anyway (verified), and including them here would
    // imply the client has a say in who it is.
    const r = await api.post<Ticket>('/tickets', {
      toDeptCode: input.toDeptCode,
      categoryId: input.categoryId,
      subject: input.subject,
      description: input.description,
      priority: input.priority,
      ...(input.subcategory ? { subcategory: input.subcategory } : {}),
      categoryData: input.categoryData,
      submit,
    }, (b) => toTicket((b as { ticket: Record<string, unknown> }).ticket));
    return unwrap(r);
  },

  async commit(
    ticketId: string,
    action: string,
    assignee?: { id: string },
    note?: string,
  ): Promise<Result<Ticket>> {
    const r = await api.post<Ticket>(`/tickets/${ticketId}/actions`, {
      action,
      ...(assignee ? { assignee: { id: assignee.id } } : {}),
      ...(note ? { note } : {}),
    }, (b) => toTicket((b as { ticket: Record<string, unknown> }).ticket));
    return unwrap(r);
  },

  async reassign(ticketId: string, assignee: { id: string }): Promise<Result<Ticket>> {
    const r = await api.patch<Ticket>(`/tickets/${ticketId}/assignee`, { assignee: { id: assignee.id } },
      (b) => toTicket((b as { ticket: Record<string, unknown> }).ticket));
    return unwrap(r);
  },

  /**
   * Recent activity across every ticket the caller can see.
   *
   * A separate call, not a field on the list: `GET /tickets` omits `activities` deliberately, so
   * the dashboard feed that reduced over the list was permanently empty in API mode. Attaching
   * every ticket's full history to every list render to show ten rows would have been the wrong
   * fix — a feed is a different query.
   */
  async activity(limit = 12): Promise<Result<FeedItem[]>> {
    const r = await api.get<{ activity: Array<Record<string, unknown>> }>(`/tickets/activity?limit=${limit}`);
    if (!r.ok) return { ok: false, error: r.error };
    return {
      ok: true,
      value: r.value.activity.map((a) => ({
        id: String(a.id),
        ticketId: String(a.ticketId),
        ticketCode: String(a.ticketCode ?? ''),
        actorName: String(a.actorName ?? 'system'),
        action: String(a.action) as FeedItem['action'],
        ...(a.fromStatus ? { from: String(a.fromStatus) } : {}),
        ...(a.toStatus ? { to: String(a.toStatus) } : {}),
        ...(a.fromValue ? { fromValue: String(a.fromValue) } : {}),
        ...(a.toValue ? { toValue: String(a.toValue) } : {}),
        ...(a.note ? { note: String(a.note) } : {}),
        at: String(a.at),
      })),
    };
  },

  /**
   * BR-060 re-grade. `reason` is optional: the specification mandates text on Reject, Resolve and
   * Reopen, and does NOT mandate it here — so requiring it would be inventing a rule.
   */
  async changePriority(ticketId: string, priority: string, reason?: string): Promise<Result<Ticket>> {
    const r = await api.patch<Ticket>(`/tickets/${ticketId}/priority`, { priority, ...(reason ? { reason } : {}) },
      (b) => toTicket((b as { ticket: Record<string, unknown> }).ticket));
    return unwrap(r);
  },

  /**
   * Comment and attachment return the CREATED record, not the ticket — so the caller re-fetches
   * the ticket to get a consistent view. Re-reading is cheaper than trying to splice a partial
   * update into the cached object and getting the activity trail subtly wrong.
   */
  async comment(ticketId: string, body: string, kind: string = 'comment'): Promise<Result<Ticket>> {
    const wireKind = kind.replace(/-/g, '_'); // domain kebab-case -> Postgres enum snake_case
    const r = await api.post(`/tickets/${ticketId}/comments`, { body, kind: wireKind });
    if (!r.ok) return { ok: false, error: r.error };
    return TicketApi.byId(ticketId);
  },

  async attach(
    ticketId: string,
    file: { fileName: string; contentType: string; dataUrl: string },
  ): Promise<Result<Ticket>> {
    // The prototype carried a full `data:` URL; the API wants raw base64 and stores the bytes.
    const base64 = file.dataUrl.includes(',') ? file.dataUrl.split(',')[1]! : file.dataUrl;
    const r = await api.post(`/tickets/${ticketId}/attachments`, {
      fileName: file.fileName, contentType: file.contentType, base64,
    });
    if (!r.ok) return { ok: false, error: r.error };
    return TicketApi.byId(ticketId);
  },
};
