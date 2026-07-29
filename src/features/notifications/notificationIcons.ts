import type { LucideIcon } from 'lucide-react';
import { UserCheck, MessageSquare, HelpCircle, CheckCircle2, XCircle, Archive, RotateCcw, Ban, Send, Flag, AlarmClock } from 'lucide-react';
import type { WorkflowEventType } from '@config/notifications.config';

/**
 * Notification icons — the presentation half of the template catalogue.
 *
 * They live here rather than in `notifications.config.ts` for the same reason the status icons
 * live outside `statuses.config.ts`: that module is imported by the API server to compose the text
 * of every notification it writes, and a `lucide-react` import would drag a React UI library — and
 * React itself — into a Node process. Worse than the weight, it would make the API's boot depend
 * on the SPA's `node_modules` being installed next door.
 *
 * Typed as a full `Record<WorkflowEventType, LucideIcon>` so it is compiler-exhaustive: adding an
 * event to the catalogue cannot leave an icon missing, which is the property that made moving them
 * out safe rather than just tidier.
 *
 * Every icon is decorative. The row always renders the message, the priority word and the category
 * label beside it, so the glyph is never the only signal (phase-2 §9) and a screen reader loses
 * nothing by ignoring it.
 */
export const NOTIFICATION_ICON: Record<WorkflowEventType, LucideIcon> = {
  TicketSubmitted: Send,
  TicketAssigned: UserCheck,
  InformationRequested: HelpCircle,
  InformationProvided: HelpCircle,
  TicketResolved: CheckCircle2,
  TicketRejected: XCircle,
  TicketClosed: Archive,
  TicketReopened: RotateCcw,
  TicketCancelled: Ban,
  PriorityChanged: Flag,
  CommentAdded: MessageSquare,
  AutoCloseWarning: AlarmClock,
};
