import { useLayoutEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { salesWhatsAppUrl } from '../domain/contact';
import { ArrowUpRight, Bell, Bike, Cash, Check, Contact, Sparkle, WhatsApp, X } from './icons';
import { BTN_FLAME, BTN_GHOST, DISPLAY, cx } from './ui';

const CONTACT_URL = salesWhatsAppUrl('Hi, I received an order through Feastox and want to know more.');
const PAPER = '#f6f1e7';
const ACTION =
  'inline-flex h-12.5 w-full items-center justify-center gap-2 rounded-full px-6 text-[15.5px] font-semibold tracking-tight transition-move active:scale-[0.97]';

/** Order text <-> URL-safe base64 (UTF-8 aware) for the link fragment. */
export const encodeOrder = (text: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** The customer's number from the order text, digits only — null if they gave none. */
const customerDigits = (order: string | null): string | null => {
  const d = /^Phone: (.+)$/m.exec(order ?? '')?.[1].replace(/\D/g, '');
  return d && d.length >= 7 ? d : null;
};

function decodeOrder(hash: string): string | null {
  const m = /^#o=([\w-]+)$/.exec(hash);
  if (!m) return null;
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

/** The Maps pin rides in the ticket as a bare URL — wrap it so the owner can open it, under a short label. */
function linkedOrder(text: string) {
  return text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-flame-1 underline underline-offset-2">
        {/* The raw directions URL is ~150 characters of query string; show what it does instead. */}
        {/\/maps\/dir\//.test(part) ? 'Get directions →' : /google\.com\/maps/.test(part) ? 'Open in Maps →' : part}
      </a>
    ) : (
      part
    ),
  );
}

const FEASTOX = (
  <span className="inline-flex items-center gap-1.5 font-display text-[15px] font-semibold tracking-tight text-ink">
    <Sparkle size={14} className="text-flame-2" /> Feastox
  </span>
);

/**
 * Shown to a restaurant owner who opens the menu link from a WhatsApp order (`?ref=order`).
 * `?pitch=full|sheet|banner` picks the variant; an order link defaults to the full welcome screen, a bare `?ref=order` to the banner.
 */
export function OwnerPitch({ restaurantName }: { restaurantName?: string }) {
  const [params] = useSearchParams();
  const order = decodeOrder(useLocation().hash);
  const [open, setOpen] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const { slug } = useParams();
  const pitch = params.get('ref') === 'order' ? (params.get('pitch') ?? (order ? 'full' : 'banner')) : null;
  const fullOpen = pitch === 'full' && open && Boolean(order);

  // The welcome screen is owner-facing, so it wears the same cream stock as the signup it leads into
  // — re-pointing the shared tokens on <html>, exactly as GetStarted/Landing do, for as long as it's up.
  useLayoutEffect(() => {
    if (!fullOpen) return;
    const root = document.documentElement;
    const meta = document.querySelector('meta[name="theme-color"]');
    const prevPage = root.getAttribute('data-page');
    const prevMeta = meta?.getAttribute('content') ?? null;
    root.setAttribute('data-page', 'landing');
    if (prevMeta !== null) meta?.setAttribute('content', PAPER); // only override a value we can restore
    return () => {
      if (prevPage === null) root.removeAttribute('data-page');
      else root.setAttribute('data-page', prevPage);
      if (prevMeta !== null) meta?.setAttribute('content', prevMeta);
    };
  }, [fullOpen]);

  if (pitch === null) return null;

  const close = (
    <button type="button" onClick={() => setOpen(false)} aria-label="Dismiss" className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink">
      <X size={17} />
    </button>
  );
  const contact = (cls: string) => (
    <a href={CONTACT_URL} target="_blank" rel="noopener" className={cls}>
      <WhatsApp size={16} /> Questions? Talk to us
    </a>
  );

  const customer = customerDigits(order);

  // The three things to do with the order — each a real restaurant moment, so each gets its own drawn mark.
  const nextSteps = (
    <ol className="flex flex-col gap-3.5">
      {([
        [Check, 'Confirm it', customer ? 'Call the customer to confirm the order' : 'Reach the customer using the details above'],
        [Bike, 'Make & send it', 'Prepare the order and send it out for delivery'],
        [Cash, 'Collect on delivery', 'The customer pays when it arrives at the door'],
      ] as const).map(([Icon, title, text], i) => (
        <li key={i} className="flex items-start gap-3.5">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-flame-2/14 text-flame-1 ring-1 ring-flame-2/25 ring-inset">
            <Icon size={17} />
          </span>
          <div className="flex flex-col gap-0.5 pt-0.5">
            <b className="text-[14.5px] leading-tight text-ink">{title}</b>
            <span className="text-[13px] leading-snug text-ink-3">{text}</span>
          </div>
        </li>
      ))}
    </ol>
  );

  // The practical pane: the order as a printed docket, numerals in mono, then what to do with it.
  const ticket = (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-2xl bg-bg-deep ring-1 ring-hairline ring-inset">
        <div className="flex items-center justify-between gap-3 border-b border-dashed border-hairline-strong px-4 py-3">
          <span className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.16em] text-flame-1">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full rounded-full bg-flame-2/70 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-flame-2" />
            </span>
            New order
          </span>
          <span className="text-[12px] text-ink-4">pay on delivery</span>
        </div>
        <pre className="max-h-[46dvh] overflow-y-auto whitespace-pre-wrap break-words px-4 py-3.5 font-mono text-[12.5px] leading-[1.7] text-ink-2">{order && linkedOrder(order)}</pre>
      </div>
      <div className="flex flex-col gap-4">
        <b className="text-[13.5px] font-semibold text-ink-3">What to do next</b>
        {nextSteps}
        {customer && (
          // tel: dials the number as the customer typed it — a local number without a country code
          // would send a wa.me chat to the wrong country, so calling is the reliable confirm.
          <a href={`tel:${customer}`} className={cx(BTN_FLAME, 'w-full')}>
            <Contact size={17} /> Call the customer
          </a>
        )}
      </div>
    </div>
  );

  if (fullOpen) {
    return (
      <div role="dialog" aria-label="Your new order" className="fixed inset-0 z-80 overflow-y-auto bg-bg text-ink">
        {/* Warm hearth-light from the top corners, tuned to sit on cream stock. */}
        <div aria-hidden className="pointer-events-none fixed inset-0 bg-[radial-gradient(1200px_600px_at_8%_-6%,color-mix(in_oklab,var(--flame)_13%,transparent),transparent_62%),radial-gradient(900px_520px_at_104%_0%,color-mix(in_oklab,var(--color-gold)_12%,transparent),transparent_60%)]" />
        <button type="button" onClick={() => setOpen(false)} aria-label="Dismiss" className="fixed right-4 top-4 z-10 grid size-10 cursor-pointer place-items-center rounded-full bg-surface/80 text-ink-3 ring-1 ring-hairline ring-inset backdrop-blur-sm transition-colors hover:text-ink">
          <X size={18} />
        </button>
        <div className="relative mx-auto grid min-h-dvh w-full max-w-[1180px] grid-cols-1 lg:grid-cols-[1.02fr_0.98fr] lg:grid-rows-[auto_1fr]">
          {/* Welcome */}
          <div className="animate-rise flex flex-col gap-4 px-6 pb-5 pt-6 sm:px-10 lg:col-start-1 lg:row-start-1 lg:gap-6 lg:px-14 lg:pb-8 lg:pt-14">
            {FEASTOX}
            <div className="flex flex-col gap-5">
              <span className="hidden size-14 place-items-center rounded-2xl bg-flame-2/15 text-flame-1 shadow-[0_14px_40px_-18px_color-mix(in_oklab,var(--flame)_70%,transparent)] ring-1 ring-flame-2/30 ring-inset lg:grid">
                <Bell size={26} />
              </span>
              <div className="flex flex-col gap-3">
                <h1 className={cx(DISPLAY, 'text-[clamp(25px,6vw,52px)] text-ink')}>
                  You've got a new order{restaurantName && <>,<br className="hidden sm:block" /> <span className="text-flame-1">{restaurantName}</span></>}!
                </h1>
                <p className="hidden max-w-[48ch] text-[16px] leading-relaxed text-ink-2 sm:text-[17px] lg:block">
                  A customer just ordered straight from your menu. The full ticket is right here, with everything you need to get it out the door.
                </p>
              </div>
            </div>
          </div>

          {/* Practical pane — spans both rows on desktop so the order sits beside the welcome and the pitch. */}
          <div className="animate-rise border-t border-hairline bg-surface px-6 py-9 sm:px-10 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-l lg:border-t-0 lg:px-12 lg:py-14" style={{ animationDelay: '90ms' }}>
            {ticket}
          </div>

          {/* Persuade */}
          <div className="animate-rise flex flex-col gap-7 px-6 pb-10 pt-2 sm:px-10 lg:col-start-1 lg:row-start-2 lg:px-14 lg:pb-14" style={{ animationDelay: '150ms' }}>
            <section className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <h2 className={cx(DISPLAY, 'text-[clamp(22px,4vw,27px)] text-ink')}>Is this your restaurant?</h2>
                <p className="max-w-[46ch] text-[14.5px] leading-relaxed text-ink-2">
                  Your Feastox menu is already set up — this order just proved it works. Claim it to run your menu, prices and orders your way.
                </p>
              </div>
              <div className="mt-1 flex flex-col gap-2.5">
                <button type="button" onClick={() => setClaiming(true)} className={cx(ACTION, 'cursor-pointer bg-flame text-white shadow-flame')}>
                  Claim this restaurant <ArrowUpRight size={16} />
                </button>
                <Link to="/admin/signin" className={cx(ACTION, 'bg-transparent text-ink ring-1 ring-hairline-strong ring-inset hover:bg-surface-2')}>
                  Already claimed? Sign in
                </Link>
              </div>
            </section>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline pt-5 text-[13px]">
              <button type="button" onClick={() => setOpen(false)} className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-ink-2 transition-colors hover:text-ink">
                Explore the menu <ArrowUpRight size={15} />
              </button>
              <a href={CONTACT_URL} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 font-semibold text-ink-3 transition-colors hover:text-ink">
                <WhatsApp size={15} /> Questions? Talk to us
              </a>
            </div>
          </div>
        </div>
        {claiming && (
          <div className="fixed inset-0 z-10 flex items-end justify-center bg-ink/45 p-0 sm:items-center sm:p-6" onClick={() => setClaiming(false)} onKeyDown={(e) => e.key === 'Escape' && setClaiming(false)}>
            <div role="dialog" aria-modal="true" aria-label="Claim this restaurant" onClick={(e) => e.stopPropagation()} className="animate-rise flex w-full max-w-[460px] flex-col gap-5 rounded-t-3xl bg-surface p-6 pb-[calc(1.5rem+var(--safe-b))] shadow-[0_30px_80px_-30px_rgb(38_26_14/0.5)] ring-1 ring-hairline ring-inset sm:rounded-3xl">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                  <h2 className={cx(DISPLAY, 'text-[24px] text-ink')}>Claim {restaurantName || 'this restaurant'}</h2>
                  <p className="text-[14.5px] leading-relaxed text-ink-2">It takes about two minutes. We confirm it's really you, then the menu, prices and orders are yours to run.</p>
                </div>
                <button type="button" onClick={() => setClaiming(false)} aria-label="Close" className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink">
                  <X size={17} />
                </button>
              </div>
              <div className="flex flex-col gap-2.5">
                <a autoFocus href={`/claim?r=${encodeURIComponent(slug ?? '')}&n=${encodeURIComponent(restaurantName ?? '')}`} target="_blank" rel="noopener" className={cx(ACTION, 'bg-flame text-white shadow-flame')}>
                  Claim it now <ArrowUpRight size={16} />
                </a>
                <a href="/" target="_blank" rel="noopener" className={cx(ACTION, 'bg-transparent text-ink ring-1 ring-hairline-strong ring-inset hover:bg-surface-2')}>
                  Learn more about Feastox
                </a>
              </div>
              <p className="text-center text-[12.5px] text-ink-3">Opens in a new tab, so your order stays right here.</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (pitch === 'sheet' && open) {
    return (
      <div className="fixed inset-0 z-80 flex items-end justify-center bg-black/45" onClick={() => setOpen(false)}>
        <div role="dialog" aria-label="About Feastox" onClick={(e) => e.stopPropagation()} className="animate-rise flex w-full max-w-[560px] flex-col gap-4 rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+var(--safe-b))] ring-1 ring-hairline ring-inset">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-flame-1"><Sparkle size={13} /> You just got an order</span>
              <b className={cx(DISPLAY, 'text-[22px]')}>This order came from your own Feastox menu</b>
            </div>
            {close}
          </div>
          {order && <pre className="max-h-[40dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-2xl bg-surface-2 p-3.5 font-mono text-[12.5px] leading-[1.7] text-ink">{linkedOrder(order)}</pre>}
          {order && <div className="rounded-2xl bg-flame-2/10 p-4 ring-1 ring-flame-2/25 ring-inset">{nextSteps}</div>}
          <ul className="flex flex-col gap-1.5 text-[14px] text-ink-2">
            <li>• Customers browse and order from a link or QR, no app to install</li>
            <li>• Orders land in WhatsApp now, or in a live dashboard with tables, kitchen and billing</li>
            <li>• Menu, prices and stock stay in your control</li>
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row">
            {contact(cx(BTN_FLAME, 'flex-1'))}
            <button type="button" onClick={() => setOpen(false)} className={cx(BTN_GHOST, 'flex-1 cursor-pointer')}>
              Explore the menu <ArrowUpRight size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 bg-flame px-4 py-2.5 text-white">
      <Sparkle size={16} className="shrink-0" />
      <p className="min-w-0 flex-1 text-[13px] leading-snug"><b>Your order came through Feastox.</b> Claim your menu to manage it.</p>
      {order && <button type="button" onClick={() => setOpen(true)} className="shrink-0 cursor-pointer text-[13px] font-bold underline underline-offset-2">View order</button>}
      <a href={CONTACT_URL} target="_blank" rel="noopener" className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-[13px] font-bold text-flame-1">Talk to us</a>
      <button type="button" onClick={() => setOpen(false)} aria-label="Dismiss" className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full hover:bg-white/15"><X size={15} /></button>
    </div>
  );
}

/** Shown on the public page of a restaurant we set up that its owner hasn't claimed yet. */
export function UnclaimedBanner({ restaurant }: { restaurant: { name: string; slug: string; claimed?: boolean; googleUrl?: string | null } }) {
  const [params] = useSearchParams();
  if (restaurant.claimed !== false || params.get('ref') === 'order') return null; // `?ref=order` has its own pitch above
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-surface-2 px-4 py-2.5 text-[13px] text-ink-2">
      <p className="min-w-0 flex-1 leading-snug">
        <b className="text-ink">Is this your restaurant?</b> It hasn't been claimed yet.
        {restaurant.googleUrl && (
          <>
            {' '}
            <a href={restaurant.googleUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">View on Google</a>
          </>
        )}
      </p>
      <Link to={`/claim?r=${encodeURIComponent(restaurant.slug)}&n=${encodeURIComponent(restaurant.name)}`} className="shrink-0 rounded-full bg-flame px-3.5 py-1.5 font-bold text-white">
        Claim it
      </Link>
    </div>
  );
}
