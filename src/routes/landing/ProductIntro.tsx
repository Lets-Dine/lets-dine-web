import type { ReactNode } from 'react';
import { cx } from '../../components/ui';
import { Check, Qr, Star } from '../../components/icons';
import { Band, DISPLAY_LG, DISPLAY_MD, LEAD, Mark, Panel, PanelBar, RAIL, SplitHeading } from './kit';
import { useReveal } from './motion';
import { CATEGORIES, HERO_DISH, MENU_DISHES, TOP_DISHES } from './data';

/**
 * The four things the platform is.
 *
 * Laid out as a numbered index rather than a row of feature cards: each
 * capability holds its own heading in place on the left while its product
 * panel scrolls past on the right, so a visitor reads one claim at a time and
 * sees the interface that backs it, instead of scanning four equal boxes.
 */
export function ProductIntro() {
  const ref = useReveal<HTMLElement>();

  return (
    <Band id="product" ref={ref} className="bg-stock">
      <div className={RAIL}>
        <div className="flex flex-col gap-8 lg:grid lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Mark n="02">The platform</Mark>
            <SplitHeading text="Turn your menu into a dining experience." className={cx(DISPLAY_LG, 'mt-6 text-ink')} />
          </div>
          <p data-reveal className={cx(LEAD, 'lg:col-span-4 lg:col-start-9 lg:self-end')}>
            Four parts, one system. Each one feeds the next — which is what makes the last one worth having.
          </p>
        </div>

        <div className="mt-16 flex flex-col gap-20 lg:mt-24 lg:gap-32">
          <Capability
            n="01"
            title="Digital menu"
            body="Photos, prices, categories and availability that change the moment your kitchen changes its mind. Every table sees the same menu, and it is never the one from last season’s print run."
            points={['Photography on every dish', 'Sold out in one tap, live on every table', 'Categories you reorder yourself']}
          >
            <MenuPanel />
          </Capability>

          <Capability
            n="02"
            title="Table ordering"
            body="A scan opens the menu, the cart and the order on the table’s own phone. Nothing to download, no account to make, no waiting to catch a server’s eye."
            points={['Works in the browser, on any phone', 'Straight to the kitchen pass', 'Live status back to the table']}
          >
            <OrderingPanel />
          </Capability>

          <Capability
            n="03"
            title="Dish intelligence"
            body="Every dish builds its own reputation — taste, portion and value, scored separately, plus whether the table would order it again. A rating on a restaurant tells you very little. A rating on a plate tells you what to cook more of."
            points={['Taste, portion and value, scored apart', 'Tags counted from what diners wrote', 'Reorder rate per dish']}
          >
            <IntelligencePanel />
          </Capability>

          <Capability
            n="04"
            title="Restaurant insights"
            body="What sells, what gets reordered, and what quietly stopped moving — dish by dish, before it turns into an empty dining room you can’t explain."
            points={['Orders, revenue and rating in one view', 'Dishes that need attention, flagged', 'What gets ordered together']}
          >
            <InsightsPanel />
          </Capability>
        </div>
      </div>
    </Band>
  );
}

function Capability({
  n,
  title,
  body,
  points,
  children,
}: {
  n: string;
  title: string;
  body: string;
  points: string[];
  children: ReactNode;
}) {
  return (
    <article className="flex flex-col gap-8 lg:grid lg:grid-cols-12 lg:gap-10" data-reveal-group={`cap-${n}`}>
      <div className="lg:col-span-4 lg:sticky lg:top-32 lg:self-start">
        <span data-reveal className="block font-display text-[52px] font-semibold leading-none tracking-[-0.04em] text-flame-2/30 lg:text-[72px]">
          {n}
        </span>
        <h3 data-reveal className={cx(DISPLAY_MD, 'mt-3 text-ink')}>
          {title}
        </h3>
        <p data-reveal className="mt-3.5 max-w-[42ch] text-[15px] leading-[1.62] text-ink-2">
          {body}
        </p>
        <ul data-reveal className="mt-5 flex flex-col gap-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-[13.5px] text-ink-3">
              <Check size={14} className="mt-[3px] shrink-0 text-flame-2" />
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div data-reveal className="lg:col-span-7 lg:col-start-6">
        {children}
      </div>
    </article>
  );
}

/* ── The four panels ──────────────────────────────────────────────
   All four are the same application: one radius, one hairline, one
   type scale, every figure in mono.                                 */

function MenuPanel() {
  return (
    <Panel>
      <PanelBar
        title="Menu · Sekuwa Ghar"
        right={<span className="label text-ink-4">42 dishes · 7 categories</span>}
      />
      <div className="flex gap-1.5 overflow-x-auto border-b border-hairline px-4 py-3 no-scrollbar sm:px-5">
        {CATEGORIES.map((c, i) => (
          <span
            key={c.name}
            className={cx(
              'shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-medium',
              i === 1 ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset',
            )}
          >
            {c.name}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-px bg-hairline sm:grid-cols-3">
        {MENU_DISHES.slice(0, 6).map((dish, i) => (
          <div key={dish.name} className={cx('min-w-0 bg-surface p-3', i >= 4 && 'hidden sm:block')}>
            <div className="relative overflow-hidden rounded-[10px]">
              <img
                src={dish.image}
                alt={dish.name}
                width={400}
                height={300}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
              {i === 0 && (
                <span className="absolute left-2 top-2 rounded-full bg-gold px-2 py-0.5 text-[9.5px] font-bold text-[#231703]">
                  Featured
                </span>
              )}
            </div>
            <div className="mt-2 truncate text-[12.5px] font-semibold tracking-tight text-ink">{dish.name}</div>
            <div className="mt-0.5 flex items-center justify-between">
              <span className="flex items-center gap-1 text-[11px] text-ink-3">
                <Star size={9.5} className="text-gold" />
                {dish.rating}
              </span>
              <span className="font-mono text-[11.5px] font-semibold tabular-nums text-ink-2">{dish.price}</span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

const ORDER_STEPS = [
  { label: 'Order placed', time: '7:41 pm', done: true },
  { label: 'Accepted by kitchen', time: '7:42 pm', done: true },
  { label: 'Cooking', time: '7:43 pm', done: true, active: true },
  { label: 'Served to table 12', time: '—', done: false },
];

function OrderingPanel() {
  return (
    <Panel>
      <PanelBar title="Order #2418 · Table 12" right={<span className="label text-flame-1">Cooking</span>} />
      <div className="grid gap-6 p-5 sm:grid-cols-[auto_1fr] sm:p-6">
        <div className="flex flex-col items-center gap-2.5">
          <div className="grid size-[104px] place-items-center rounded-[14px] bg-ink text-bg">
            <Qr size={62} />
          </div>
          <span className="label text-center text-ink-4">
            Table 12
            <br />
            Terrace
          </span>
        </div>

        <ol className="flex flex-col">
          {ORDER_STEPS.map((step, i) => (
            <li key={step.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cx(
                    'grid size-5 shrink-0 place-items-center rounded-full text-[10px]',
                    step.done ? 'bg-flame text-white' : 'bg-surface-3 text-ink-4',
                  )}
                  aria-hidden
                >
                  {step.done ? <Check size={11} /> : i + 1}
                </span>
                {i < ORDER_STEPS.length - 1 && (
                  <span className={cx('w-px flex-1', step.done ? 'bg-flame/40' : 'bg-hairline')} aria-hidden />
                )}
              </div>
              <div className={cx('flex flex-1 items-baseline justify-between gap-3 pb-5', i === ORDER_STEPS.length - 1 && 'pb-0')}>
                <span
                  className={cx(
                    'text-[13.5px]',
                    step.active ? 'font-semibold text-ink' : step.done ? 'text-ink-2' : 'text-ink-4',
                  )}
                >
                  {step.label}
                </span>
                <span className="font-mono text-[11.5px] tabular-nums text-ink-4">{step.time}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex items-center justify-between border-t border-hairline px-5 py-3.5 sm:px-6">
        <span className="text-[13px] text-ink-3">No app installed · opened in the browser</span>
        <span className="font-mono text-[13px] font-bold tabular-nums text-ink">Rs. 1,220</span>
      </div>
    </Panel>
  );
}

function IntelligencePanel() {
  const pct = Math.round(HERO_DISH.recommendRate * 100);
  return (
    <Panel>
      <PanelBar title={HERO_DISH.name} right={<span className="font-mono text-[13px] font-bold text-ink">{HERO_DISH.price}</span>} />
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[42px] font-bold leading-none tabular-nums tracking-tight text-ink">
                {HERO_DISH.rating}
              </span>
              <Star size={20} className="translate-y-[-4px] text-gold" />
            </div>
            <span className="mt-1.5 block text-[12.5px] text-ink-4">{HERO_DISH.ratingCount} verified ratings</span>
          </div>
          <div className="flex-1 min-w-[170px]">
            {(
              [
                ['Taste', HERO_DISH.taste],
                ['Portion', HERO_DISH.portion],
                ['Value', HERO_DISH.value],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="grid grid-cols-[56px_1fr_28px] items-center gap-3 py-[5px]">
                <span className="text-[12.5px] text-ink-3">{label}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                  <span className="block h-full rounded-full bg-flame" style={{ width: `${(value / 5) * 100}%` }} />
                </span>
                <span className="text-right font-mono text-[12.5px] font-bold tabular-nums text-ink">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-hairline pt-5">
          <span className="rounded-full bg-mint/12 px-3 py-1.5 text-[12.5px] font-bold text-mint-ink ring-1 ring-mint/25 ring-inset">
            {pct}% would order again
          </span>
          {HERO_DISH.tags.map(([tag, n]) => (
            <span
              key={tag}
              className="rounded-full bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-ink-2 ring-1 ring-hairline ring-inset"
            >
              {tag} <span className="font-mono tabular-nums text-ink-4">{n}</span>
            </span>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function InsightsPanel() {
  const max = Math.max(...TOP_DISHES.map((d) => d.orders));
  return (
    <Panel>
      <PanelBar title="Dish performance · last 30 days" right={<span className="label text-ink-4">Sekuwa Ghar</span>} />
      <div className="flex flex-col gap-px bg-hairline">
        {TOP_DISHES.map((dish, i) => (
          <div key={dish.name} className="grid grid-cols-[20px_1fr_auto] items-center gap-3 bg-surface px-5 py-3.5">
            <span className="font-mono text-[12px] font-bold text-ink-4">{i + 1}</span>
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-semibold text-ink">{dish.name}</div>
              <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                <span className="block h-full rounded-full bg-flame/70" style={{ width: `${(dish.orders / max) * 100}%` }} />
              </span>
            </div>
            <div className="text-right">
              <div className="font-mono text-[13px] font-bold tabular-nums text-ink">{dish.orders.toLocaleString('en-US')}</div>
              <div className="flex items-center justify-end gap-1 text-[11.5px] text-ink-4">
                <Star size={9} className="text-gold" />
                {dish.rating}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-hairline bg-surface-2/50 px-5 py-4">
        <span className="label text-flame-1">Needs attention</span>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
          Crispy Calamari has slipped to 3.9 across 41 ratings this month. Diners mention the portion twice as often
          as the taste.
        </p>
      </div>
    </Panel>
  );
}
