import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { cx } from '../../components/ui';
import { Bag, Receipt, Check, Plate, Qr, Search, Star } from '../../components/icons';
import { Band, DISPLAY_LG, LEAD, Mark, RAIL, SplitHeading } from './kit';
import { gsap, prefersReducedMotion, useReveal } from './motion';
import { HERO_DISH, MENU_DISHES } from './data';

interface Step {
  key: string;
  icon: typeof Qr;
  label: string;
  detail: string;
  screen: ReactNode;
}

/** A small slab of product UI standing in for the screen at each step. */
function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('mt-5 flex-1 rounded-[14px] bg-surface-2/70 p-3.5 ring-1 ring-hairline ring-inset', className)}>
      {children}
    </div>
  );
}

const STEPS: Step[] = [
  {
    key: 'scan',
    icon: Qr,
    label: 'Scan',
    detail: 'The code on the table opens the menu in the browser the phone already has. Nothing to install.',
    screen: (
      <Screen className="grid place-items-center">
        <div className="flex flex-col items-center gap-2">
          <span className="grid size-[76px] place-items-center rounded-[12px] bg-ink text-bg">
            <Qr size={48} />
          </span>
          <span className="label text-ink-4">Table 12 · Terrace</span>
        </div>
      </Screen>
    ),
  },
  {
    key: 'discover',
    icon: Search,
    label: 'Discover',
    detail: 'Every dish arrives already carrying its rating, its reorder rate and what diners said about it.',
    screen: (
      <Screen>
        <div className="flex flex-col gap-2">
          {MENU_DISHES.slice(1, 4).map((dish, i) => (
            <div key={dish.name} className="flex items-center gap-2.5">
              <img src={dish.image} alt="" width={120} height={120} loading="lazy" className="size-9 shrink-0 rounded-[8px] object-cover" />
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-2">{dish.name}</span>
              <span
                className={cx(
                  'flex shrink-0 items-center gap-1 font-mono text-[11px] font-bold tabular-nums',
                  i === 0 ? 'text-gold-ink' : 'text-ink-4',
                )}
              >
                <Star size={9} className="text-gold" />
                {dish.rating}
              </span>
            </div>
          ))}
        </div>
      </Screen>
    ),
  },
  {
    key: 'choose',
    icon: Plate,
    label: 'Choose',
    detail: 'Taste, portion and value are scored separately, so the debate at the table ends in about ten seconds.',
    screen: (
      <Screen>
        <div className="flex flex-col gap-2.5">
          {(
            [
              ['Taste', HERO_DISH.taste],
              ['Portion', HERO_DISH.portion],
              ['Value', HERO_DISH.value],
            ] as const
          ).map(([label, v]) => (
            <div key={label} className="grid grid-cols-[48px_1fr_24px] items-center gap-2.5">
              <span className="text-[11.5px] text-ink-3">{label}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                <span className="block h-full rounded-full bg-flame" style={{ width: `${(v / 5) * 100}%` }} />
              </span>
              <span className="text-right font-mono text-[11.5px] font-bold tabular-nums text-ink">{v}</span>
            </div>
          ))}
          <p className="mt-0.5 text-[11.5px] font-semibold text-mint-ink">89% would order it again</p>
        </div>
      </Screen>
    ),
  },
  {
    key: 'order',
    icon: Bag,
    label: 'Order',
    detail: 'Cart, checkout, sent — from the table, without flagging anybody down.',
    screen: (
      <Screen>
        <div className="flex flex-col gap-1.5 text-[12px] text-ink-2">
          <div className="flex justify-between gap-2">
            <span>2 × Chicken Sekuwa</span>
            <span className="font-mono tabular-nums text-ink">900</span>
          </div>
          <div className="flex justify-between gap-2">
            <span>1 × Buff Jhol Momo</span>
            <span className="font-mono tabular-nums text-ink">320</span>
          </div>
          <div className="mt-1.5 flex justify-between gap-2 border-t border-hairline pt-2 font-semibold">
            <span className="text-ink-3">Total</span>
            <span className="font-mono tabular-nums text-ink">Rs. 1,220</span>
          </div>
          <span className="mt-1.5 grid h-7 place-items-center rounded-full bg-flame text-[11.5px] font-bold text-white">
            Place order
          </span>
        </div>
      </Screen>
    ),
  },
  {
    key: 'kitchen',
    icon: Receipt,
    label: 'Kitchen',
    detail: 'The ticket lands on the pass the second it is placed, in the order the tables placed them.',
    screen: (
      <Screen>
        <div className="flex flex-col gap-2">
          {[
            ['#2418', 'Table 12', 'New', 'bg-flame text-white'],
            ['#2417', 'Table 4', 'Cooking', 'bg-gold/20 text-gold-ink'],
            ['#2416', 'Table 9', 'Ready', 'bg-mint/15 text-mint-ink'],
          ].map(([id, table, status, tone]) => (
            <div key={id} className="flex items-center gap-2.5 rounded-[10px] bg-surface px-2.5 py-2 ring-1 ring-hairline ring-inset">
              <span className="font-mono text-[11px] font-bold text-ink-3">{id}</span>
              <span className="flex-1 text-[11.5px] text-ink-2">{table}</span>
              <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold', tone)}>{status}</span>
            </div>
          ))}
        </div>
      </Screen>
    ),
  },
  {
    key: 'serve',
    icon: Check,
    label: 'Serve',
    detail: 'The table watches it move, and afterwards rates exactly the dishes it actually ate.',
    screen: (
      <Screen className="grid place-items-center">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-mint/15 text-mint-ink">
            <Check size={20} />
          </span>
          <span className="text-[12px] font-semibold text-ink">Served · 7:58 pm</span>
          <span className="flex gap-0.5 text-gold" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} size={13} />
            ))}
          </span>
          <span className="text-[11px] text-ink-4">Rate the dishes you ordered</span>
        </div>
      </Screen>
    ),
  },
];

/**
 * Scan to served, as one horizontal move.
 *
 * On a laptop the band pins and the six steps travel sideways with the
 * scroll — the shape of the journey is the shape of the section. Below that
 * there is no room for a horizontal track, so the same six steps stack into a
 * vertical chain with a connecting rule, which is also what a visitor gets
 * under reduced motion or with JavaScript unavailable.
 */
export function OrderingFlow() {
  const ref = useReveal<HTMLElement>();
  const trackRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    const pin = pinRef.current;
    if (!track || !pin || prefersReducedMotion()) return;

    const mm = gsap.matchMedia();

    mm.add('(min-width: 1024px)', () => {
      const distance = () => Math.max(0, track.scrollWidth - pin.clientWidth);

      const tween = gsap.to(track, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: {
          trigger: pin,
          start: 'center center',
          end: () => `+=${distance() + window.innerHeight * 0.4}`,
          pin: true,
          scrub: 0.8,
          invalidateOnRefresh: true,
          anticipatePin: 1,
        },
      });

      return () => tween.kill();
    });

    return () => mm.revert();
  }, []);

  return (
    <Band id="how-it-works" ref={ref} className="overflow-hidden bg-stock">
      {/* The heading travels with the track: it is pinned alongside it, so the
          claim stays on screen for the whole of the move it describes. */}
      <div ref={pinRef} className="lg:flex lg:min-h-[74vh] lg:flex-col lg:justify-center">
        <div className={cx(RAIL, 'flex flex-col gap-8 lg:grid lg:grid-cols-12')}>
          <div className="lg:col-span-7">
            <Mark n="05">How it works</Mark>
            <SplitHeading
              text="From QR scan to kitchen, without the friction."
              className={cx(DISPLAY_LG, 'mt-6 text-ink')}
            />
          </div>
          <p data-reveal className={cx(LEAD, 'lg:col-span-4 lg:col-start-9 lg:self-end')}>
            Six steps, one phone, no download. The only thing the table has to bring is the phone in its pocket.
          </p>
        </div>

        {/* Laptops and up: a horizontal track that scrubs with the scroll. */}
        <div className="mt-12 hidden overflow-hidden lg:block">
          <div ref={trackRef} className="flex w-max items-stretch gap-5 pl-[max(3rem,calc((100vw-1200px)/2+3rem))] pr-24">
            {STEPS.map((step, i) => (
              <FlowCard key={step.key} step={step} index={i} className="w-[330px]" />
            ))}
          </div>
        </div>

        {/* Below a laptop: the same six steps, vertically. */}
        <div className={cx(RAIL, 'mt-12 flex flex-col gap-4 lg:hidden')} data-reveal-group="flow">
          {STEPS.map((step, i) => (
            <div key={step.key} data-reveal className="relative">
              <FlowCard step={step} index={i} />
              {i < STEPS.length - 1 && <span className="mx-auto mt-4 block h-5 w-px bg-hairline-strong" aria-hidden />}
            </div>
          ))}
        </div>
      </div>
    </Band>
  );
}

function FlowCard({ step, index, className }: { step: Step; index: number; className?: string }) {
  const Icon = step.icon;
  return (
    <article
      className={cx(
        'flex shrink-0 flex-col rounded-[20px] bg-surface p-5 shadow-lift ring-1 ring-hairline ring-inset sm:p-6',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-flame-2/10 text-flame-1 ring-1 ring-flame-2/25 ring-inset">
          <Icon size={18} />
        </span>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[11px] font-bold text-ink-4">0{index + 1}</span>
          <h3 className="font-display text-[20px] font-semibold tracking-tight text-ink">{step.label}</h3>
        </div>
      </div>
      <p className="mt-3 max-w-[38ch] text-[13.5px] leading-relaxed text-ink-3">{step.detail}</p>
      {step.screen}
    </article>
  );
}
