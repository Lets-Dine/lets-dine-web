import { useEffect, createContext, useContext, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import {
  getMenu,
  isSessionOpen,
  joinTableSession,
  resolveQr,
  resumeDeliverySession,
  resumeFloorSession,
  startDeliverySession,
  startFloorSession,
  subscribeToSessionEnd,
} from '../api/diner';
import type { DeliverySessionResult, FloorSessionResult } from '../api/diner';
import { IS_LIVE_API } from '../api/http';
import { ApiError } from '../api/store';
import { buildRankContext } from '../domain/metrics';
import type { RankContext } from '../domain/metrics';
import type { Customer, DiningSession, DiningTable, Floor, Menu } from '../domain/types';
import { CartProvider } from '../state/CartContext';
import { SessionOrdersProvider } from '../state/SessionOrdersContext';
import { useAsync } from '../state/useAsync';
import { CartDock } from '../components/CartDock';
import { OrderDock } from '../components/OrderDock';
import { BTN_FLAME, CARD, DISPLAY, EYEBROW, INPUT, SHELL, cx } from '../components/ui';
import { Check } from '../components/icons';
import { BootScreen, ErrorScreen } from './Shell';

const TABLE_OCCUPIED_KEY = 'DINING_SESSION_TABLE_OCCUPIED';

/** How often the mock stand-in polls for a session it has no socket to push from. */
const SESSION_POLL_MS = 4000;

/** Which of the three ways a diner can land here — distinguishes `/r/:slug/t/:token` from `/r/:slug/f/:token`, since both carry a `:token` param. */
export type RestaurantEntryKind = 'table' | 'delivery' | 'floor';

interface RestaurantValue {
  menu: Menu;
  /** Null for a delivery session, and for a floor session — neither has a single table. */
  table: DiningTable | null;
  /** Set for a delivery session, upserted server-side by phone — null otherwise. */
  customer: Customer | null;
  /** §16b — set only for a floor session; the shared QR this visit started from. */
  floor: Floor | null;
  /**
   * Ready-to-display "where/who this is for": the table's name, the free-text
   * name the diner gave when opening the floor QR, or "Delivery". Every
   * screen that shows "where this is going" reads this rather than deriving
   * it itself from `table`/`floor`/`customer`.
   */
  identityLabel: string;
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

function identityLabelFor(table: DiningTable | null, floor: Floor | null, floorVisitorName: string | null): string {
  if (table) return table.name;
  if (floor) return floorVisitorName || floor.name;
  return 'Delivery';
}

interface Resolved {
  table: DiningTable | null;
  session: DiningSession;
  customer?: Customer | null;
  floor?: Floor | null;
}

export function RestaurantLayout({ kind }: { kind: RestaurantEntryKind }) {
  const { slug = '', token } = useParams();
  const isDelivery = kind === 'delivery';
  const isFloor = kind === 'floor';

  const [joined, setJoined] = useState<Awaited<ReturnType<typeof joinTableSession>> | null>(null);
  const [delivery, setDelivery] = useState<DeliverySessionResult | null>(null);
  const [floorSession, setFloorSession] = useState<FloorSessionResult | null>(null);
  const [endedAt, setEndedAt] = useState<string | null>(null);

  const qr = useAsync(() => (kind === 'table' ? resolveQr(slug, token ?? '') : Promise.resolve(null)), [slug, token, kind]);
  const deliveryResume = useAsync(
    () => (isDelivery ? resumeDeliverySession(slug) : Promise.resolve(null)),
    [slug, isDelivery],
  );
  const floorResume = useAsync(
    () => (isFloor ? resumeFloorSession(slug, token ?? '') : Promise.resolve(null)),
    [slug, token, isFloor],
  );
  const menu = useAsync(() => getMenu(slug), [slug]);

  const resolved: Resolved | null = isDelivery
    ? (delivery ?? deliveryResume.data ?? null)
    : isFloor
      ? (floorSession ?? floorResume.data ?? null)
      : (joined ?? qr.data ?? null);

  const value = useMemo<RestaurantValue | null>(() => {
    if (!resolved || !menu.data) return null;
    const table = resolved.table;
    const floor = resolved.floor ?? null;
    const session = endedAt ? { ...resolved.session, endedAt } : resolved.session;
    return {
      menu: menu.data,
      table,
      customer: resolved.customer ?? null,
      floor,
      identityLabel: identityLabelFor(table, floor, session.floorVisitorName),
      session,
      ctx: buildRankContext(menu.data.dishes),
      base: isDelivery ? `/r/${slug}/delivery` : isFloor ? `/r/${slug}/f/${token}` : `/r/${slug}/t/${token}`,
      reload: menu.reload,
    };
  }, [resolved, menu.data, slug, token, menu.reload, endedAt, isDelivery, isFloor]);

  /**
   * §22/§38 — a table closed out mid-visit (staff clearing it, or a payment
   * settling it) has to reach every screen the diner might be on, not just
   * whichever one they happen to be looking at, so this lives here, above
   * every route, rather than on the order-status screen alone. Applies to a
   * delivery session too — staff can end one the same way.
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

  const occupied = !isDelivery && !joined && qr.error instanceof ApiError && qr.error.key === TABLE_OCCUPIED_KEY;
  if (occupied) {
    return <OccupiedTableScreen onJoined={setJoined} restaurantSlug={slug} tableToken={token ?? ''} />;
  }

  // Delivery has no QR/table to auto-resolve — ask for a phone number once
  // neither a resumed session nor a just-started one is already in hand.
  if (isDelivery && !resolved) {
    if (deliveryResume.loading) return <BootScreen />;
    if (deliveryResume.error) {
      return <ErrorScreen title="We couldn't open delivery ordering" message={deliveryResume.error.message} />;
    }
    return <DeliveryEntryScreen restaurantSlug={slug} onStarted={setDelivery} />;
  }

  // A floor session has no table of its own — once a scan isn't resumed, ask
  // for a name before anything else renders.
  if (isFloor && !resolved) {
    if (floorResume.loading) return <BootScreen />;
    if (floorResume.error) {
      return <ErrorScreen title="We couldn't open this floor" message={floorResume.error.message} />;
    }
    return <FloorEntryScreen restaurantSlug={slug} floorToken={token ?? ''} onStarted={setFloorSession} />;
  }

  const error = isDelivery
    ? menu.error
    : isFloor
      ? menu.error
      : joined
        ? menu.error
        : (qr.error ?? menu.error);
  if (error) {
    return (
      <ErrorScreen
        title={isDelivery ? "We couldn't load the menu" : isFloor ? "We couldn't open this floor" : "We couldn't open this table"}
        message={error.message}
      />
    );
  }
  if (!value) return <BootScreen />;

  const sessionEnded = Boolean(value.session.endedAt);

  return (
    <RestaurantContext.Provider value={value}>
      <CartProvider sessionId={value.session.id}>
        <SessionOrdersProvider session={value.session} base={value.base}>
          {sessionEnded && <SessionEndedBanner isDelivery={isDelivery} />}
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
 * rather than an error tone: the table (or delivery order) closing out is the
 * meal ending well, not something going wrong.
 */
function SessionEndedBanner({ isDelivery }: { isDelivery: boolean }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-hairline bg-mint/10 px-4 py-3 text-center sm:px-6">
      <span className="mx-auto flex max-w-[620px] items-center gap-2.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-mint/20 text-mint" aria-hidden>
          <Check size={13} />
        </span>
        <span className="text-[13px] font-semibold leading-snug text-ink-2">
          {isDelivery
            ? "This order has been closed out — thanks for ordering with us. New orders can't be placed on it, but you can still view what you ordered and rate it."
            : "This visit has been closed out — thanks for dining with us. New orders can't be placed, but you can still view what you ordered and rate it."}
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

/**
 * §16b — a floor QR has no single table to seat, so the first thing a floor
 * session does is ask who/where this order is for: a room/cabin name, or just
 * a person's own name. Typed once per visit (the session remembers it, and
 * this device's stored token resumes the same visit on a reload), not
 * re-asked per order.
 */
function FloorEntryScreen({
  restaurantSlug,
  floorToken,
  onStarted,
}: {
  restaurantSlug: string;
  floorToken: string;
  onStarted: (result: FloorSessionResult) => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      onStarted(await startFloorSession(restaurantSlug, floorToken, name.trim()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start your order.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className={cx(SHELL, 'grid place-content-center px-5 py-10')}>
      <form className={cx(CARD, 'mx-auto grid w-full max-w-md gap-5 p-6 sm:p-8')} onSubmit={submit}>
        <div className="grid gap-2">
          <p className={cx(EYEBROW, 'text-flame-1')}>Order for this floor</p>
          <h1 className={cx(DISPLAY, 'text-3xl')}>Who's this order for?</h1>
          <p className="text-[14.5px] leading-relaxed text-ink-3">
            A room/cabin name or your own name — whatever tells the kitchen where to send it.
          </p>
        </div>
        <label className="grid gap-2 text-[13px] font-semibold text-ink-2">
          Name
          <input
            className={cx(INPUT, 'h-13')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Cabin A, Reception, or your name"
            autoComplete="off"
            required
          />
        </label>
        {error && <p className="text-[13.5px] text-flame-1">{error}</p>}
        <button className={BTN_FLAME} type="submit" disabled={submitting || !name.trim()}>
          {submitting ? 'Starting…' : 'Start my order'}
        </button>
      </form>
    </main>
  );
}

/**
 * The delivery equivalent of scanning a table's QR code — just a phone
 * number (name is a convenience for the kitchen, not an identity check).
 * The delivery address itself is collected at checkout, not here, since it
 * is editable per order (`Checkout.tsx`) rather than tied to the session.
 */
function DeliveryEntryScreen({
  restaurantSlug,
  onStarted,
}: {
  restaurantSlug: string;
  onStarted: (result: DeliverySessionResult) => void;
}) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      onStarted(
        await startDeliverySession({
          restaurantSlug,
          phone: phone.trim(),
          name: name.trim() || undefined,
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start your order.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className={cx(SHELL, 'grid place-content-center px-5 py-10')}>
      <form className={cx(CARD, 'mx-auto grid w-full max-w-md gap-5 p-6 sm:p-8')} onSubmit={submit}>
        <div className="grid gap-2">
          <p className={cx(EYEBROW, 'text-flame-1')}>Order for delivery</p>
          <h1 className={cx(DISPLAY, 'text-3xl')}>What's your number?</h1>
          <p className="text-[14.5px] leading-relaxed text-ink-3">
            We'll text you when your order is on its way. A returning number picks up your saved details.
          </p>
        </div>
        <label className="grid gap-2 text-[13px] font-semibold text-ink-2">
          Phone number
          <input
            className={cx(INPUT, 'h-13')}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="98XXXXXXXX"
            inputMode="tel"
            autoComplete="tel"
            required
          />
        </label>
        <label className="grid gap-2 text-[13px] font-semibold text-ink-2">
          Name <span className="font-normal normal-case text-ink-4">(optional)</span>
          <input
            className={cx(INPUT, 'h-13')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="So the kitchen knows who this is for"
            autoComplete="name"
          />
        </label>
        {error && <p className="text-[13.5px] text-flame-1">{error}</p>}
        <button className={BTN_FLAME} type="submit" disabled={submitting || !phone.trim()}>
          {submitting ? 'Starting…' : 'Start my order'}
        </button>
      </form>
    </main>
  );
}
