import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { adminMenu, listQueue, subscribeToQueue } from '../../api/staff';
import { IS_LIVE_API } from '../../api/http';
import { ROLE_LABEL } from '../../domain/permissions';
import type { Permission } from '../../domain/permissions';
import type { Menu, Order } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { Loading } from '../../components/admin/kit';
import { DISPLAY, GLASS, cx } from '../../components/ui';

/**
 * The dashboard frame. Navigation is filtered by role rather than disabled by
 * it — a server has no use for a Settings tab they cannot open (§50).
 *
 * The order queue lives here rather than on the Orders screen, because two
 * screens need it: the queue itself, and the count of tickets waiting, which
 * has to stay visible from wherever in the dashboard someone happens to be.
 */

interface DashboardValue {
  menu: Menu;
  orders: Order[];
  reloadOrders: () => void;
  reloadMenu: () => void;
}

const DashboardContext = createContext<DashboardValue | null>(null);

export function useDashboard(): DashboardValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used inside AdminLayout');
  return ctx;
}

interface NavItem {
  to: string;
  label: string;
  emoji: string;
  permission: Permission;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/admin', label: 'Dashboard', emoji: '📊', permission: 'orders:view', end: true },
  { to: '/admin/orders', label: 'Orders', emoji: '🧾', permission: 'orders:view' },
  { to: '/admin/menu', label: 'Menu', emoji: '🍽️', permission: 'menu:view' },
  { to: '/admin/categories', label: 'Categories', emoji: '🗂️', permission: 'menu:edit' },
  { to: '/admin/tables', label: 'Tables', emoji: '🪑', permission: 'tables:view' },
  { to: '/admin/reviews', label: 'Reviews', emoji: '⭐', permission: 'reviews:view' },
  { to: '/admin/analytics', label: 'Analytics', emoji: '📈', permission: 'analytics:view' },
  { to: '/admin/settings', label: 'Settings', emoji: '⚙️', permission: 'settings:view' },
];

/** How often the queue re-reads itself. A pass cannot wait a minute for a ticket. */
const POLL_MS = 8000;

export function AdminLayout() {
  const { staff, allows, signOut } = useAuth();
  const location = useLocation();

  if (!staff) return <Navigate to="/admin/signin" replace state={{ from: location.pathname }} />;
  return <SignedIn key={staff.id} allows={allows} signOut={signOut} />;
}

function SignedIn({ allows, signOut }: { allows: (p: Permission) => boolean; signOut: () => void }) {
  const staff = useStaff();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reloadMenu = useCallback(() => {
    adminMenu(staff)
      .then((next) => alive.current && setMenu(next))
      .catch((e: Error) => alive.current && setError(e.message));
  }, [staff]);

  const reloadOrders = useCallback(() => {
    listQueue(staff)
      .then((next) => alive.current && setOrders(next))
      .catch((e: Error) => alive.current && setError(e.message));
  }, [staff]);

  /** A brand-new ticket the queue hasn't seen yet — appended rather than replacing the list. */
  const applyCreated = useCallback((created: Order) => {
    if (!alive.current) return;
    setOrders((prev) => {
      if (!prev) return [created];
      return prev.some((o) => o.id === created.id) ? prev.map((o) => (o.id === created.id ? created : o)) : [created, ...prev];
    });
  }, []);

  const applyUpdated = useCallback((updated: Order) => {
    if (!alive.current) return;
    setOrders((prev) => (prev ? prev.map((o) => (o.id === updated.id ? updated : o)) : prev));
  }, []);

  // §38 — live, the pass gets pushed every new ticket and status change over a
  // socket instead of re-fetching the whole queue every few seconds. The mock
  // has no server to push from, so it keeps polling; `subscribeToQueue` is a
  // no-op there and this falls through.
  useEffect(() => {
    reloadMenu();
    reloadOrders();
    if (IS_LIVE_API) {
      return subscribeToQueue(applyCreated, applyUpdated, reloadOrders);
    }
    const timer = setInterval(reloadOrders, POLL_MS);
    return () => clearInterval(timer);
  }, [reloadMenu, reloadOrders, applyCreated, applyUpdated]);

  const waiting = useMemo(() => (orders ?? []).filter((o) => o.status === 'PENDING').length, [orders]);

  const dashboard = useMemo<DashboardValue | null>(
    () => (menu && orders ? { menu, orders, reloadOrders, reloadMenu } : null),
    [menu, orders, reloadOrders, reloadMenu],
  );

  const items = NAV.filter((item) => allows(item.permission));

  return (
    <div className="min-h-dvh bg-bg lg:bg-room">
      <div className="lg:grid lg:grid-cols-[244px_1fr]">
        {/* ── Sidebar, laptops and up ─────────────────────────────── */}
        <aside className="sticky top-0 hidden h-dvh flex-col border-r border-hairline bg-surface/40 px-3 py-5 lg:flex">
          <div className="px-3 pb-5">
            <div className={cx(DISPLAY, 'text-[19px]')}>{menu?.restaurant.name ?? 'Loading…'}</div>
            <div className="mt-0.5 text-[12px] text-ink-4">Restaurant dashboard</div>
          </div>

          <nav className="flex flex-col gap-0.5">
            {items.map((item) => (
              <SideLink key={item.to} item={item} badge={item.to === '/admin/orders' ? waiting : 0} />
            ))}
          </nav>

          <div className="mt-auto border-t border-hairline pt-4">
            <div className="px-3">
              <div className="truncate text-[13.5px] font-semibold">{staff.name}</div>
              <div className="text-[12px] text-ink-4">{ROLE_LABEL[staff.role]}</div>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="mt-2 w-full rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-ink-3 transition-colors hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </aside>

        {/* ── Phone and tablet chrome ─────────────────────────────── */}
        <div className="min-w-0">
          <header className={cx('sticky top-0 z-40 border-b border-hairline lg:hidden', GLASS)}>
            <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-[calc(10px+var(--safe-t))]">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold tracking-tight">
                  {menu?.restaurant.name ?? 'Dashboard'}
                </div>
                <div className="text-[11.5px] text-ink-4">
                  {staff.name} · {ROLE_LABEL[staff.role]}
                </div>
              </div>
              <button type="button" onClick={signOut} className="shrink-0 text-[13px] font-semibold text-ink-3">
                Sign out
              </button>
            </div>
            <nav className="flex gap-1 overflow-x-auto no-scrollbar px-3 pb-2">
              {items.map((item) => (
                <TabLink key={item.to} item={item} badge={item.to === '/admin/orders' ? waiting : 0} />
              ))}
            </nav>
          </header>

          <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
            {error && !dashboard ? (
              <p className="rounded-2xl bg-berry/10 px-4 py-3 text-[14px] text-berry ring-1 ring-berry/25 ring-inset">
                {error}
              </p>
            ) : dashboard ? (
              <DashboardContext.Provider value={dashboard}>
                <Outlet />
              </DashboardContext.Provider>
            ) : (
              <Loading label="Opening the dashboard…" />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function Badge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-flame px-1.5 text-[11px] font-bold text-ember tnum">
      {count}
    </span>
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
          isActive ? 'bg-surface-2 text-ink' : 'text-ink-3 hover:bg-surface/60 hover:text-ink-2',
        )
      }
    >
      <span aria-hidden>{item.emoji}</span>
      {item.label}
      <Badge count={badge} />
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
          isActive ? 'bg-flame text-ember' : 'bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset',
        )
      }
    >
      <span aria-hidden>{item.emoji}</span>
      {item.label}
      {badge > 0 && (
        <span className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-bg/35 px-1 text-[10.5px] font-bold tnum">
          {badge}
        </span>
      )}
    </NavLink>
  );
}
