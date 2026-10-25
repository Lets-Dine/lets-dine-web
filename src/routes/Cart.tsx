import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { track } from '../domain/analytics';
import { mapsUrl, placeName } from '../domain/location';
import type { LatLng } from '../domain/location';
import { formatMoney, percentOf } from '../domain/money';
import type { AddOn, CartLine, Dish, Menu } from '../domain/types';
import { haptic } from '../platform/haptics';
import { DishImage, QuantityStepper } from '../components/Bits';
import { QuickAddSheet } from '../components/QuickAddSheet';
import { BTN, BTN_FLAME, BTN_SIZE, EYEBROW, GLASS, SHELL, cx } from '../components/ui';
import { MapPin, Plus } from '../components/icons';
import { useCart } from '../state/CartContext';
import { encodeOrder } from '../components/OwnerPitch';
import { useDinerIdentity } from '../state/useDinerIdentity';
import { useDeliveryPlace } from '../state/useDeliveryPlace';
import { usePageTitle } from '../state/usePageTitle';
import { useToast } from '../state/ToastContext';
import { useRestaurant } from './RestaurantLayout';
import { EmptyState, TopBar } from './Shell';

/** One column on phones; items beside a sticky bill once there is room. */
export const PAGE = 'mx-auto w-full max-w-[620px] px-4 sm:px-6 lg:max-w-5xl lg:px-8';
export const SPLIT = 'lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-10';

/** A line's per-unit price: the chosen variant (or the dish's own price) plus every add-on it carries. */
export function lineUnitPrice(dish: Dish, variantId: string | null, addOnIds: string[], addOns: AddOn[]): number {
  const base = variantId ? (dish.variants.find((v) => v.id === variantId)?.price ?? dish.price) : dish.price;
  const byId = new Map(addOns.map((a) => [a.id, a]));
  return base + addOnIds.reduce((sum, id) => sum + (byId.get(id)?.price ?? 0), 0);
}

/** The chosen size/style's name, e.g. "Large" — `null` for a variant-less dish or a line whose variant is gone. */
export function variantLabel(dish: Dish, variantId: string | null): string | null {
  if (!variantId) return null;
  return dish.variants.find((v) => v.id === variantId)?.name ?? null;
}

/** Add-ons can repeat (two extra cheeses) — group them into one "Extra cheese ×2" label each. */
export function addOnLabels(addOnIds: string[], addOns: AddOn[]): string[] {
  const byId = new Map(addOns.map((a) => [a.id, a]));
  const counts = new Map<string, number>();
  for (const id of addOnIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .map(([id, qty]) => {
      const name = byId.get(id)?.name;
      return name ? (qty > 1 ? `${name} ×${qty}` : name) : null;
    })
    .filter((n): n is string => Boolean(n));
}

/** Client-side totals mirror the server formula, but the server's number wins. */
/** `deliveryFee` is already 0 for a dine-in cart — callers only need to pass it for a delivery one. */
export function useBill(
  lines: { dishId: string; quantity: number; variantId?: string | null; addOnIds?: string[] }[],
  dishes: Dish[],
  deliveryFee = 0,
) {
  const { menu } = useRestaurant();
  const byId = new Map(dishes.map((d) => [d.id, d]));
  const subtotal = lines.reduce((sum, l) => {
    const dish = byId.get(l.dishId);
    if (!dish) return sum;
    return sum + lineUnitPrice(dish, l.variantId ?? null, l.addOnIds ?? [], menu.addOns) * l.quantity;
  }, 0);
  const serviceCharge = percentOf(subtotal, menu.restaurant.serviceChargeRate);
  const tax = percentOf(subtotal + serviceCharge, menu.restaurant.taxRate);
  return { subtotal, serviceCharge, tax, deliveryFee, total: subtotal + serviceCharge + tax + deliveryFee };
}

export function BillLines({
  bill,
  currency,
  serviceRate,
  taxRate,
}: {
  bill: { subtotal: number; serviceCharge: number; tax: number; deliveryFee?: number; total: number };
  currency: string;
  serviceRate: number;
  taxRate: number;
}) {
  const row = 'flex items-center justify-between text-[14px] text-ink-2';
  return (
    <div className="flex flex-col gap-2.5">
      <div className={row}>
        <span>Subtotal</span>
        <span className="tnum">{formatMoney(bill.subtotal, currency)}</span>
      </div>
      <div className={row}>
        <span>Service charge · {Math.round(serviceRate * 100)}%</span>
        <span className="tnum">{formatMoney(bill.serviceCharge, currency)}</span>
      </div>
      <div className={row}>
        <span>VAT · {Math.round(taxRate * 100)}%</span>
        <span className="tnum">{formatMoney(bill.tax, currency)}</span>
      </div>
      {(bill.deliveryFee ?? 0) > 0 && (
        <div className={row}>
          <span>Delivery fee</span>
          <span className="tnum">{formatMoney(bill.deliveryFee ?? 0, currency)}</span>
        </div>
      )}
      <hr className="my-1 border-hairline" />
      <div className="flex items-center justify-between text-[17px] font-bold tracking-tight text-ink">
        <span>Total</span>
        <span className="tnum">{formatMoney(bill.total, currency)}</span>
      </div>
    </div>
  );
}

function whatsappUrl(number: string, text: string): string {
  return `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

/** A short WhatsApp message: headline + total, with the full order behind the link. Plain text only. */
function whatsappMessage({
  menu,
  cart,
  bill,
  name,
  phone,
  address,
  pin,
  note,
  menuUrl,
}: {
  menu: Menu;
  cart: CartLine[];
  bill: { total: number };
  name: string;
  phone: string;
  address: string;
  pin: LatLng | null;
  note: string;
  menuUrl: string;
}): string {
  const byId = new Map(menu.dishes.map((d) => [d.id, d]));
  const currency = menu.restaurant.currency;
  const lines = cart.flatMap((line) => {
    const dish = byId.get(line.dishId);
    if (!dish) return [];
    const extras = [variantLabel(dish, line.variantId), ...addOnLabels(line.addOnIds, menu.addOns)].filter(Boolean).join(', ');
    const price = formatMoney(lineUnitPrice(dish, line.variantId, line.addOnIds, menu.addOns) * line.quantity, currency);
    return [`${line.quantity} × ${dish.name}${extras ? ` (${extras})` : ''} — ${price}${line.note ? `\n   Note: ${line.note}` : ''}`];
  });
  const details = [name && `Name: ${name}`, phone && `Phone: ${phone}`, address.trim() && !(pin && address.trim() === 'Pinned location') && `Address: ${address.trim()}`, pin && `Location: ${mapsUrl(pin)}`, note && `Note: ${note}`].filter(Boolean);
  const body = [...lines, '', `Total: ${formatMoney(bill.total, currency)} (incl. delivery, pay on delivery)`, '', ...details].join('\n');
  // The details ride in the link's fragment (never sent to a server) and open on the menu page.
  return [
    `New delivery order for ${menu.restaurant.name} — ${formatMoney(bill.total, currency)}`,
    '',
    'Next: open the order below, confirm with the customer, then prepare and deliver. Payment is on delivery.',
    '',
    'Order details (Source: Feastox):',
    `${menuUrl}#o=${encodeOrder(body)}`,
  ].join('\n');
}

export function Cart() {
  const { menu, customer, identityLabel, base, session, whatsapp } = useRestaurant();
  usePageTitle(`Your order · ${menu.restaurant.name}`);
  const cart = useCart();
  const navigate = useNavigate();
  const toast = useToast();
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ line: CartLine; trigger: HTMLElement } | null>(null);
  const sessionEnded = Boolean(session.endedAt);
  // Name and phone are remembered on this device too; the boxes stay editable and the next order saves any change.
  const [dinerIdentity, rememberIdentity] = useDinerIdentity();
  const [name, setName] = useState(dinerIdentity?.name ?? '');
  const [phone, setPhone] = useState(dinerIdentity?.phone ?? '');
  // The last delivery's address and pin live on this device, as in the in-app checkout.
  const [lastPlace, rememberPlace] = useDeliveryPlace();
  const [address, setAddress] = useState(lastPlace?.address ?? customer?.defaultAddress ?? '');
  // The exact spot, sent as a Google Maps link so the restaurant can tap straight to the door.
  const [pin, setPin] = useState<LatLng | null>(lastPlace?.pin ?? null);
  // What the box held when we filled it ourselves — a new pin may replace it, never what the diner typed.
  const autoFilled = useRef('');
  const addressRef = useRef(address);
  useEffect(() => {
    addressRef.current = address;
  }, [address]);
  const lookup = useRef(0);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [orderNote, setOrderNote] = useState('');

  const closeEdit = () => {
    editing?.trigger.focus();
    setEditing(null);
  };

  const byId = new Map(menu.dishes.map((d) => [d.id, d]));
  const deliveryFee = customer || whatsapp ? (menu.restaurant.deliveryFeeAmount ?? 0) : 0;
  const bill = useBill(cart.lines, menu.dishes, deliveryFee);
  const currency = menu.restaurant.currency;

  if (cart.lines.length === 0) {
    return (
      <main className={SHELL}>
        <TopBar title="Your order" subtitle={identityLabel} fallbackTo={base} width={PAGE} />
        <div className={cx(PAGE, 'pt-6 lg:max-w-2xl')}>
          <EmptyState
            emoji="🍽️"
            title="Your cart is empty"
            message="Add something from the menu and it will show up here."
            action={
              <Link to={base} className={BTN_FLAME}>
                Browse the menu
              </Link>
            }
          />
        </div>
      </main>
    );
  }

  // The exact spot is kept at once; the place name is a label looked up after, and optional.
  const adopt = async (here: LatLng) => {
    const mine = ++lookup.current;
    setPin(here);
    const name = await placeName(here);
    if (mine !== lookup.current) return;
    const typed = addressRef.current.trim() !== '' && addressRef.current !== autoFilled.current;
    if (!typed) {
      autoFilled.current = name ?? 'Pinned location';
      setAddress(autoFilled.current);
    }
  };

  const locate = () => {
    if (!navigator.geolocation) return setLocateError("This device can't share its location. Type the address instead.");
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        haptic.select();
        void adopt({ lat: coords.latitude, lng: coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setLocateError(
          err.code === err.PERMISSION_DENIED
            ? 'Location is blocked for this site. Allow it in your browser settings, or type the address.'
            : "Couldn't find your location. Try again, or type the address.",
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };

  const proceed = () => {
    if (whatsapp) {
      if (!address.trim() && !pin) return toast('Add your address or share your location first', '📍');
      haptic.select();
      rememberPlace({ address: address.trim() || 'Pinned location', pin });
      if (name.trim() && phone.trim()) rememberIdentity({ name: name.trim(), phone: phone.trim() });
      window.open(whatsappUrl(menu.restaurant.whatsappNumber ?? '', whatsappMessage({ menu, cart: cart.lines, bill, name, phone, address, pin, note: orderNote, menuUrl: `${window.location.origin}${base}?ref=order` })), '_blank', 'noopener');
      return;
    }
    haptic.select();
    track('cart_viewed', { items: cart.count });
    navigate(`${base}/checkout`);
  };

  const editingDish = editing ? byId.get(editing.line.dishId) : undefined;

  return (
    <main className={SHELL}>
      <TopBar
        title="Your order"
        subtitle={`${identityLabel} · ${cart.count} ${cart.count === 1 ? 'item' : 'items'}`}
        fallbackTo={base}
        width={PAGE}
      />

      <div className={cx(PAGE, SPLIT, 'pt-4')}>
        <div>
          <section className="flex flex-col gap-3.5">
            {cart.lines.map((line) => {
              const dish = byId.get(line.dishId);
              if (!dish) return null;
              const lineKey = `${line.dishId}:${line.variantId ?? ''}:${line.addOnIds.join(',')}`;
              const noteOpen = openNote === lineKey || line.note.length > 0;
              const addOnNames = addOnLabels(line.addOnIds, menu.addOns);
              const variantName = variantLabel(dish, line.variantId);
              const unitPrice = lineUnitPrice(dish, line.variantId, line.addOnIds, menu.addOns);
              return (
                <article
                  className="flex gap-3.5 rounded-3xl bg-surface p-3.5 ring-1 ring-hairline ring-inset"
                  key={lineKey}
                >
                  <Link to={`${base}/d/${dish.id}`} aria-label={dish.name}>
                    <DishImage dish={dish} className="size-16.5 shrink-0 rounded-xl" monogram="text-xl" />
                  </Link>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2.5">
                      <Link
                        to={`${base}/d/${dish.id}`}
                        className="text-[15px] font-semibold leading-tight tracking-tight hover:text-flame-1"
                      >
                        {dish.name}
                        {variantName && ` — ${variantName}`}
                      </Link>
                      <span className="shrink-0 text-[14.5px] font-bold tnum">
                        {formatMoney(unitPrice * line.quantity, currency)}
                      </span>
                    </div>

                    {addOnNames.length > 0 && (
                      <span className="mt-0.5 block text-[12px] text-ink-3">+ {addOnNames.join(', ')}</span>
                    )}

                    {(dish.addOnIds.length > 0 || dish.variants.length > 0) && dish.isAvailable && (
                      <button
                        type="button"
                        onClick={(e) => {
                          haptic.select();
                          setEditing({ line, trigger: e.currentTarget });
                        }}
                        className="mt-0.5 block text-[12px] font-semibold text-flame-1"
                      >
                        {addOnNames.length > 0 || variantName ? 'Edit extras' : '+ Add extras'}
                      </button>
                    )}

                    <span className="mt-0.5 block text-[12px] text-ink-4 tnum">
                      {formatMoney(unitPrice, currency)} each
                      {!dish.isAvailable && <b className="font-semibold text-berry"> · no longer available</b>}
                    </span>

                    {noteOpen ? (
                      <input
                        value={line.note}
                        maxLength={140}
                        placeholder="Note for the kitchen"
                        onChange={(e) => cart.setNote(line.dishId, e.target.value, line.variantId, line.addOnIds)}
                        className="mt-2 h-8.5 w-full rounded-xl bg-surface-2 px-3 text-[13px] outline-none ring-1 ring-hairline ring-inset placeholder:text-ink-4 focus:ring-[1.5px] focus:ring-flame-2/35"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setOpenNote(lineKey)}
                        className="mt-1.5 block text-[12.5px] font-semibold text-flame-1"
                      >
                        + Add a note
                      </button>
                    )}

                    <div className="mt-2.5 flex items-center justify-between">
                      <QuantityStepper
                        value={line.quantity}
                        onChange={(n) => cart.setQuantity(line.dishId, n, line.variantId, line.addOnIds)}
                        size="sm"
                      />
                      <button
                        type="button"
                        /* Removal is reversible, so it needs no confirmation — it
                           needs an undo. One tap out, one tap back. */
                        onClick={() => {
                          const index = cart.lines.findIndex((l) => l === line);
                          const removed = { ...line };
                          haptic.warn();
                          cart.remove(line.dishId, line.variantId, line.addOnIds);
                          toast(`${dish.name} removed`, '🗑️', {
                            label: 'Undo',
                            onAction: () => cart.restore(removed, index),
                          });
                        }}
                        className="px-1 py-1.5 text-[12.5px] font-semibold text-ink-4 transition-colors hover:text-berry"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          <Link
            to={base}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-flame-2/14 px-4.5 py-2.5 text-[14px] font-semibold text-flame-1 ring-1 ring-flame-2/35 ring-inset"
          >
            <Plus size={16} />
            Add more dishes
          </Link>
        </div>

        {/* ── Bill ────────────────────────────────────────────── */}
        <aside className="pt-7 lg:sticky lg:top-24 lg:pt-0">
          <div className="flex flex-col gap-3 lg:rounded-3xl lg:bg-surface lg:p-5 lg:ring-1 lg:ring-hairline lg:ring-inset">
            <h2 className={EYEBROW}>Bill</h2>
            <BillLines
              bill={bill}
              currency={currency}
              serviceRate={menu.restaurant.serviceChargeRate}
              taxRate={menu.restaurant.taxRate}
            />
            {whatsapp && (
              <div className="flex flex-col gap-2">
                {([
                  ['Your name', name, setName],
                  ['Phone', phone, setPhone],
                  ['Delivery address (or share your location)', address, setAddress],
                  ['Note for the restaurant (optional)', orderNote, setOrderNote],
                ] as const).map(([label, value, set]) => (
                  <input
                    key={label}
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    placeholder={label}
                    aria-label={label}
                    maxLength={200}
                    className="h-10 w-full rounded-xl bg-surface-2 px-3 text-[13.5px] outline-none ring-1 ring-hairline ring-inset placeholder:text-ink-4 focus:ring-[1.5px] focus:ring-flame-2/35"
                  />
                ))}
                <button
                  type="button"
                  onClick={locate}
                  disabled={locating}
                  className={cx(
                    'inline-flex h-10 items-center justify-center gap-2 rounded-xl text-[13.5px] font-semibold ring-1 ring-inset transition-move active:scale-[0.98] disabled:opacity-70',
                    pin ? 'bg-flame-2/15 text-flame-1 ring-flame-2/40' : 'bg-surface-2 text-ink-2 ring-hairline',
                  )}
                >
                  <MapPin size={16} className={cx(locating && 'motion-safe:animate-pulse')} />
                  {locating ? 'Finding you…' : pin ? 'Location shared — update' : 'Share my location'}
                </button>
                {(pin || locateError) && (
                  <p role={locateError ? 'alert' : 'status'} className={cx('text-[12px] leading-snug', locateError ? 'text-berry-ink' : 'text-ink-3')}>
                    {locateError ?? 'A Google Maps link to your spot goes in the message.'}{' '}
                    {pin && !locateError && (
                      <button type="button" onClick={() => { lookup.current++; setPin(null); }} className="font-semibold underline underline-offset-2">
                        Remove
                      </button>
                    )}
                  </p>
                )}
              </div>
            )}
            <p className="text-[11.5px] leading-relaxed text-ink-4">
              {whatsapp
                ? 'This opens WhatsApp with your order ready to send. The restaurant confirms it there.'
                : sessionEnded
                ? "This table has been closed out — new orders can't be placed."
                : 'The kitchen confirms the final amount when it accepts your order.'}
            </p>
            <button
              type="button"
              className={cx(BTN_FLAME, 'mt-1 hidden! w-full lg:inline-flex!')}
              onClick={proceed}
              disabled={sessionEnded}
            >
              {whatsapp ? 'Order on WhatsApp' : sessionEnded ? 'Table closed' : 'Review & order'}
            </button>
          </div>
        </aside>
      </div>

      <div className="h-[calc(var(--dock-h)+58px+var(--safe-b))] lg:h-10" />

      {/* ── Sticky bar (small screens) ──────────────────────────── */}
      <div
        className={cx(
          'fixed inset-x-0 bottom-0 z-58 animate-rise px-4 pb-[calc(12px+var(--safe-b))] pt-3 sm:px-6 lg:hidden',
          GLASS,
          'shadow-[0_-1px_0_var(--color-hairline),0_-18px_34px_-26px_rgb(0_0_0/0.95)]',
        )}
      >
        <div className="mx-auto flex w-full max-w-155 items-center gap-2.5">
          <div className="flex flex-col pl-1 leading-tight">
            <span className="text-[11px] font-semibold text-ink-3">Total</span>
            <b className="text-[17px] font-bold tracking-tight tnum">{formatMoney(bill.total, currency)}</b>
          </div>
          <button
            type="button"
            className={cx(BTN, BTN_SIZE, 'flex-1 bg-flame text-white shadow-flame')}
            onClick={proceed}
            disabled={sessionEnded}
          >
            {whatsapp ? 'Order on WhatsApp' : sessionEnded ? 'Table closed' : 'Review & order'}
          </button>
        </div>
      </div>

      {editing && editingDish && (
        <QuickAddSheet
          dish={editingDish}
          href={`${base}/d/${editingDish.id}`}
          initial={{
            quantity: editing.line.quantity,
            note: editing.line.note,
            variantId: editing.line.variantId,
            addOnIds: editing.line.addOnIds,
          }}
          onClose={closeEdit}
        />
      )}
    </main>
  );
}
