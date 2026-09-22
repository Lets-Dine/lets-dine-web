import { useEffect, createContext, useContext, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { getMenu, isSessionOpen, joinTableSession, resolveQr, subscribeToSessionEnd } from '../api/diner';
import { IS_LIVE_API } from '../api/http';
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
import { Check } from '../components/icons';
import { BootScreen, ErrorScreen } from './Shell';

const TABLE_OCCUPIED_KEY = 'DINING_SESSION_TABLE_OCCUPIED';

/** How often the mock stand-in polls for a session it has no socket to push from. */
const SESSION_POLL_MS = 4000;

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
  const [endedAt, setEndedAt] = useState<string | null>(null);

  const qr = useAsync(() => resolveQr(slug, token), [slug, token]);
  const menu = useAsync(() => getMenu(slug), [slug]);
  const resolved = joined ?? qr.data;

  const value = useMemo<RestaurantValue | null>(() => {
    if (!resolved || !menu.data) return null;
    return {
      menu: menu.data,
      table: resolved.table,
      session: endedAt ? { ...resolved.session, endedAt } : resolved.session,
      ctx: buildRankContext(menu.data.dishes),
      base: `/r/${slug}/t/${token}`,
      reload: menu.reload,
    };
  }, [resolved, menu.data, slug, token, menu.reload, endedAt]);

  /**
   * §22/§38 — a table closed out mid-visit (staff clearing it, or a payment
   * settling it) has to reach every screen the diner might be on, not just
   * whichever one they happen to be looking at, so this lives here, above
   * every route, rather than on the order-status screen alone.
   */
  useEffect(() => {
    if (!resolved || resolved.session.endedAt) return;
    const onEnded = () => setEndedAt(new Date().toISOString());

    if (IS_LIVE_API) return subscribeToSessionEnd(resolved.session, onEnded);

    const timer = setInterval(() => {
      void isSessionOpen(resolved.session).then((open) => {
        if (!open) onEnded();
      });
    }, SESSION_POLL_MS);
    return () => clearInterval(timer);
  }, [resolved]);

  const occupied = !joined && qr.error instanceof ApiError && qr.error.key === TABLE_OCCUPIED_KEY;
  if (occupied) {
    return <OccupiedTableScreen onJoined={setJoined} restaurantSlug={slug} tableToken={token} />;
  }

  const error = joined ? menu.error : qr.error ?? menu.error;
  if (error) return <ErrorScreen title="We couldn't open this table" message={error.message} />;
  if (!value) return <BootScreen />;

  const sessionEnded = Boolean(value.session.endedAt);

  return (
    <RestaurantContext.Provider value={value}>
      <CartProvider sessionId={value.session.id}>
        <SessionOrdersProvider session={value.session} base={value.base}>
          {sessionEnded && <SessionEndedBanner />}
          <Outlet />
          <CartDock dishes={value.menu.dishes} base={value.base} hidden={sessionEnded} />
          <OrderDock base={value.base} />
        </SessionOrdersProvider>
      </CartProvider>
    </RestaurantContext.Provider>
  );
}

/**
 * Persistent, not dismissible — it says something true for the rest of the
 * visit, not a toast that would be right to let someone swipe away. Mint
 * rather than an error tone: the table closing out is the meal ending well,
 * not something going wrong.
 */
function SessionEndedBanner() {
  return (
    <div className="flex items-center gap-2.5 border-b border-hairline bg-mint/10 px-4 py-3 text-center sm:px-6">
      <span className="mx-auto flex max-w-[620px] items-center gap-2.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-mint/20 text-mint" aria-hidden>
          <Check size={13} />
        </span>
        <span className="text-[13px] font-semibold leading-snug text-ink-2">
          This table has been closed out — thanks for dining with us. New orders can't be placed, but you can still
          view what you ordered and rate it.
        </span>
      </span>
    </div>
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
