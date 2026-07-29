import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, Bell, Plus, Sun, Moon, LogOut, ChevronDown, Menu } from 'lucide-react';
import { useTheme } from '@providers/ThemeProvider';
import { useAuth } from '@hooks/useAuth';
import { useNotificationStore } from '@stores/notificationStore';
import { DEPARTMENTS } from '@config/departments.config';

/**
 * Top bar (phase-2 §6). Shows the real authenticated user + working logout, plus
 * the global-search placeholder, quick-action and notification affordances.
 */
export function Header({ onMenuClick }: { onMenuClick?: () => void } = {}) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuBoxRef = useRef<HTMLDivElement>(null);
  const loadNotifications = useNotificationStore((s) => s.load);
  // THE unread count, from the store. It was recomputed here, on the notifications page and in
  // the dashboard quick actions — three filters over the same array, which is how three views
  // come to disagree about one number (B08 §Unread Count Engine).
  const unread = useNotificationStore((s) => s.unreadCount)();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  /**
   * D04 #23 — the menu-button keyboard model.
   *
   * This declared `aria-haspopup="menu"` + `role="menu"` and implemented NONE of what those roles
   * promise: no Escape, no arrow keys, no focus management. It closed on `mousedown` only, so a
   * keyboard user could open it, Tab straight past it, and leave it hanging open with focus
   * somewhere else entirely — a menu that announces itself as a menu and behaves like a div.
   *
   * WAI-ARIA menu-button pattern: Down/Up/Enter/Space open and focus an item; Escape closes and
   * returns focus to the trigger; Tab closes. Focus restoration is the part that matters most —
   * without it a keyboard user is dropped at the top of the document after signing out.
   */
  const menuItems = useCallback(
    () => Array.from(menuBoxRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
    [],
  );

  /**
   * Focus must be applied AFTER React commits the menu, not on the next animation frame — a rAF
   * scheduled alongside `setMenuOpen(true)` can run before the commit, leaving `menuBoxRef` null
   * and focus stranded on the trigger. (Observed doing exactly that in the browser; the effect
   * below is the fix.) An intent is recorded, and an effect acts on it once the menu exists.
   */
  const [focusIntent, setFocusIntent] = useState<'first' | 'last' | null>(null);

  const openMenu = useCallback((focus: 'first' | 'last') => {
    setMenuOpen(true);
    setFocusIntent(focus);
  }, []);

  useEffect(() => {
    if (!menuOpen || !focusIntent) return;
    const items = menuItems();
    (focusIntent === 'first' ? items[0] : items[items.length - 1])?.focus();
    setFocusIntent(null);
  }, [menuOpen, focusIntent, menuItems]);

  const closeMenu = useCallback((restoreFocus = true) => {
    setMenuOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMenu('first');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu('last');
    }
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = menuItems();
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      // Tab moves on through the page — but the menu must not be left open behind it.
      closeMenu(false);
    }
  };

  // Keep the bell count fresh for the signed-in user.
  useEffect(() => {
    if (user) loadNotifications(user.id);
  }, [user, loadNotifications]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const dept = user ? DEPARTMENTS[user.departmentCode] : null;

  // Horizontal insets MATCH the content wrapper in AuthenticatedLayout (px-4 sm:px-6) so the
  // search field and menu trigger sit on the same left edge as the page content below.
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-4 sm:gap-3 sm:px-6">
      {/* Drawer trigger — below lg the sidebar is an overlay (P17 §7 / defect QA-001). */}
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open navigation"
        className="btn-quiet px-2 lg:hidden"
      >
        <Menu size={18} aria-hidden />
      </button>

      {/*
        Search collapses first so the primary actions always stay reachable.

        THE REMAPPED SCALE BITES TWICE HERE — both bugs were measured, not guessed:

        1. `left-3` is 24px on this project's 8-point scale (NOT the 12px stock Tailwind means).
           The 16px icon therefore ended at 40px while `pl-9` — which is 36px, because `9` is
           absent from the remap and falls back to stock 2.25rem — started the text at 36px. The
           icon sat ON the placeholder, 4px overlapping. `left-1.5` IS 12px here, which puts the
           icon at 12–28px and leaves exactly an 8px gap before the text at 36px.
        2. `.input` carries `py-2` = 16px a side, making the field 54px tall inside a 56px bar —
           2px of air, against the 40px/8px rhythm every other control in this header keeps.
           `h-10` (40px, the same value `.btn-*` reach for via `min-h-10`) restores it; `py-0`
           stops the inherited padding fighting the fixed height.
      */}
      <label className="relative hidden max-w-md flex-1 items-center sm:flex">
        <Search size={16} className="pointer-events-none absolute left-1.5 text-text-muted" aria-hidden />
        <input
          type="search"
          disabled
          placeholder="Search tickets, people, categories…"
          aria-label="Global search (coming soon)"
          /* `.input` already carries the disabled treatment this hand-rolled string copied. */
          className="input h-10 py-0 pl-9"
        />
      </label>

      <div className="ml-auto flex items-center gap-1">
        <Link
          to="/app/tickets/new"
          aria-label="New ticket"
          className="btn-primary px-2.5 sm:px-3"
        >
          <Plus size={16} aria-hidden /> <span className="hidden sm:inline">New ticket</span>
        </Link>

        <Link
          to="/app/notifications"
          aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
          className="btn-quiet relative px-2"
        >
          <Bell size={18} aria-hidden />
          {/* 16px (h-2 = space-2). `h-4 min-w-4` computed to 32px on this scale — a badge as big
              as the 40px button it sits on, all but covering the bell it annotates. Verified
              against a live account with 9 unread. */}
          {unread > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-2 min-w-2 items-center justify-center rounded-full bg-error px-1 text-label-sm text-primary-on">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Link>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          className="btn-quiet px-2"
        >
          {theme === 'light' ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
        </button>

        {user && (
          <div className="relative ml-1" ref={menuRef}>
            {/* py-0.5 is 4px here: 32px avatar + 4 + 4 = the 40px every other control in this
                row is. `py-1` (8px) made it 48px — the last thing standing off the rhythm. */}
            <button
              ref={triggerRef}
              type="button"
              onClick={() => (menuOpen ? closeMenu(false) : setMenuOpen(true))}
              onKeyDown={onTriggerKey}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-2 rounded-md py-0.5 pl-1 pr-2 transition-colors duration-base ease-standard hover:bg-surface-sunken"
            >
              {/* h-4 w-4 IS 32px on the remapped scale — the stock-Tailwind-looking `h-8 w-8`
                  this replaces was 64px, which made the whole trigger 80px tall and pushed it
                  12px past the top and bottom of a 56px header. Measured, not guessed. */}
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent-tint text-label text-accent-text">
                {user.avatarInitials}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-label leading-tight text-text">{user.name}</span>
                <span className="block text-caption leading-tight text-text-muted">{dept?.name}</span>
              </span>
              <ChevronDown size={14} className="text-text-muted" aria-hidden />
            </button>

            {menuOpen && (
              <div
                ref={menuBoxRef}
                role="menu"
                aria-label="Account"
                onKeyDown={onMenuKey}
                className="absolute right-0 z-dropdown mt-1 w-48 overflow-hidden rounded-md border border-border bg-surface-elevated py-1 shadow-e2"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  className="btn-quiet w-full justify-start gap-2 text-body text-text"
                >
                  <LogOut size={16} aria-hidden /> Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
