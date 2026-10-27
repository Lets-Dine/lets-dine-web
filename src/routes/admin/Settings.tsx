import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { IS_LIVE_API } from '../../api/http';
import { INVENTORY_ENABLED } from '../../api/inventory';
import { listAudit, updateSettings } from '../../api/staff';
import { PinMap } from '../../components/PinMap';
import { placeName, type LatLng } from '../../domain/location';
import { ROLE_LABEL, ROLE_SCOPE } from '../../domain/permissions';
import type { AuditEntry, DeliveryChannel, Restaurant } from '../../domain/types';
import { planAllowsAutoStock } from '../../domain/subscription';
import { AutoConsumeLockedNote } from '../../components/admin/AutoConsumeChoice';
import { useSubscription } from '../../state/SubscriptionContext';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { relativeTime } from '../../components/time';
import { ADMIN_PRIMARY, Field, LABEL, MoneyInput, PercentInput, TextArea, TextInput, Toggle, useCommand } from '../../components/admin/kit';
import { Block } from '../../components/admin/profile';
import { CHIP, CHIP_OFF, CHIP_ON, DISPLAY, cx } from '../../components/ui';
import { ImageUpload } from '../../components/admin/ImageUpload';
import { LoyaltySettings } from '../../components/admin/Loyalty';
import { PrinterSettings } from '../../components/admin/PrinterSettings';
import { RestaurantMark } from '../../components/RestaurantMark';
import { Bag, Bike, Box, Building, Check, History, Photo, Printer, Receipt, Star, WhatsApp } from '../../components/icons';
import type { ComponentType } from 'react';
import { useDashboard } from './AdminLayout';

/**
 * §26 settings, §51 audit log.
 *
 * Fees live here rather than in the checkout code, because a restaurant's
 * service charge is its own business decision and the diner app should never
 * hold a hardcoded copy of it. Changing one is logged, along with every other
 * management action, with the person who made it attached.
 */
type TabKey = 'restaurant' | 'branding' | 'charges' | 'delivery' | 'loyalty' | 'stock' | 'printing' | 'activity';
const TABS: { key: TabKey; label: string; Icon: ComponentType<{ size?: number; className?: string }> }[] = [
  { key: 'restaurant', label: 'Restaurant', Icon: Building },
  { key: 'branding', label: 'Logo & cover', Icon: Photo },
  { key: 'charges', label: 'Tax & charges', Icon: Receipt },
  { key: 'delivery', label: 'Delivery', Icon: Bike },
  { key: 'loyalty', label: 'Loyalty', Icon: ({ size, className }) => <Star size={size} className={className} filled={false} /> },
  { key: 'stock', label: 'Stock', Icon: Box },
  { key: 'printing', label: 'Printing', Icon: Printer },
  { key: 'activity', label: 'Activity', Icon: History },
];

const CHANNELS = [
  {
    value: 'APP' as const,
    label: 'In the app',
    hint: 'Diners place the order here. It shows up in Orders and Delivery.',
    Icon: Bag,
    tile: 'bg-flame-2/14 text-flame-1 ring-1 ring-flame-2/30 ring-inset',
    selected: 'peer-checked:bg-surface-2 peer-checked:ring-flame-2/60',
  },
  {
    value: 'WHATSAPP' as const,
    label: 'Through WhatsApp',
    hint: 'Diners build a cart and send it to your WhatsApp. Nothing is recorded here.',
    Icon: WhatsApp,
    tile: 'bg-mint/14 text-mint-ink ring-1 ring-mint/30 ring-inset',
    selected: 'peer-checked:bg-surface-2 peer-checked:ring-mint/60',
  },
];

/** Nepal, the home market — the sign-up form takes a bare 10-digit number, so the code is added here. */
const COUNTRY_CODE = '977';

/** Where the map opens until the restaurant has a pin. */
const KATHMANDU: LatLng = { lat: 27.7172, lng: 85.324 };

export function Settings() {
  const staff = useStaff();
  const { allows } = useAuth();
  const { menu, applyRestaurant } = useDashboard();
  const { busy, run } = useCommand();

  const restaurant = menu.restaurant;
  const canEdit = allows('settings:edit');

  const [name, setName] = useState(restaurant.name);
  const [legalName, setLegalName] = useState(restaurant.legalName);
  const [tagline, setTagline] = useState(restaurant.tagline);
  const [description, setDescription] = useState(restaurant.description);
  const [coverImageUrl, setCoverImageUrl] = useState(restaurant.coverImageUrl);
  const [logoUrl, setLogoUrl] = useState(restaurant.logoUrl);
  const [service, setService] = useState((restaurant.serviceChargeRate * 100).toFixed(1));
  const [tax, setTax] = useState((restaurant.taxRate * 100).toFixed(1));
  const [vatPan, setVatPan] = useState(restaurant.vatPanNumber ?? '');
  // The pin is the source of truth for coordinates; the name starts as the map's guess and the owner can retype it.
  const [pin, setPin] = useState<LatLng | null>(
    restaurant.latitude != null && restaurant.longitude != null ? { lat: restaurant.latitude, lng: restaurant.longitude } : null,
  );
  const [addressName, setAddressName] = useState(restaurant.addressName ?? '');
  // Every pin move looks the address up again; only the newest answer may land, and a miss clears the stale name rather than keep one for the old spot.
  const lookup = useRef(0);
  const adoptPin = (next: LatLng) => {
    setPin(next);
    const mine = ++lookup.current;
    void placeName(next).then((name) => {
      if (mine === lookup.current) setAddressName(name ?? '');
    });
  };
  const [locateError, setLocateError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const useMyLocation = () => {
    if (!navigator.geolocation) return setLocateError("This device can't share its location. Tap the map instead.");
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        adoptPin({ lat: coords.latitude, lng: coords.longitude });
      },
      (err) => {
        setLocating(false);
        setLocateError(
          err.code === err.PERMISSION_DENIED
            ? 'Location is blocked for this site. Allow it in your browser settings, or tap the map.'
            : "Couldn't find your location. Try again, or tap the map.",
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };
  const [deliveryFee, setDeliveryFee] = useState(restaurant.deliveryFeeAmount ?? 0);
  const [deliveryOn, setDeliveryOn] = useState(restaurant.deliveryEnabled ?? true);
  const [channel, setChannel] = useState<DeliveryChannel>(restaurant.deliveryChannel ?? 'APP');
  // Typed the way the sign-up form takes a phone number: 10 digits, nothing else. Stored with Nepal's 977 so wa.me can route it.
  const [whatsapp, setWhatsapp] = useState(() => {
    const stored = restaurant.whatsappNumber ?? '';
    return stored.startsWith(COUNTRY_CODE) && stored.length > 10 ? stored.slice(COUNTRY_CODE.length) : stored;
  });
  const whatsappError = whatsapp && !/^\d{10}$/.test(whatsapp) ? 'Enter a 10 digit phone number.' : undefined;
  const whatsappFull = whatsapp ? `${COUNTRY_CODE}${whatsapp}` : '';
  const needsWhatsapp = deliveryOn && channel === 'WHATSAPP' && !whatsapp;
  const [autoConsume, setAutoConsume] = useState(restaurant.autoConsumeStock ?? true);
  const planAllowsStockUse = planAllowsAutoStock(useSubscription().subscription);
  const [justSaved, setJustSaved] = useState(false);
  const saveRef = useRef<() => void>(() => {});

  // Which tabs hold unsaved edits, so the switcher can say where they are.
  const unsaved: Partial<Record<TabKey, boolean>> = {
    restaurant:
      name !== restaurant.name ||
      legalName.trim() !== restaurant.legalName ||
      tagline !== restaurant.tagline ||
      description !== restaurant.description ||
      vatPan.trim() !== (restaurant.vatPanNumber ?? '') ||
      pin?.lat !== (restaurant.latitude ?? undefined) ||
      pin?.lng !== (restaurant.longitude ?? undefined) ||
      addressName.trim() !== (restaurant.addressName ?? ''),
    branding: coverImageUrl !== restaurant.coverImageUrl || logoUrl !== restaurant.logoUrl,
    charges: Number(service) / 100 !== restaurant.serviceChargeRate || Number(tax) / 100 !== restaurant.taxRate,
    delivery:
      deliveryFee !== (restaurant.deliveryFeeAmount ?? 0) ||
      deliveryOn !== (restaurant.deliveryEnabled ?? true) ||
      channel !== (restaurant.deliveryChannel ?? 'APP') ||
      whatsappFull !== (restaurant.whatsappNumber ?? ''),
    stock: autoConsume !== (restaurant.autoConsumeStock ?? true),
  };
  const dirty = Object.values(unsaved).some(Boolean);

  const tabs = TABS.filter(
    (t) => (t.key !== 'loyalty' || (IS_LIVE_API && allows('settings:view'))) && (t.key !== 'stock' || INVENTORY_ENABLED) && (t.key !== 'printing' || (IS_LIVE_API && allows('settings:view'))),
  );
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab = tabs.find((t) => t.key === requested)?.key ?? 'restaurant';
  // Loyalty reads its rules from the server, so it is only mounted once opened — and then kept, so edits survive a tab switch.
  const [loyaltySeen, setLoyaltySeen] = useState(false);
  useEffect(() => {
    if (tab === 'loyalty') setLoyaltySeen(true);
  }, [tab]);
  const savesHere = tab !== 'loyalty' && tab !== 'activity' && tab !== 'printing';
  const legalNameError = legalName.trim() ? undefined : 'Enter the legal business name.';
  const canSave = canEdit && dirty && !busy && !whatsappError && !needsWhatsapp && !legalNameError;

  // ⌘S / Ctrl+S saves, as on a dish.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const flashSaved = () => {
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1800);
  };

  // Only the Activity tab shows the log, so it is only read (fresh) when that tab opens.
  const onActivity = tab === 'activity';
  const audit = useAsync(async () => (onActivity ? (await listAudit(staff, 5)).rows : null), [staff, onActivity]);

  const save = () => {
    if (!canSave) return;
    // The save answers with the restaurant as stored, so that is all the dashboard needs — no re-read of the menu.
    const saved: { restaurant?: Restaurant } = {};
    void run(
      'settings',
      async () => {
        saved.restaurant = await updateSettings(staff, {
          name,
          legalName: legalName.trim(),
          tagline,
          description,
          coverImageUrl: coverImageUrl.trim() || null,
          logoUrl: logoUrl.trim() || null,
          vatPanNumber: vatPan.trim() || null,
          addressName: pin ? addressName.trim() || null : null,
          latitude: pin?.lat ?? null,
          longitude: pin?.lng ?? null,
          serviceChargeRate: Number(service) / 100,
          taxRate: Number(tax) / 100,
          deliveryFeeAmount: deliveryFee,
          deliveryEnabled: deliveryOn,
          deliveryChannel: channel,
          whatsappNumber: whatsappFull || null,
          ...(INVENTORY_ENABLED && planAllowsStockUse && { autoConsumeStock: autoConsume }),
        });
      },
    ).then((ok) => {
      if (ok && saved.restaurant) {
        applyRestaurant(saved.restaurant);
        flashSaved();
      }
    });
  };
  saveRef.current = save;

  const locked = canEdit ? undefined : 'Only an owner can change these';

  return (
    <div className={cx('mx-auto max-w-6xl', canEdit && 'pb-28')}>
      <h1 className={cx(DISPLAY, 'animate-rise text-[clamp(40px,7vw,76px)] leading-[0.98] tracking-[-0.03em]')}>Settings</h1>
      <p className="mt-5 max-w-[40ch] animate-rise text-[clamp(18px,2.2vw,24px)] font-medium leading-[1.3] text-ink-2 [animation-delay:120ms]">
        {canEdit ? 'Changes apply to the next order, as soon as you save.' : 'You can look, but only an owner can change these.'}
      </p>

      <div className="mt-6 flex animate-rise flex-wrap items-center gap-2 [animation-delay:80ms]" role="group" aria-label="Settings section">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            className={cx(CHIP, tab === t.key ? CHIP_ON : CHIP_OFF)}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
          >
            <t.Icon size={15} />
            {t.label}
            {unsaved[t.key] && (
              <>
                <span aria-hidden className={cx('size-1.5 rounded-full', tab === t.key ? 'bg-white' : 'bg-flame')} />
                <span className="sr-only">, unsaved changes</span>
              </>
            )}
          </button>
        ))}
      </div>

      {tabs.some((t) => t.key === 'loyalty') && (loyaltySeen || tab === 'loyalty') && (
        <div className={cx('mt-8 max-w-3xl', tab !== 'loyalty' && 'hidden')}>
          <LoyaltySettings currency={restaurant.currency} canEdit={canEdit} />
        </div>
      )}

      <div className={cx('mt-8 grid max-w-3xl gap-6', tab === 'loyalty' && 'hidden')} key={tab}>
        {tab === 'restaurant' && (
          <Block title="Restaurant" hint={locked} delay={0}>
            <fieldset disabled={!canEdit} className="grid gap-4 disabled:opacity-60">
              <Field label="Name" hint="What guests see on the menu.">
                <TextInput value={name} onChange={setName} maxLength={60} />
              </Field>
              <Field label="Legal business name" hint="The registered name printed on every receipt." error={legalNameError}>
                <TextInput value={legalName} onChange={setLegalName} maxLength={120} placeholder="e.g. Sekuwa Ghar Pvt. Ltd." />
              </Field>
              <Field label="Tagline" hint="Shown under the name on the diner menu.">
                <TextInput value={tagline} onChange={setTagline} maxLength={80} />
              </Field>
              <Field label="Description">
                <TextArea value={description} onChange={setDescription} maxLength={400} rows={3} />
              </Field>
              <Field label="VAT / PAN number" hint="Printed on every receipt. Leave blank to omit it.">
                <TextInput value={vatPan} onChange={setVatPan} maxLength={30} placeholder="e.g. 123456789" />
              </Field>
              <Field label="WhatsApp number" hint="Where delivery orders go when delivery runs through WhatsApp." error={whatsappError}>
                <TextInput
                  type="tel"
                  value={whatsapp}
                  onChange={(v) => setWhatsapp(v.replace(/\D/g, '').slice(0, 10))}
                  maxLength={10}
                  placeholder="9800000000"
                />
              </Field>
              {/* Not a <Field>: that is a <label>, and a click on the map would be forwarded to the first button inside it. */}
              <div>
                <span className={LABEL}>Address</span>
                <p className="mt-1.5 text-[12px] text-ink-4">Pin the restaurant on the map, then edit the name if it needs it. Delivery routes start here.</p>
                <div className="mt-2 grid gap-3">
                  <div className="overflow-hidden rounded-2xl ring-1 ring-hairline ring-inset">
                    <PinMap
                      value={pin ?? KATHMANDU}
                      onChange={adoptPin}
                      label="Map: drag the pin or tap to set the restaurant's location"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" onClick={useMyLocation} disabled={locating} className={cx(CHIP, CHIP_OFF)}>
                      {locating ? 'Locating…' : 'Use my current location'}
                    </button>
                    {locateError && <span className="text-[13px] font-medium text-ink-3">{locateError}</span>}
                  </div>
                  <TextInput
                    value={addressName}
                    onChange={setAddressName}
                    maxLength={200}
                    placeholder={pin ? 'Address name' : 'Tap the map to drop the pin'}
                    disabled={!pin}
                  />
                </div>
              </div>
            </fieldset>
          </Block>
        )}

        {tab === 'branding' && (
          <>
            <Block title="Logo" hint="Beside your name in the dashboard and on the diner menu" delay={0}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <RestaurantMark name={name || restaurant.name} logoUrl={logoUrl} className="size-28 text-[44px]" />
                <fieldset disabled={!canEdit} className="min-w-0 flex-1 disabled:opacity-60">
                  <Field label="Logo" hint="A square image works best. Upload one, or paste a URL below.">
                    <div className="flex flex-wrap items-center gap-2" data-tour="logo">
                      <ImageUpload target="restaurant-logo" aspect={1} label="Upload logo" onUploaded={setLogoUrl} />
                      {logoUrl && (
                        <button type="button" onClick={() => setLogoUrl('')} className="px-2 text-[13px] font-semibold text-ink-3 hover:text-ink">
                          Remove
                        </button>
                      )}
                    </div>
                  </Field>
                  <Field label="Image URL" className="mt-3">
                    <TextInput value={logoUrl} onChange={setLogoUrl} placeholder="https://…/logo.png" maxLength={5000} />
                  </Field>
                </fieldset>
              </div>
            </Block>

            <Block title="Cover image" hint="At the top of the diner menu" delay={60}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="h-28 w-full shrink-0 overflow-hidden rounded-2xl ring-1 ring-hairline ring-inset sm:w-44">
                  {coverImageUrl ? (
                    <img src={coverImageUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="size-full bg-surface-2 bg-[radial-gradient(circle_at_50%_-10%,rgb(255_138_61/0.35),transparent_68%)]" aria-hidden />
                  )}
                </div>
                <fieldset disabled={!canEdit} className="min-w-0 flex-1 disabled:opacity-60">
                  <Field label="Photo" hint="Upload a wide, landscape photo, or paste a URL below.">
                    <ImageUpload target="restaurant-cover" aspect={16 / 9} label="Upload photo" onUploaded={setCoverImageUrl} />
                  </Field>
                  <Field label="Image URL" className="mt-3">
                    <TextInput value={coverImageUrl} onChange={setCoverImageUrl} placeholder="https://…/cover.jpg" maxLength={5000} />
                  </Field>
                </fieldset>
              </div>
            </Block>
          </>
        )}

        {tab === 'charges' && (
          <Block title="Tax & charges" hint={locked ?? 'Added to every order the moment it is placed'} delay={0}>
            <fieldset disabled={!canEdit} className="grid gap-4 disabled:opacity-60 sm:grid-cols-2" data-tour="charges">
              <Field label="Service charge" hint="Percent of the subtotal.">
                <PercentInput value={service} onChange={setService} />
              </Field>
              <Field label="Tax" hint="Percent of subtotal plus service charge.">
                <PercentInput value={tax} onChange={setTax} />
              </Field>
            </fieldset>
            <p className="mt-4 text-[12.5px] leading-relaxed text-ink-4">
              The diner app reads these from the server on every order, so a change applies to the next order placed — including one already sitting in somebody&apos;s cart.
            </p>
          </Block>
        )}

        {tab === 'delivery' && (
          <Block title="Delivery" hint={locked} delay={0}>
            <fieldset disabled={!canEdit} className="grid gap-5 disabled:opacity-60">
              <Toggle
                checked={deliveryOn}
                onChange={setDeliveryOn}
                label="Accept delivery orders"
                hint="Off: diners can still browse the menu, but can't start or place a delivery order."
              />
              {deliveryOn && (
                <>
                  <div role="radiogroup" aria-label="Delivery channel" className="grid gap-3 sm:grid-cols-2">
                    {CHANNELS.map(({ value, label, hint, Icon, tile, selected }) => (
                      <label key={value} className="relative block cursor-pointer">
                        <input type="radio" name="delivery-channel" className="peer sr-only" checked={channel === value} onChange={() => setChannel(value)} />
                        <span
                          className={cx(
                            'flex h-full gap-3.5 rounded-2xl bg-surface p-4 ring-1 ring-hairline ring-inset transition-[background-color,box-shadow] duration-200 ease-out-quart',
                            'hover:bg-surface-2/60 peer-focus-visible:ring-2 peer-focus-visible:ring-flame-2',
                            selected,
                          )}
                        >
                          <span className={cx('grid size-11 shrink-0 place-items-center rounded-xl', tile)}>
                            <Icon size={22} />
                          </span>
                          <span className="min-w-0 pr-7">
                            <span className="block text-[15px] font-semibold tracking-tight">{label}</span>
                            <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">{hint}</span>
                          </span>
                        </span>
                        <span
                          aria-hidden
                          className={cx(
                            'pointer-events-none absolute right-3.5 top-3.5 grid size-5 place-items-center rounded-full ring-1 ring-inset transition-colors duration-200',
                            channel === value ? 'bg-ink text-bg ring-transparent' : 'text-transparent ring-hairline-strong',
                          )}
                        >
                          <Check size={12} />
                        </span>
                      </label>
                    ))}
                  </div>
                  {needsWhatsapp && (
                    <p role="note" className="rounded-xl bg-surface-2 px-4 py-3 text-[13px] text-ink-3 ring-1 ring-hairline ring-inset">
                      Add your WhatsApp number in the{' '}
                      <button type="button" className="font-semibold text-flame-1 underline underline-offset-2" onClick={() => setParams({ tab: 'restaurant' }, { replace: true })}>
                        Restaurant
                      </button>{' '}
                      section so orders have somewhere to go.
                    </p>
                  )}
                  <Field label="Delivery fee" hint="Flat amount added to a delivery order only. Leave at 0 for none.">
                    <MoneyInput value={deliveryFee} onChange={setDeliveryFee} currency={restaurant.currency} />
                  </Field>
                </>
              )}
            </fieldset>
          </Block>
        )}


        {tab === 'stock' && (
          <Block title="Stock" hint={locked} delay={0}>
            {planAllowsStockUse ? (
              <fieldset disabled={!canEdit} className="disabled:opacity-60">
                <Toggle
                  checked={autoConsume}
                  onChange={setAutoConsume}
                  label="Take stock off automatically"
                  hint="When the kitchen starts a dish, its recipe comes off stock. A branch or a single dish can override this."
                />
              </fieldset>
            ) : (
              <AutoConsumeLockedNote />
            )}
          </Block>
        )}

        {tab === 'printing' && <PrinterSettings canEdit={canEdit} />}

        {tab === 'activity' && (
          <>
            <Block title="Recent activity" hint="Who changed what" delay={0}>
              {audit.loading && !audit.data ? (
                <p className="py-4 text-[13.5px] text-ink-3">Loading…</p>
              ) : (audit.data ?? []).length === 0 ? (
                <p className="py-4 text-[13.5px] leading-relaxed text-ink-3">Every management action from here on is recorded with who did it and what changed.</p>
              ) : (
                <ul className="-mx-5 border-t border-hairline sm:-mx-6">
                  {(audit.data ?? []).map((entry, i) => (
                    <ActivityRow key={entry.id} entry={entry} delay={100 + Math.min(i, 4) * 40} />
                  ))}
                </ul>
              )}
              <Link to="/admin/audit" className="mt-3 inline-flex items-center gap-2 text-[13px] font-semibold text-flame-1 transition-colors hover:text-flame-2">
                <History size={15} />
                View the full audit log
              </Link>
            </Block>

            <Block title="Your access" hint={`${staff.name} · ${ROLE_LABEL[staff.role]}`} delay={60}>
              <p className="text-[14px] leading-relaxed text-ink-3">{ROLE_SCOPE[staff.role]}</p>
              <p className="mt-3 text-[12.5px] leading-relaxed text-ink-4">
                Roles are checked twice: the dashboard hides what you cannot use, and the API refuses it again if it is called anyway.
              </p>
            </Block>
          </>
        )}
      </div>

      {canEdit && savesHere && (
        <div
          className={cx(
            'fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 transition-[transform,opacity] duration-500 ease-spring',
            dirty || justSaved || busy ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-8 opacity-0',
          )}
          aria-hidden={!dirty && !justSaved && !busy}
        >
          <div className="flex w-full max-w-lg items-center gap-3 rounded-full bg-surface-2/90 py-2 pl-5 pr-2 shadow-deep ring-1 ring-hairline-strong ring-inset backdrop-blur-xl">
            <span className="flex min-w-0 flex-1 items-center gap-2.5 truncate text-[13.5px] text-ink-2" aria-live="polite">
              <span aria-hidden className={cx('size-2 shrink-0 rounded-full', justSaved ? 'bg-mint' : 'animate-breathe bg-gold')} />
              {justSaved ? 'Saved' : 'Unsaved changes'}
            </span>
            <button type="button" className={cx(ADMIN_PRIMARY, 'relative h-9 overflow-hidden px-4')} disabled={!canSave && !justSaved} onClick={save} data-tour="save-settings">
              <span aria-hidden className={cx('absolute inset-0 origin-left bg-mint transition-transform duration-500 ease-out-quart', justSaved ? 'scale-x-100' : 'scale-x-0')} />
              <span className="relative inline-flex items-center gap-1.5">
                {justSaved ? (
                  <>
                    <Check size={15} /> Saved
                  </>
                ) : busy ? (
                  'Saving…'
                ) : (
                  'Save'
                )}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Deliberately quiet — no colour coding here. The full-colour, filterable
 *  version of this same row lives on the dedicated audit page (`AuditLog.tsx`),
 *  which is where a long list actually needs to be scanned at a glance. */
function ActivityRow({ entry, delay }: { entry: AuditEntry; delay: number }) {
  return (
    <li style={{ animationDelay: `${delay}ms` }} className="animate-rise flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-hairline px-4 py-2.5 last:border-0 sm:px-5">
      <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-4">{entry.action.replace(/_/g, ' ')}</span>
      <span className="text-[13.5px] font-semibold">{entry.subject}</span>
      <span className="ml-auto whitespace-nowrap text-[12px] text-ink-4">
        {entry.actorName} · {relativeTime(entry.at)}
      </span>
    </li>
  );
}
