import { cx } from '../../components/ui';
import { Check, Plus, Sliders, Star } from '../../components/icons';
import { Band, DISPLAY_LG, LEAD, Mark, Panel, PanelBar, RAIL, SplitHeading } from './kit';
import { useReveal } from './motion';

const ROWS = [
  { name: 'Chicken Sekuwa', price: '450', image: '/img/chicken-sekuwa.jpg', available: true, featured: true, rating: 4.8 },
  { name: 'Mutton Sekuwa', price: '620', image: '/img/mutton-sekuwa.jpg', available: true, featured: false, rating: 4.6 },
  { name: 'Peri Peri Wings', price: '390', image: '/img/peri-wings.jpg', available: true, featured: false, rating: 4.4 },
  { name: 'Crispy Calamari', price: '480', image: '/img/calamari.jpg', available: false, featured: false, rating: 3.9 },
];

const CAPABILITIES = [
  ['Add a dish', 'Name, photo, price, category. Under a minute, from a phone on the floor.'],
  ['Sell out mid-service', 'One tap and it greys out on every table in the room, instantly.'],
  ['Feature tonight’s special', 'Pin it to the top of the menu for the evening and unpin it after.'],
  ['Reorder anything', 'Drag categories and dishes into the order you want people to read them.'],
];

/**
 * The owner's side of the menu. A working admin table — drag handles, a live
 * availability switch, the featured pin — rather than a screenshot of one,
 * so the interface can be judged on how little work it looks like.
 */
export function MenuManagement() {
  const ref = useReveal<HTMLElement>();

  return (
    <Band ref={ref} className="bg-stock">
      <div className={cx(RAIL, 'flex flex-col gap-12 lg:grid lg:grid-cols-12 lg:gap-10')}>
        <div className="lg:col-span-5">
          <Mark n="07">Menu management</Mark>
          <SplitHeading
            text="Your menu changes. Your digital menu should too."
            className={cx(DISPLAY_LG, 'mt-6 text-ink')}
          />
          <p data-reveal className={cx(LEAD, 'mt-6 max-w-[42ch]')}>
            No ticket to a web developer. No waiting for next week’s print run. Whatever changes on the line changes
            on every table’s screen before the next order comes in.
          </p>

          <dl className="mt-9 flex flex-col" data-reveal-group="caps">
            {CAPABILITIES.map(([term, desc]) => (
              <div key={term} data-reveal className="border-t border-hairline py-4 last:border-b">
                <dt className="flex items-center gap-2.5 text-[15px] font-semibold text-ink">
                  <Check size={15} className="shrink-0 text-flame-2" />
                  {term}
                </dt>
                <dd className="mt-1 pl-[26px] text-[13.5px] leading-relaxed text-ink-3">{desc}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div data-reveal className="lg:col-span-6 lg:col-start-7 lg:self-center">
          <Panel>
            <PanelBar
              title={<>Menu · Sekuwa &amp; grills</>}
              right={
                <span className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-full text-ink-3 ring-1 ring-hairline ring-inset">
                    <Sliders size={13} />
                  </span>
                  <span className="inline-flex h-7 items-center gap-1 rounded-full bg-flame px-2.5 text-[11.5px] font-bold text-white">
                    <Plus size={12} /> Add dish
                  </span>
                </span>
              }
            />

            <div className="flex flex-col divide-y divide-hairline">
              {ROWS.map((row) => (
                <div
                  key={row.name}
                  className={cx(
                    'group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60 sm:px-5',
                    !row.available && 'opacity-55',
                  )}
                >
                  <span
                    className="flex shrink-0 flex-col gap-[3px] text-ink-4 opacity-40 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  >
                    <span className="block h-px w-3 bg-current" />
                    <span className="block h-px w-3 bg-current" />
                    <span className="block h-px w-3 bg-current" />
                  </span>

                  <img
                    src={row.image}
                    alt=""
                    width={140}
                    height={140}
                    loading="lazy"
                    className="size-11 shrink-0 rounded-[10px] object-cover"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13.5px] font-semibold text-ink">{row.name}</span>
                      {row.featured && (
                        <span className="shrink-0 rounded-full bg-gold/18 px-1.5 py-[2px] text-[9.5px] font-bold text-gold-ink">
                          Featured
                        </span>
                      )}
                    </div>
                    <span className="flex items-center gap-2 text-[11.5px] text-ink-4">
                      <span className="flex items-center gap-1">
                        <Star size={9} className="text-gold" />
                        {row.rating}
                      </span>
                      {!row.available && <span className="font-medium text-berry-ink">Sold out</span>}
                    </span>
                  </div>

                  <span className="flex shrink-0 items-center gap-1 rounded-[8px] bg-surface-2 px-2 py-1 font-mono text-[12.5px] font-semibold tabular-nums text-ink ring-1 ring-hairline ring-inset">
                    <span className="text-[10px] text-ink-4">Rs.</span>
                    {row.price}
                  </span>

                  {/* Availability — the switch a manager hits mid-service. */}
                  <span
                    role="img"
                    aria-label={row.available ? `${row.name} is available` : `${row.name} is sold out`}
                    className={cx(
                      'relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200',
                      row.available ? 'bg-flame' : 'bg-surface-3',
                    )}
                  >
                    <span
                      className={cx(
                        'absolute top-[3px] size-[18px] rounded-full bg-white shadow-sm transition-[left] duration-200 ease-out-quart',
                        row.available ? 'left-[19px]' : 'left-[3px]',
                      )}
                    />
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3 sm:px-5">
              <span className="text-[12px] text-ink-4">4 of 42 dishes · changes go live immediately</span>
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-mint-ink">
                <span className="size-1.5 rounded-full bg-mint" aria-hidden />
                Saved
              </span>
            </div>
          </Panel>
        </div>
      </div>
    </Band>
  );
}
