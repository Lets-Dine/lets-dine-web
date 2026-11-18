import { useEffect, createContext, useContext, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import {
  getRestaurant,
  getMenu,
  isSessionOpen,
  joinTableSession,
  openFloorSession,
  resolveQr,
  resumeDeliverySession,
  subscribeToSessionEnd,
} from '../api/diner';
import type { DeliverySessionResult, FloorSessionResult } from '../api/diner';
import { IS_LIVE_API } from '../api/http';
import { ApiError } from '../api/store';
import { buildRankContext } from '../domain/metrics';
import type { RankContext } from '../domain/metrics';
import type { Customer, DiningSession, DiningTable, Floor, Menu } from '../domain/types';
import { CartProvider } from '../state/CartContext';
import { GuestOrdersProvider, SessionOrdersProvider } from '../state/SessionOrdersContext';
import { useAsync } from '../state/useAsync';
import { useDinerIdentity } from '../state/useDinerIdentity';
import type { DinerIdentity } from '../state/useDinerIdentity';
import { CartDock } from '../components/CartDock';
import { OwnerPitch, UnclaimedBanner } from '../components/OwnerPitch';
import { OrderDock } from '../components/OrderDock';
import { BTN_FLAME, CARD, DISPLAY, INPUT, SHELL, cx } from '../components/ui';
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
   * Ready-to-display "where/who this is for": the table's name, the identity
   * captured for a floor order, or "Delivery". Every screen that shows
   * "where this is going" reads this rather than deriving it itself from
   * `table`/`floor`/`customer`.
   */
  identityLabel: string;
  /** §16b — dine-in only (table or floor): the diner's own name + phone, captured at checkout and remembered on this device. */
  dinerIdentity: DinerIdentity | null;
  setDinerIdentity: (identity: DinerIdentity) => void;
  /**
   * §16b — floor orders only: which cabin/room/spot within the floor this
   * order should be brought to, captured at checkout. Separate from
   * `dinerIdentity` — it's where the order goes, not who it's for — and
   * remembered only for the rest of this visit, not across devices/visits.
   * A table order has no equivalent: the table itself is already the place.
   */
  floorPlace: string;
  setFloorPlace: (place: string) => void;
  session: DiningSession;
  /** A phone-number visit with no phone number yet: browsing and carting as a guest, with the visit opened at checkout. */
  guest: boolean;
  /** Hands the layout the visit checkout just opened, so the order screen follows it. */
  openVisit: (visit: DeliverySessionResult) => void;
  /** Delivery is switched off: the menu is visible but nothing can be added or ordered. */
  browseOnly: boolean;
  /** Delivery runs through WhatsApp: a cart, but no session — the order leaves as a message. */
  whatsapp: boolean;
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

function identityLabelFor(
  table: DiningTable | null,
  floor: Floor | null,
  floorVisitorName: string | null,
  dinerIdentity: DinerIdentity | null,
  phoneLabel = 'Delivery',
): string {
  if (table) return table.name;
  if (floor) return dinerIdentity?.name || floorVisitorName || floor.name;
  return phoneLabel;
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
  /** Delivery and pick-up share one entry: a phone number opens the visit, and the customer chooses at checkout. */
  const phoneVisit = isDelivery;
  const isFloor = kind === 'floor';

  const [joined, setJoined] = useState<Awaited<ReturnType<typeof joinTableSession>> | null>(null);
  const [delivery, setDelivery] = useState<DeliverySessionResult | null>(null);
  const [endedAt, setEndedAt] = useState<string | null>(null);
  const [dinerIdentity, setDinerIdentity] = useDinerIdentity();
  const [floorPlace, setFloorPlace] = useState('');

  const qr = useAsync(() => (kind === 'table' ? resolveQr(slug, token ?? '') : Promise.resolve(null)), [slug, token, kind]);
  // A restaurant that has switched delivery off still shows its menu, just without a way to order.
  const deliveryInfo = useAsync(() => (phoneVisit ? getRestaurant(slug) : Promise.resolve(null)), [slug, phoneVisit]);
  // Browse-only when neither way of getting the food is on. WhatsApp ordering only applies when pick-up is off: with it on the
  // customer needs a real visit to place a pick-up, and delivery is then offered only if it takes orders in the app.
  const browseOnly = isDelivery && deliveryInfo.data?.deliveryEnabled === false && deliveryInfo.data?.pickupEnabled !== true;
  const whatsapp = isDelivery && !browseOnly && deliveryInfo.data?.deliveryChannel === 'WHATSAPP' && deliveryInfo.data?.pickupEnabled !== true;
  const sessionless = browseOnly || whatsapp;
  // What a phone-number visit is called until the order is finalised: the customer chooses delivery or pick-up at checkout.
  const offersDelivery = deliveryInfo.data?.deliveryEnabled !== false && deliveryInfo.data?.deliveryChannel !== 'WHATSAPP';
  const offersPickup = deliveryInfo.data?.pickupEnabled === true;
  const phoneLabel = offersPickup ? (offersDelivery ? 'Delivery or pick-up' : 'Pick up') : 'Delivery';
  const deliveryResume = useAsync(
    () => (phoneVisit && !deliveryInfo.loading && !sessionless ? resumeDeliverySession(slug) : Promise.resolve(null)),
    [slug, phoneVisit, deliveryInfo.loading, sessionless],
  );
  // §16b — no identity question to block on any more; resumes a session
  // already open on this device, or opens a fresh one straight away.
  const floorOpen = useAsync<FloorSessionResult | null>(
    () => (isFloor ? openFloorSession(slug, token ?? '') : Promise.resolve(null)),
    [slug, token, isFloor],
  );
  const browseSession: DiningSession | null = sessionless
    ? {
        id: whatsapp ? `whatsapp-${slug}` : 'browse',
        restaurantId: deliveryInfo.data?.id ?? '',
        tableId: null,
        anonymousSessionToken: '',
        startedAt: '',
        expiresAt: '',
        endedAt: null,
        customerId: null,
        floorId: null,
        floorVisitorName: null,
      }
    : null;
  // Delivery and pick-up: nothing is asked until the order is finalised. A customer with no visit open on this device browses as a
  // guest, and checkout is where their phone number opens the visit (`openVisit`).
  const guestSession: DiningSession | null =
    phoneVisit && !sessionless && !deliveryInfo.loading && !deliveryResume.loading && !deliveryResume.error && !delivery && !deliveryResume.data
      ? {
          id: `guest-${slug}`,
          restaurantId: deliveryInfo.data?.id ?? '',
          tableId: null,
          anonymousSessionToken: '',
          startedAt: '',
          expiresAt: '',
          endedAt: null,
          customerId: null,
          floorId: null,
          floorVisitorName: null,
        }
      : null;
  const guest = guestSession !== null;
  const resolved: Resolved | null = browseSession
    ? { table: null, session: browseSession }
    : phoneVisit
    ? (delivery ?? deliveryResume.data ?? (guestSession ? { table: null, session: guestSession } : null))
    : isFloor
      ? floorOpen.data
      : (joined ?? qr.data ?? null);

  // The menu is the session's branch's menu — its own prices and sold-out dishes — so live it waits for
  // the session to say which branch that is rather than flashing the shared menu first. The offline demo
  // has no branches and keeps loading in parallel.
  const sessionBranchId = resolved?.session.branchId;
  const sessionReady = Boolean(resolved);
  const menu = useAsync<Menu | null>(
    () => (IS_LIVE_API && !sessionReady ? Promise.resolve(null) : getMenu(slug, sessionBranchId)),
    [slug, sessionBranchId, sessionReady],
  );

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
      identityLabel: identityLabelFor(table, floor, session.floorVisitorName, dinerIdentity, phoneLabel),
      dinerIdentity,
      setDinerIdentity,
      floorPlace,
      setFloorPlace,
      session,
      guest,
      openVisit: setDelivery,
      browseOnly,
      whatsapp,
      ctx: buildRankContext(menu.data.dishes),
      base: isDelivery ? `/r/${slug}/delivery` : isFloor ? `/r/${slug}/f/${token}` : `/r/${slug}/t/${token}`,
      reload: menu.reload,
    };
  }, [
    resolved,
    browseOnly,
    whatsapp,
    menu.data,
    slug,
    token,
    menu.reload,
    endedAt,
    isDelivery,
    isFloor,
    dinerIdentity,
    setDinerIdentity,
    floorPlace,
    setFloorPlace,
    phoneLabel,
    guest,
  ]);

  /**
   * §22/§38 — a table closed out mid-visit (staff clearing it, or a payment
   * settling it) has to reach every screen the diner might be on, not just
   * whichever one they happen to be looking at, so this lives here, above
   * every route, rather than on the order-status screen alone. Applies to a
   * delivery session too — staff can end one the same way.
   */
  useEffect(() => {
    if (!resolved || sessionless || guest || resolved.session.endedAt) return;
    const onEnded = () => setEndedAt(new Date().toISOString());

    if (IS_LIVE_API) return subscribeToSessionEnd(resolved.session, onEnded);

    const timer = setInterval(() => {
      void isSessionOpen(resolved.session).then((open) => {
        if (!open) onEnded();
      });
    }, SESSION_POLL_MS);
    return () => clearInterval(timer);
  }, [resolved, sessionless, guest]);

  const occupied = !phoneVisit && !joined && qr.error instanceof ApiError && qr.error.key === TABLE_OCCUPIED_KEY;
  if (occupied) {
    return <OccupiedTableScreen onJoined={setJoined} restaurantSlug={slug} tableToken={token ?? ''} />;
  }

  // Delivery has no QR/table to auto-resolve: it resumes this device's open visit, or browses as a guest.
  if (phoneVisit && deliveryInfo.loading) return <BootScreen />;
  if (phoneVisit && !resolved) {
    if (deliveryResume.loading) return <BootScreen />;
    if (deliveryResume.error) {
      return <ErrorScreen title="We couldn't open ordering" message={deliveryResume.error.message} />;
    }
    return <BootScreen />;
  }

  const error = phoneVisit
    ? menu.error
    : isFloor
      ? (floorOpen.error ?? menu.error)
      : joined
        ? menu.error
        : (qr.error ?? menu.error);
  if (error) {
    return (
      <ErrorScreen
        title={phoneVisit ? "We couldn't load the menu" : isFloor ? "We couldn't open this floor" : "We couldn't open this table"}
        message={error.message}
      />
    );
  }
  if (!value) return <BootScreen />;

  const sessionEnded = Boolean(value.session.endedAt);

  if (guest) {
    return (
      <RestaurantContext.Provider value={value}>
        <CartProvider sessionId={value.session.id}>
          <GuestOrdersProvider>
            <OwnerPitch restaurantName={value.menu.restaurant.name} />
            <UnclaimedBanner restaurant={value.menu.restaurant} />
            <SessionlessOutlet base={value.base} allowCart allowCheckout />
            <CartDock dishes={value.menu.dishes} base={value.base} />
          </GuestOrdersProvider>
        </CartProvider>
      </RestaurantContext.Provider>
    );
  }

  if (sessionless) {
    return (
      <RestaurantContext.Provider value={value}>
        <CartProvider sessionId={value.session.id}>
          <OwnerPitch restaurantName={value.menu.restaurant.name} />
          <UnclaimedBanner restaurant={value.menu.restaurant} />
          <SessionlessOutlet base={value.base} allowCart={whatsapp} />
          {whatsapp && <CartDock dishes={value.menu.dishes} base={value.base} />}
        </CartProvider>
      </RestaurantContext.Provider>
    );
  }

  return (
    <RestaurantContext.Provider value={value}>
      <CartProvider sessionId={value.session.id}>
        <SessionOrdersProvider session={value.session} base={value.base}>
          <OwnerPitch restaurantName={value.menu.restaurant.name} />
          <UnclaimedBanner restaurant={value.menu.restaurant} />
          {sessionEnded && <SessionEndedBanner isDelivery={phoneVisit} />}
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

/** Menu and dish pages (plus the cart for WhatsApp) — checkout and order screens need a session. */
function SessionlessOutlet({ base, allowCart, allowCheckout = false }: { base: string; allowCart: boolean; allowCheckout?: boolean }) {
  const { pathname } = useLocation();
  const rest = pathname.slice(base.length);
  const allowed = rest === '' || rest === '/' || rest.startsWith('/d/') || (allowCart && rest === '/cart') || (allowCheckout && rest === '/checkout');
  if (!allowed) return <Navigate to={base} replace />;
  return <Outlet />;
}

