import { create } from 'zustand';
import { NotificationService, type AppNotification } from '@services/notificationService';
import { NotificationApi } from '@services/api/adminApi';
import { USE_API } from '@config/runtime.config';

/**
 * Notification store — reads the notification engine's output for the current user.
 *
 * In API mode the feed is scoped SERVER-SIDE to the authenticated identity. The `userId` argument
 * stays in the signature so callers are unchanged, but it is deliberately unused on the API path:
 * the server ignores any client-supplied id, and honouring one here would imply a control the
 * backend does not offer.
 */
interface NotificationState {
  notifications: AppNotification[];
  /**
   * Loading and failure state, which the store did not expose and no view could therefore show.
   * The notification centre rendered "No notifications — updates on your tickets will appear
   * here" when the fetch FAILED: a reassuring sentence, and the opposite of the truth, on the
   * screen whose whole job is to tell someone that something needs them.
   */
  loading: boolean;
  loadError: string | null;
  load: (userId: string) => Promise<void>;
  /**
   * THE unread count. B08: "Do not derive unread counts independently in multiple components."
   * It was recomputed in the header, the notification page and the dashboard quick actions —
   * three filters over the same array, which is how three views come to disagree.
   */
  unreadCount: () => number;
  markAllRead: (userId: string) => Promise<void>;
}

/** API row -> the shape the notification UI already renders. */
const toAppNotification = (n: {
  id: string; ticketId: string | null; leaveRequestId?: string | null;
  type: string; message: string; read: boolean; createdAt: string;
}): AppNotification => ({
  id: n.id,
  // Server-scoped: the feed IS the recipient's, so echoing an id back would be redundant.
  recipientId: '',
  ticketId: n.ticketId ?? '',
  /**
   * A leave notification points at a leave application, not a ticket, and the notification centre
   * routes on this field. It was MISSING here while the server was already sending it: the row
   * carried `leaveRequestId`, this mapper dropped it, so every leave notification in API mode fell
   * through to the ticket link and opened `/app/tickets/` with an empty id — a dead link on the
   * one message telling someone their leave had been decided. localStorage mode was unaffected,
   * which is exactly why it survived: the two modes fill this shape by different routes.
   */
  ...(n.leaveRequestId ? { leaveId: n.leaveRequestId } : {}),
  // The API message already embeds the ticket or leave code, so there is no separate field to fill.
  ticketCode: '',
  type: n.type as AppNotification['type'],
  message: n.message,
  at: n.createdAt,
  read: n.read,
});

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  loading: USE_API,
  loadError: null,

  load: async (userId) => {
    if (!USE_API) {
      set({ notifications: NotificationService.forUser(userId), loading: false, loadError: null });
      return;
    }
    set({ loading: true });
    const r = await NotificationApi.list();
    // Keep the previous list on failure — blanking it would state "you have no notifications",
    // a different and wrong claim from "we could not reach the server". The error is now
    // RECORDED as well as the list preserved, so a view can say which of the two it is.
    if (r.ok) set({ notifications: r.value.notifications.map(toAppNotification), loading: false, loadError: null });
    else set({ loading: false, loadError: r.error });
  },

  unreadCount: () => get().notifications.filter((n) => !n.read).length,

  markAllRead: async (userId) => {
    if (!USE_API) {
      NotificationService.markAllRead(userId);
      set({ notifications: NotificationService.forUser(userId) });
      return;
    }
    const r = await NotificationApi.markAllRead();
    if (r.ok) await get().load(userId);
  },
}));
