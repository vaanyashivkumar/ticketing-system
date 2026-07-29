import type { LucideIcon } from 'lucide-react';
import { FileEdit, Send, UserCheck, PlayCircle, HelpCircle, CheckCircle2, Archive, XCircle, Ban, RotateCcw } from 'lucide-react';
import type { TicketStatus } from '@domain/types/ticket.types';

/**
 * Status icons — the presentation half of the Status Engine.
 *
 * They live here rather than in `statuses.config.ts` because that module is imported by the API
 * to answer "is this status open?", and a `lucide-react` import would drag a React UI library
 * into a Node server. Typing this as a full `Record<TicketStatus, LucideIcon>` keeps it
 * compiler-exhaustive, so adding a status still cannot leave an icon missing.
 *
 * Every icon is decorative — the badge always renders the status LABEL beside it, so colour and
 * shape are never the only signal (phase-2 §9) and a screen reader never depends on the glyph.
 */
export const STATUS_ICON: Record<TicketStatus, LucideIcon> = {
  Draft: FileEdit,
  Submitted: Send,
  Assigned: UserCheck,
  InProgress: PlayCircle,
  AwaitingInformation: HelpCircle,
  Reopened: RotateCcw,
  Resolved: CheckCircle2,
  Closed: Archive,
  Rejected: XCircle,
  Cancelled: Ban,
};
