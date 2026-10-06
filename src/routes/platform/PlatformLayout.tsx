import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, KeyboardEvent } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearPlatformKey, readPlatformKey } from '../../api/platform';
import { AUTH_EXPIRED_EVENT } from '../../api/http';
import { getOverview, listTenants } from '../../api/platformConsole';
import type { Tenant } from '../../api/platformConsole';
import { AdminThemeToggle } from '../../state/AdminTheme';
import { useAsync } from '../../state/useAsync';
import { useToast } from '../../state/ToastContext';
import { ADMIN_PRIMARY, INPUT_BOX } from '../../components/admin/kit';
import { DISPLAY, GLASS, cx } from '../../components/ui';
import { Building, Cash, Grid, History, Megaphone, Photo, Plus, Search, Sliders, Ticket } from '../../components/icons';
import { Avatar, StatusBadge } from './kit';

/**
 * Frame for the operator console. Auth is a shared key, not a staff account —
 * there is no restaurant yet when the first one is being created.
 *
 * Search lives in the frame because an operator's first move is almost always
 * "find that restaurant": it is one keystroke (`/`) from anywhere.
 */

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/platform', label: 'Overview', icon: Grid, end: true },
  { to: '/platform/restaurants', label: 'Restaurants', icon: Building },
  { to: '/platform/billing', label: 'Billing', icon: Cash },
  { to: '/platform/plans', label: 'Plans', icon: Ticket },
  { to: '/platform/photos', label: 'Dish photos', icon: Photo },
  { to: '/platform/feedback', label: 'Feedback', icon: Megaphone },
  { to: '/platform/activity', label: 'Activity', icon: History },
  { to: '/platform/settings', label: 'Settings', icon: Sliders },
];

export function PlatformLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const overview = useAsync(getOverview, [location.pathname]);

  const signOut = () => {
    clearPlatformKey();
    navigate('/platform/signin', { replace: true });
  };

  // The backend rejected the stored key as expired/invalid — same event `AuthContext`
  // watches for a staff token, handled here instead since the key isn't React state.
  useEffect(() => {
    function onExpired() {
      if (!readPlatformKey()) return;
      clearPlatformKey();
      toast('Your session has ended. Please sign in again.', '🔒');
      navigate('/platform/signin', { replace: true, state: { from: location.pathname } });
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [navigate, location.pathname, toast]);

  if (!readPlatformKey()) {
    return <Navigate to="/platform/signin" replace state={{ from: location.pathname }} />;
  }

  const overdue = overview.data?.overdueCount ?? 0;

  return (
    <div className="min-h-dvh bg-bg lg:bg-room">
      <div className="lg:grid lg:grid-cols-[244px_1fr]">
        {/* ── Sidebar, laptops and up ─────────────────────────────── */}
        <aside className="sticky top-0 hidden h-dvh flex-col border-r border-hairline bg-surface/40 px-3 py-5 lg:flex">
          <div className="px-3 pb-6">
            <div className={cx(DISPLAY, 'text-[26px]')}>Let’s Dine</div>
            <div className="mt-1 flex items-center gap-2 text-[12px] text-ink-4">
              Platform admin
              <span
                className="rounded-full bg-gold/20 px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.08em] text-gold-ink"
                title="Every restaurant, person and figure here is synthetic demo material."
              >
                Demo data
              </span>
            </div>
          </div>

          <nav className="flex flex-col gap-0.5" aria-label="Platform">
            {NAV.map((item) => (
              <SideLink key={item.to} item={item} badge={item.to === '/platform/billing' ? overdue : 0} />
            ))}
          </nav>

          <div className="mt-auto border-t border-hairline pt-4">
            <div className="px-3 pb-1">
              <div className="text-[13.5px] font-semibold">Operator session</div>
              <div className="text-[12px] text-ink-4">Signed in with the platform key</div>
            </div>
            <AdminThemeToggle className="mt-2 w-full justify-start" />
            <button
              type="button"
              onClick={signOut}
              className="mt-1 w-full rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-ink-3 transition-colors hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </aside>

        <div className="min-w-0">
          {/* ── Phone and tablet chrome ─────────────────────────── */}
          <header className={cx('sticky top-0 z-40 border-b border-hairline lg:hidden', GLASS)}>
            <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-[calc(10px+var(--safe-t))]">
              <div className="min-w-0">
                <div className={cx(DISPLAY, 'truncate text-[20px]')}>Let’s Dine</div>
                <div className="text-[11.5px] text-ink-4">Platform admin</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <AdminThemeToggle />
                <button type="button" onClick={signOut} className="text-[13px] font-semibold text-ink-3">
                  Sign out
                </button>
              </div>
            </div>
            <nav className="flex gap-1 overflow-x-auto no-scrollbar px-3 pb-2" aria-label="Platform">
              {NAV.map((item) => (
                <TabLink key={item.to} item={item} badge={item.to === '/platform/billing' ? overdue : 0} />
              ))}
            </nav>
          </header>

          <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6 lg:px-8 lg:pt-7">
            <div className="flex items-center gap-3">
              <GlobalSearch />
              <Link to="/platform/restaurants/new" className={cx(ADMIN_PRIMARY, 'shrink-0')}>
                <Plus size={16} />
                <span className="hidden sm:inline">Add restaurant</span>
                <span className="sm:hidden">Add</span>
              </Link>
            </div>
          </div>

          <main id="platform-main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

function SideLink({ item, badge }: { item: NavItem; badge: number }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cx(
          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-semibold transition-colors duration-150',
          isActive ? 'bg-surface-2 text-flame-3' : 'text-ink-3 hover:bg-surface/60 hover:text-ink-2',
        )
      }
    >
      <item.icon size={17} />
      {item.label}
      {badge > 0 && (
        <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-berry px-1.5 text-[11px] font-bold text-white tnum" aria-label={`${badge} overdue`}>
          {badge}
        </span>
      )}
    </NavLink>
  );
}

function TabLink({ item, badge }: { item: NavItem; badge: number }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cx(
          'inline-flex h-8.5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-semibold transition-move active:scale-95',
          isActive ? 'bg-flame text-white' : 'bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset',
        )
      }
    >
      <item.icon size={15} />
      {item.label}
      {badge > 0 && <span className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-berry px-1 text-[10.5px] font-bold text-white tnum">{badge}</span>}
    </NavLink>
  );
}

/* ── Search ────────────────────────────────────────────────────────── */

function GlobalSearch() {
  const navigate = useNavigate();
  const tenants = useAsync(listTenants, []);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const results = useMemo<Tenant[]>(() => {
    const needle = text.trim().toLowerCase();
    if (!needle) return [];
    return (tenants.data ?? [])
      .filter((t) => [t.name, t.slug, t.city, t.owner.name, t.owner.email].some((v) => v.toLowerCase().includes(needle)))
      .slice(0, 6);
  }, [text, tenants.data]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        input.current?.focus();
      }
    }
    function onDown(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, []);

  const go = (t: Tenant) => {
    setText('');
    setOpen(false);
    input.current?.blur();
    navigate(`/platform/restaurants/${t.id}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter' && results[cursor]) {
      e.preventDefault();
      go(results[cursor]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      input.current?.blur();
    }
  };

  const showList = open && text.trim().length > 0;

  return (
    <div ref={box} className="relative min-w-0 flex-1">
      <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4" />
      <input
        ref={input}
        role="combobox"
        aria-expanded={showList}
        aria-controls="platform-search-list"
        aria-label="Search restaurants and owners"
        className={cx(INPUT_BOX, 'h-10 pl-9 pr-10')}
        placeholder="Find a restaurant, owner or slug"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setCursor(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md bg-surface-3 px-1.5 py-0.5 text-[11px] font-semibold text-ink-3 sm:block">/</kbd>

      {showList && (
        <ul
          id="platform-search-list"
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-surface-2 p-1.5 shadow-deep ring-1 ring-hairline-strong ring-inset"
        >
          {results.length === 0 ? (
            <li className="px-3 py-4 text-center text-[13px] text-ink-3">No restaurant matches “{text.trim()}”.</li>
          ) : (
            results.map((t, i) => (
              <li key={t.id} role="option" aria-selected={i === cursor}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(t)}
                  className={cx('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-100', i === cursor && 'bg-surface-3')}
                >
                  <Avatar name={t.name} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{t.name}</span>
                    <span className="block truncate text-[12px] text-ink-3">
                      {t.city} · {t.owner.name}
                    </span>
                  </span>
                  <StatusBadge status={t.status} />
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
