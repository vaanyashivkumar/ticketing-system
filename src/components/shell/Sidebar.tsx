import { NavLink } from 'react-router-dom';
import { Building2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NAV_GROUPS } from '@config/navigation.config';
import { APP_VERSION } from '@config/org.config';
import { USE_API } from '@config/runtime.config';
import { usePermissions } from '@hooks/usePermissions';
import { cn } from '@lib/cn';

/**
 * Left primary navigation (phase-2 §6; P12 §7). GENERATED dynamically: every item is
 * filtered through the Permission Engine, so pure requesters see no Queue, non-sysadmins
 * see no Administration group, etc. — never a role-name check in this component.
 *
 * COLLAPSIBLE (desktop only): `collapsed` shrinks it to a 64px icon rail — labels, group headings
 * and the footer are hidden, and each item keeps an accessible name via `aria-label`/`title` so a
 * screen-reader or hover still reads the destination. The mobile drawer never passes `collapsed`;
 * a drawer that is already an overlay has nothing to gain from collapsing. State + persistence live
 * in AuthenticatedLayout so the choice survives navigation.
 */
export function Sidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
} = {}) {
  const { can } = usePermissions();

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => can(item.permission)),
  })).filter((group) => group.items.length > 0);

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-base ease-standard motion-reduce:transition-none',
        collapsed ? 'w-16' : 'w-64',
      )}
      aria-label="Primary"
    >
      <div className={cn('flex h-14 items-center border-b border-border', collapsed ? 'justify-center px-2' : 'gap-2 px-4')}>
        {/* 32px (h-4 w-4 on the remapped 8-point scale) — see the header note; `h-8 w-8` computes
            to 64px here and overflows the 56px band. */}
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-primary text-primary-on">
          <Building2 size={18} aria-hidden />
        </span>
        {!collapsed && (
          <>
            <span className="text-body-medium leading-tight text-text">
              Ticketing
              <span className="block text-caption font-normal text-text-muted">Workflow System</span>
            </span>
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="btn-quiet ml-auto px-2"
              >
                <PanelLeftClose size={18} aria-hidden />
              </button>
            )}
          </>
        )}
      </div>

      {/* When collapsed, the expand control sits on its own row so the icon rail stays uncluttered. */}
      {collapsed && onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          className="btn-quiet mx-auto mt-2 px-2"
        >
          <PanelLeftOpen size={18} aria-hidden />
        </button>
      )}

      <nav className={cn('flex-1 overflow-y-auto py-3', collapsed ? 'px-2' : 'px-2')} aria-label="Sections">
        {groups.map((group) => (
          <div key={group.id} className="mb-4 last:mb-0">
            {collapsed
              ? <div className="mx-2 mb-1 border-t border-border first:border-t-0" aria-hidden />
              : <p className="px-3 pb-1 text-overline uppercase text-text-muted">{group.label}</p>}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <NavLink
                      to={item.path}
                      onClick={onNavigate}
                      {...(collapsed ? { 'aria-label': item.label, title: item.label } : {})}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex items-center rounded-md py-2 text-body transition-colors duration-fast ease-standard',
                          collapsed ? 'justify-center px-2' : 'gap-2.5 px-3',
                          isActive
                            ? collapsed
                              ? 'bg-selected-bg text-text'
                              : 'border-l-2 border-selected-border bg-selected-bg pl-[10px] text-text'
                            : 'text-text-secondary hover:bg-surface-sunken hover:text-text',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {/*
                            The icon carries the state change, not the row. Nudging the whole row
                            on hover would shift the label a keyboard user is reading; a 16px icon
                            moving 1px is felt rather than watched. `motion-reduce` removes it.
                          */}
                          <Icon
                            size={18}
                            aria-hidden
                            className={cn(
                              'shrink-0 transition-transform duration-fast ease-standard motion-reduce:transform-none',
                              !isActive && !collapsed && 'group-hover:translate-x-0.5',
                            )}
                          />
                          {!collapsed && <span>{item.label}</span>}
                        </>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="border-t border-border px-4 py-3 text-caption text-text-muted">
          {/* Honest about the running data source — the label read "localStorage only" even when
              VITE_API_URL had the app talking to the real backend. It now tracks USE_API. */}
          {USE_API ? 'Live · API backend' : 'Prototype · localStorage only'}
          <span className="block">v{APP_VERSION}</span>
        </div>
      )}
    </aside>
  );
}
