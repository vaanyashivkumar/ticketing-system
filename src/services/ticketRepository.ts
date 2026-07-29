import type { Ticket } from '@domain/types/ticket.types';
import type { DepartmentCode } from '@domain/types/auth.types';
import { StorageAdapter } from './storage/localStorageAdapter';

/**
 * Ticket Repository (P13 §19; FRONTEND_ARCHITECTURE §13). The ONLY path to ticket
 * persistence. UI → Service → Repository → StorageAdapter(localStorage). Swap the adapter
 * for an HttpAdapter later with no change above this line.
 *
 * `update()` accepts a full Ticket only from the Workflow/Ticket services — status/lifecycle
 * fields are never patched ad-hoc from the UI (the chokepoint is enforced by convention +
 * the fact that only services import this module).
 */
const TICKETS = 'tickets';
const SEQ = 'ticketSeq';

export const TicketRepository = {
  all(): Ticket[] {
    return StorageAdapter.read<Ticket[]>(TICKETS) ?? [];
  },

  byId(id: string): Ticket | undefined {
    return TicketRepository.all().find((t) => t.id === id);
  },

  /**
   * Persist a ticket. Returns whether it ACTUALLY persisted (defect ST-001) — a caller must
   * never report success on `false`. Note this serialises the entire ticket collection, so a
   * failed write discards every pending change, not merely this one.
   */
  save(ticket: Ticket): boolean {
    const all = TicketRepository.all();
    const idx = all.findIndex((t) => t.id === ticket.id);
    if (idx >= 0) all[idx] = ticket;
    else all.push(ticket);
    return StorageAdapter.write(TICKETS, all);
  },

  /** Total attachment bytes across the whole store — the BR-107 store budget guard. */
  attachmentBytes(): number {
    return TicketRepository.all().reduce(
      (sum, t) => sum + t.attachments.reduce((s, a) => s + a.size, 0),
      0,
    );
  },

  /** Monotonic per-destination sequence for the human ticket code. */
  nextSeq(dest: DepartmentCode): number {
    const seqs = StorageAdapter.read<Record<string, number>>(SEQ) ?? {};
    const next = (seqs[dest] ?? 0) + 1;
    seqs[dest] = next;
    StorageAdapter.write(SEQ, seqs);
    return next;
  },
};
