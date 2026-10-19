import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { createOrder } from '../api/diner';
import { ApiError } from '../api/store';
import { track } from '../domain/analytics';
import { formatMoney } from '../domain/money';
import { haptic } from '../platform/haptics';
import { BTN, BTN_FLAME, BTN_SIZE, DISPLAY, EYEBROW, GLASS, INPUT, SHELL, cx } from '../components/ui';
import { requestNotifyPermission } from '../platform/notify';
import { useCart } from '../state/CartContext';
import { useDeliveryPlace } from '../state/useDeliveryPlace';
import { usePageTitle } from '../state/usePageTitle';
import { useSessionOrders } from '../state/SessionOrdersContext';
import { useToast } from '../state/ToastContext';
import { MapPin } from '../components/icons';
import { placeName } from '../domain/location';
import { PinMap } from '../components/PinMap';
import type { LatLng } from '../domain/location';
import { BillLines, PAGE, SPLIT, addOnLabels, lineUnitPrice, useBill, variantLabel } from './Cart';
import { useRestaurant } from './RestaurantLayout';
import { TopBar } from './Shell';

/** The server's key for an order refused because the branch is closed or switched off. */
const BRANCH_CLOSED_KEY = 'ORDER_BRANCH_CLOSED';

export function Checkout() {
  const { menu, customer, floor, dinerIdentity, setDinerIdentity, floorPlace, setFloorPlace, identityLabel, session, base } =
    useRestaurant();
  // §22/§16b — `customer` is the one field exclusive to a delivery session (a floor
  // session also has a null `table`, so that alone can't be the delivery check).
  const isDelivery = customer !== null;
  const isFloor = floor !== null;
  // §16b — every dine-in order (table or floor) captures who it's for; only delivery
  // already has an identity, tied to the session by phone from the start.
  const isDineIn = !isDelivery;
  usePageTitle(`Checkout · ${menu.restaurant.name}`);
  const cart = useCart();
  const { orders: sessionOrders, rememberOrder } = useSessionOrders();
  const navigate = useNavigate();
  const toast = useToast();

  // The last delivery's address and pin live on this device, like the diner's own name and phone.
  const [lastPlace, rememberPlace] = useDeliveryPlace();
  const [address, setAddress] = useState(lastPlace?.address ?? customer?.defaultAddress ?? '');
  const [note, setNote] = useState(customer?.defaultNote ?? '');
  const [pin, setPin] = useState<LatLng | null>(lastPlace?.pin ?? null);
  // The pin as it was offered, so the note under the field can tell a remembered one from a fresh one.
  const [offeredPin] = useState(pin);
  const [locating, setLocating] = useState<'gps' | 'name' | null>(null);
  // What the box held when we filled it ourselves — so a second tap may replace it, but never what the diner typed.
  const autoFilled = useRef('');
  const addressRef = useRef(address);
  useEffect(() => {
    addressRef.current = address;
  }, [address]);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // §16b — a dine-in order's identity is captured here rather than up front; a
  // device that already has one defaults to it, with a way to change it.
  const [editingIdentity, setEditingIdentity] = useState(isDineIn && !dinerIdentity);
  const [identityName, setIdentityName] = useState(dinerIdentity?.name ?? '');
  const [identityPhone, setIdentityPhone] = useState(dinerIdentity?.phone ?? '');
  const sessionEnded = Boolean(session.endedAt);

  const byId = new Map(menu.dishes.map((d) => [d.id, d]));
  const deliveryFee = isDelivery ? (menu.restaurant.deliveryFeeAmount ?? 0) : 0;
  const bill = useBill(cart.lines, menu.dishes, deliveryFee);
  const currency = menu.restaurant.currency;
  // A table session is one party's visit: once its first order is placed, the rest stay under
  // the same customer and the identity can't be changed (the server enforces it too).
  const lockedOrder = isDineIn && !isFloor ? sessionOrders.find((o) => o.customerId) : undefined;
  const identityReady = !isDineIn || Boolean(lockedOrder) || (Boolean(dinerIdentity) && !editingIdentity);
  const placeReady = !isFloor || floorPlace.trim().length > 0;
  const canSubmit = !submitting && !sessionEnded && (!isDelivery || address.trim().length > 0) && identityReady && placeReady;

  // The exact spot is saved at once; the place name is a label looked up after, and optional. Only the
  // newest lookup may write the box, so dragging the pin around never lands an old name.
  const lookup = useRef(0);
  const adopt = async (here: LatLng) => {
    const mine = ++lookup.current;
    setPin(here);
    setLocating('name');
    const name = await placeName(here);
    if (mine !== lookup.current) return;
    // Decided here rather than inside a state updater: updaters can run twice, and this one writes a ref.
    const typed = addressRef.current.trim() !== '' && addressRef.current !== autoFilled.current;
    if (!typed) {
      autoFilled.current = name ?? 'Pinned location';
      setAddress(autoFilled.current);
    }
    setLocating(null);
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setLocateError("This device can't share its location. Type the address instead.");
      return;
    }
    setLocating('gps');
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        haptic.select();
        void adopt({ lat: coords.latitude, lng: coords.longitude });
      },
      (err) => {
        setLocating(null);
        setLocateError(
          err.code === err.PERMISSION_DENIED
            ? 'Location is blocked for this site. Allow it in your browser settings, or type the address.'
            : "Couldn't find your location. Try again, or type the address.",
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };

  const saveIdentity = (event: FormEvent) => {
    event.preventDefault();
    const name = identityName.trim();
    const phone = identityPhone.trim();
    if (!name || !phone) return;
    setDinerIdentity({ name, phone });
    setEditingIdentity(false);
  };

  // Emptying the cart on success must not trip this guard and bounce the diner
  // back to an empty cart instead of their new order.
  if (cart.lines.length === 0 && !placed) return <Navigate to={`${base}/cart`} replace />;

  const placeOrder = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const order = await createOrder({
        session,
        lines: cart.lines,
        // Stable across retries of this same cart, so a double tap or a flaky
        // connection can never produce two orders.
        idempotencyKey: cart.idempotencyKey,
        deliveryAddress: isDelivery ? address.trim() : undefined,
        deliveryLocation: isDelivery && pin ? pin : undefined,
        deliveryNote: isDelivery ? note.trim() || undefined : undefined,
        customer: isDineIn && !lockedOrder && dinerIdentity ? dinerIdentity : undefined,
        floorVisitorName: isFloor ? floorPlace.trim() : undefined,
      });
      if (isDelivery) rememberPlace({ address: address.trim(), pin });
      track('order_placed', { orderId: order.id, total: order.total, items: cart.count });
      setPlaced(true);
      cart.clear();
      cart.rotateIdempotencyKey();
      rememberOrder(order);
      requestNotifyPermission();
      haptic.success();
      toast('Order sent to the kitchen', '🔥');
      navigate(`${base}/order/${order.id}`, { replace: true });
    } catch (e) {
      haptic.warn();
      // The branch shut (or was switched off) after the diner opened the menu — say so plainly and keep the cart.
      setError(
        e instanceof ApiError && e.key === BRANCH_CLOSED_KEY
          ? 'This branch is closed right now, so it can\'t take your order. Your cart is saved — try again when it reopens.'
          : e instanceof Error
            ? e.message
            : 'Something went wrong. Try again.',
      );
      setSubmitting(false);
    }
  };

  return (
    <main className={SHELL}>
      <TopBar title="Confirm your order" subtitle={identityLabel} fallbackTo={`${base}/cart`} width={PAGE} />

      <div className={cx(PAGE, SPLIT, 'pt-5')}>
        <div className="flex flex-col gap-7">
          {isDelivery ? (
            <section className="animate-rise">
              <div className="flex flex-col gap-3 rounded-3xl bg-surface bg-flame-dim p-4.5 ring-1 ring-flame-2/35 ring-inset">
                <div className="flex flex-col gap-1">
                  <span className={cx(EYEBROW, 'text-flame-1/80')}>Delivering to</span>
                  <b className={cx(DISPLAY, 'text-[21px]')}>{customer?.name || 'Guest'}</b>
                  <span className="text-[13px] text-ink-3">
                    {menu.restaurant.name} · {customer?.phone} · delivery
                  </span>
                </div>
                <div className="grid gap-1.5 text-[13px] font-semibold text-ink-2">
                  <label htmlFor="delivery-address">Delivery address</label>
                  <div className="relative">
                    <input
                      id="delivery-address"
                      className={cx(INPUT, 'h-12 pr-14')}
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                      placeholder="Street, area, landmark"
                      autoComplete="street-address"
                      required
                    />
                    <button
                      type="button"
                      onClick={locate}
                      disabled={locating !== null}
                      aria-label={pin ? 'Update my location' : 'Use my current location'}
                      title={pin ? 'Update my location' : 'Use my current location'}
                      className={cx(
                        'absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full ring-1 ring-inset transition-move active:scale-90 disabled:cursor-progress disabled:opacity-70',
                        pin ? 'bg-flame-2/15 text-flame-1 ring-flame-2/40' : 'bg-surface-3 text-ink-2 ring-hairline',
                      )}
                    >
                      <MapPin size={17} className={cx(locating && 'motion-safe:animate-pulse')} />
                    </button>
                  </div>
                </div>
                <div className="-mt-1 flex flex-col gap-1.5">
                  <p role={locateError ? 'alert' : 'status'} className={cx('text-[12.5px] leading-snug empty:hidden', locateError ? 'text-berry-ink' : 'text-ink-3')}>
                    {locateError ??
                      (locating === 'gps'
                        ? 'Finding you…'
                        : locating === 'name'
                          ? 'Naming the place…'
                          : pin
                            ? pin === offeredPin
                              ? 'Using the location from your last order. Move the pin if you are somewhere else.'
                              : 'Your exact location is saved, so the rider gets a map pin. Add a landmark or floor in the box if it helps.'
                            : '')}
                  </p>
                  {pin && (
                    <figure className="mt-1 animate-rise overflow-hidden rounded-2xl ring-1 ring-hairline-strong ring-inset">
                      <PinMap value={pin} onChange={(next) => void adopt(next)} />
                      <figcaption className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink-2">
                        <span>Drag the pin, or tap the map, to put it on your door.</span>
                        <button type="button" onClick={() => { lookup.current++; setLocating(null); setPin(null); }} className="cursor-pointer font-semibold text-ink-3 underline-offset-2 hover:text-ink hover:underline">
                          Remove pin
                        </button>
                      </figcaption>
                    </figure>
                  )}
                </div>
                <label className="grid gap-1.5 text-[13px] font-semibold text-ink-2">
                  Note for the rider <span className="font-normal text-ink-4">(optional)</span>
                  <input
                    className={cx(INPUT, 'h-12')}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Gate code, floor, landmark…"
                  />
                </label>
              </div>
            </section>
          ) : (
            <section className="animate-rise">
              <div className="flex flex-col gap-3 rounded-3xl bg-surface bg-flame-dim p-4.5 ring-1 ring-flame-2/35 ring-inset">
                {lockedOrder ? (
                  <div className="flex flex-col gap-1">
                    <span className={cx(EYEBROW, 'text-flame-1/80')}>Serving to</span>
                    <b className={cx(DISPLAY, 'text-[21px]')}>{lockedOrder.customerName ?? dinerIdentity?.name ?? 'Your table'}</b>
                    <span className="text-[13px] text-ink-3">
                      {menu.restaurant.name} · {identityLabel}
                    </span>
                    <span className="mt-1 text-[12.5px] text-ink-3">Every order from this table visit stays under this name.</span>
                  </div>
                ) : editingIdentity ? (
                  <form className="flex flex-col gap-3" onSubmit={saveIdentity}>
                    <div className="flex flex-col gap-1">
                      <span className={cx(EYEBROW, 'text-flame-1/80')}>Who's this order for?</span>
                      <span className="text-[13px] text-ink-3">So we can recognise you next time you order.</span>
                    </div>
                    <label className="grid gap-1.5 text-[13px] font-semibold text-ink-2">
                      Name
                      <input
                        className={cx(INPUT, 'h-12')}
                        value={identityName}
                        onChange={(event) => setIdentityName(event.target.value)}
                        placeholder="Your name"
                        autoComplete="name"
                        required
                      />
                    </label>
                    <label className="grid gap-1.5 text-[13px] font-semibold text-ink-2">
                      Phone number
                      <input
                        className={cx(INPUT, 'h-12')}
                        value={identityPhone}
                        onChange={(event) => setIdentityPhone(event.target.value)}
                        placeholder="98XXXXXXXX"
                        inputMode="tel"
                        autoComplete="tel"
                        required
                      />
                    </label>
                    <div className="flex gap-2.5">
                      <button type="submit" className={cx(BTN, 'h-11 flex-1 bg-flame text-white')}>
                        {dinerIdentity ? 'Save' : 'Continue'}
                      </button>
                      {dinerIdentity && (
                        <button
                          type="button"
                          className={cx(BTN, 'h-11 flex-1 bg-surface-2 ring-1 ring-hairline ring-inset')}
                          onClick={() => {
                            setIdentityName(dinerIdentity.name);
                            setIdentityPhone(dinerIdentity.phone);
                            setEditingIdentity(false);
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col gap-1">
                    <span className={cx(EYEBROW, 'text-flame-1/80')}>Serving to</span>
                    <b className={cx(DISPLAY, 'text-[21px]')}>{dinerIdentity?.name}</b>
                    <span className="text-[13px] text-ink-3">
                      {menu.restaurant.name} · {dinerIdentity?.phone} · {isFloor ? floor?.name : identityLabel}
                    </span>
                    <button
                      type="button"
                      className="mt-1 self-start text-[13px] font-semibold text-flame-1 underline underline-offset-2"
                      onClick={() => setEditingIdentity(true)}
                    >
                      Not you? Change
                    </button>
                  </div>
                )}
                {isFloor && (
                  <label className="grid gap-1.5 text-[13px] font-semibold text-ink-2">
                    Where should we bring this?
                    <input
                      className={cx(INPUT, 'h-12')}
                      value={floorPlace}
                      onChange={(event) => setFloorPlace(event.target.value)}
                      placeholder="Cabin A, Room 12, near the entrance…"
                      autoComplete="off"
                      required
                    />
                  </label>
                )}
              </div>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className={EYEBROW}>
              {cart.count} {cart.count === 1 ? 'item' : 'items'}
            </h2>
            <ul className="flex flex-col gap-3">
              {cart.lines.map((line) => {
                const dish = byId.get(line.dishId);
                if (!dish) return null;
                const addOnNames = addOnLabels(line.addOnIds, menu.addOns);
                const variantName = variantLabel(dish, line.variantId);
                return (
                  <li
                    className="flex items-start gap-3 text-[14px]"
                    key={`${line.dishId}:${line.variantId ?? ''}:${line.addOnIds.join(',')}`}
                  >
                    <span className="min-w-6 font-bold text-flame-1 tnum">{line.quantity}×</span>
                    <span className="min-w-0 flex-1">
                      <b className="font-semibold">
                        {dish.name}
                        {variantName && ` — ${variantName}`}
                      </b>
                      {addOnNames.length > 0 && (
                        <span className="mt-0.5 block text-[12px] text-ink-3">+ {addOnNames.join(', ')}</span>
                      )}
                      {line.note && <em className="mt-0.5 block text-[12px] italic text-ink-4">“{line.note}”</em>}
                    </span>
                    <span className="tnum">
                      {formatMoney(lineUnitPrice(dish, line.variantId, line.addOnIds, menu.addOns) * line.quantity, currency)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {sessionEnded && (
            <p className="rounded-2xl bg-mint/10 px-3.5 py-3 text-[13.5px] font-semibold text-mint" role="alert">
              {isDelivery
                ? "This order has been closed out — new items can't be placed on it."
                : "This table has been closed out — new orders can't be placed. Ask a server if you'd like to order more."}
            </p>
          )}

          {error && (
            <p className="rounded-2xl bg-berry/12 px-3.5 py-3 text-[13.5px] font-semibold text-[#ff90a4]" role="alert">
              {error}
            </p>
          )}
        </div>

        <aside className="pt-7 lg:sticky lg:top-24 lg:pt-0">
          <div className="flex flex-col gap-3 lg:rounded-3xl lg:bg-surface lg:p-5 lg:ring-1 lg:ring-hairline lg:ring-inset">
            <h2 className={EYEBROW}>Bill</h2>
            <BillLines
              bill={bill}
              currency={currency}
              serviceRate={menu.restaurant.serviceChargeRate}
              taxRate={menu.restaurant.taxRate}
            />
            <button
              type="button"
              className={cx(BTN_FLAME, 'mt-1 hidden! w-full lg:inline-flex!')}
              onClick={placeOrder}
              disabled={!canSubmit}
            >
              {sessionEnded ? (isDelivery ? 'Order closed' : 'Table closed') : submitting ? 'Sending…' : 'Place order'}
            </button>
          </div>
        </aside>
      </div>

      <div className="h-[calc(var(--dock-h)+58px+var(--safe-b))] lg:h-10" />

      <div
        className={cx(
          'fixed inset-x-0 bottom-0 z-58 animate-rise px-4 pb-[calc(12px+var(--safe-b))] pt-3 sm:px-6 lg:hidden',
          GLASS,
          'shadow-[0_-1px_0_var(--color-hairline),0_-18px_34px_-26px_rgb(0_0_0/0.95)]',
        )}
      >
        <div className="mx-auto flex w-full max-w-[620px] items-center gap-2.5">
          <div className="flex flex-col pl-1 leading-tight">
            <span className="text-[11px] font-semibold text-ink-3">{isDelivery ? 'Pay on delivery' : 'Pay at restaurant'}</span>
            <b className="text-[17px] font-bold tracking-tight tnum">{formatMoney(bill.total, currency)}</b>
          </div>
          <button
            type="button"
            className={cx(BTN, BTN_SIZE, 'flex-1 bg-flame text-white shadow-flame')}
            onClick={placeOrder}
            disabled={!canSubmit}
          >
            {sessionEnded ? (isDelivery ? 'Order closed' : 'Table closed') : submitting ? 'Sending…' : 'Place order'}
          </button>
        </div>
      </div>
    </main>
  );
}
