import { createContext, useContext, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { getMenu, joinTableSession, resolveQr } from '../api/diner';
import { ApiError } from '../api/store';
import { buildRankContext } from '../domain/metrics';
import type { RankContext } from '../domain/metrics';
import type { DiningSession, DiningTable, Menu } from '../domain/types';
import { CartProvider } from '../state/CartContext';
import { SessionOrdersProvider } from '../state/SessionOrdersContext';
import { useAsync } from '../state/useAsync';
import { CartDock } from '../components/CartDock';
import { OrderDock } from '../components/OrderDock';
import { BTN_FLAME, CARD, DISPLAY, INPUT, SHELL, cx } from '../components/ui';
import { BootScreen, ErrorScreen } from './Shell';

const TABLE_OCCUPIED_KEY = 'DINING_SESSION_TABLE_OCCUPIED';

interface RestaurantValue {
  menu: Menu;
  table: DiningTable;
  session: DiningSession;
  ctx: RankContext;
  base: string;
  reload: () => void;
}

const RestaurantContext = createContext<RestaurantValue | null>(null);

export function useRestaurant(): RestaurantValue {
  const ctx = useContext(RestaurantContext);
  if (!ctx) throw new Error('useRestaurant must be used inside RestaurantLayout');
  return ctx;
}

export function RestaurantLayout() {
  const { slug = '', token = '' } = useParams();
  const [joined, setJoined] = useState<Awaited<ReturnType<typeof joinTableSession>> | null>(null);

  const qr = useAsync(() => resolveQr(slug, token), [slug, token]);
  const menu = useAsync(() => getMenu(slug), [slug]);
  const resolved = joined ?? qr.data;

  const value = useMemo<RestaurantValue | null>(() => {
    if (!resolved || !menu.data) return null;
    return {
      menu: menu.data,
      table: resolved.table,
      session: resolved.session,
      ctx: buildRankContext(menu.data.dishes),
      base: `/r/${slug}/t/${token}`,
      reload: menu.reload,
    };
  }, [resolved, menu.data, slug, token, menu.reload]);

  const occupied = !joined && qr.error instanceof ApiError && qr.error.key === TABLE_OCCUPIED_KEY;
  if (occupied) {
    return <OccupiedTableScreen onJoined={setJoined} restaurantSlug={slug} tableToken={token} />;
  }

  const error = joined ? menu.error : qr.error ?? menu.error;
  if (error) return <ErrorScreen title="We couldn't open this table" message={error.message} />;
  if (!value) return <BootScreen />;

  return (
    <RestaurantContext.Provider value={value}>
      <CartProvider sessionId={value.session.id}>
        <SessionOrdersProvider session={value.session} base={value.base}>
          <Outlet />
          <CartDock dishes={value.menu.dishes} base={value.base} />
          <OrderDock base={value.base} />
        </SessionOrdersProvider>
      </CartProvider>
    </RestaurantContext.Provider>
  );
}

function OccupiedTableScreen({
  restaurantSlug,
  tableToken,
  onJoined,
}: {
  restaurantSlug: string;
  tableToken: string;
  onJoined: (resolved: Awaited<ReturnType<typeof joinTableSession>>) => void;
}) {
  const [sessionCode, setSessionCode] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setJoining(true);
    setError('');
    try {
      onJoined(await joinTableSession(restaurantSlug, tableToken, sessionCode.trim()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not join this table.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <main className={cx(SHELL, 'grid place-content-center px-5 py-10')}>
      <form className={cx(CARD, 'mx-auto grid w-full max-w-md gap-5 p-6 sm:p-8')} onSubmit={submit}>
        <div className="grid gap-2">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-flame-1">Table occupied</p>
          <h1 className={cx(DISPLAY, 'text-3xl')}>Someone is already dining here</h1>
          <p className="text-[14.5px] leading-relaxed text-ink-3">
            If you are with the same group, ask a friend at the table for their session code.
          </p>
        </div>
        <label className="grid gap-2 text-[13px] font-semibold text-ink-2">
          Session code
          <input
            className={cx(INPUT, 'h-13')}
            value={sessionCode}
            onChange={(event) => setSessionCode(event.target.value)}
            placeholder="Enter the 8-digit code"
            inputMode="numeric"
            autoComplete="off"
            required
          />
        </label>
        {error && <p className="text-[13.5px] text-flame-1">{error}</p>}
        <button className={BTN_FLAME} type="submit" disabled={joining || !sessionCode.trim()}>
          {joining ? 'Joining…' : 'Join this table'}
        </button>
      </form>
    </main>
  );
}
