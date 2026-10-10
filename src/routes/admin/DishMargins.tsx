import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchMargins, loadMarginTarget, saveMarginTarget } from '../../api/inventory';
import type { DishMargin } from '../../api/inventory';
import { INPUT_BOX, Loading, Panel } from '../../components/admin/kit';
import { cx } from '../../components/ui';
import { formatMoney } from '../../domain/money';
import { useAsync } from '../../state/useAsync';
import { useDashboard } from './AdminLayout';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const label = (r: DishMargin) => (r.variantName ? `${r.name} · ${r.variantName}` : r.name);

/**
 * What each dish costs to make at the latest delivery prices, and what is left. A dish is flagged when
 * its margin falls under the target — and the row says which ingredient is the reason, so a price rise
 * is something you can act on rather than a number to puzzle over.
 */
export function DishProfitSection() {
  const { menu } = useDashboard();
  const currency = menu.restaurant.currency;
  const margins = useAsync(fetchMargins, []);
  const [target, setTarget] = useState(loadMarginTarget);

  if (margins.loading && !margins.data) return <Loading />;
  const rows = margins.data ?? [];
  const priced = rows.filter((r) => r.missing.length === 0);
  const thin = priced.filter((r) => r.margin * 100 < target);
  const healthy = priced.filter((r) => r.margin * 100 >= target);
  const unpriced = rows.filter((r) => r.missing.length > 0);

  const headline =
    thin.length > 0
      ? { tone: 'bad' as const, title: `${thin.length} dish${thin.length === 1 ? '' : 'es'} keep${thin.length === 1 ? 's' : ''} less than ${target}% of the price`, sub: 'Each shows what is eating the margin. A price rise on the main ingredient is the usual cause — raise the dish price, change the portion, or find a cheaper supplier.' }
      : priced.length > 0
        ? { tone: 'good' as const, title: `Every priced dish keeps at least ${target}%`, sub: 'Margins are worked out from your latest delivery prices, so this updates as prices move.' }
        : { tone: 'neutral' as const, title: 'Nothing to work out yet — a dish needs a recipe and ingredient prices', sub: 'A margin needs a recipe on the dish and a price on each ingredient. Prices come from the amount you enter when you receive a delivery.' };

  return (
    <section aria-labelledby="profit-h">
      <div className="mb-3 flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 id="profit-h" className="text-[18px] font-semibold tracking-tight">
            Dish profit
          </h2>
          <p className="mt-0.5 max-w-[62ch] text-[13.5px] leading-relaxed text-ink-3">
            What each dish costs to make at your latest delivery prices, and what it leaves you. {headline.title}.
          </p>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-ink-3">
          Warn me below
          <input
            className={cx(INPUT_BOX, 'h-10 w-20 py-0 text-center tnum')}
            inputMode="numeric"
            value={target}
            aria-label="Profit percent to warn below"
            onChange={(e) => {
              const n = Number.parseInt(e.target.value.replace(/\D/g, '') || '0', 10);
              const next = Math.min(95, n);
              setTarget(next);
              if (next >= 1) saveMarginTarget(next);
            }}
          />
          % left over
        </label>
      </div>

      <div className="grid gap-4">
        {thin.length > 0 && (
          <section aria-label="Dishes below target">
            <h3 className="mb-2 px-1 text-[13px] font-semibold text-berry-ink">Look at these first</h3>
            <MarginList rows={thin} currency={currency} tone="bad" />
          </section>
        )}
        {healthy.length > 0 && (
          <section aria-label="Dishes on target">
            <h3 className="mb-2 px-1 text-[13px] font-semibold text-ink-2">
              {thin.length > 0 ? 'On target' : 'Priced dishes'} <span className="font-normal text-ink-4">· {healthy.length}</span>
            </h3>
            <MarginList rows={healthy} currency={currency} tone="ok" />
          </section>
        )}
        {unpriced.length > 0 && (
          <section aria-label="Dishes missing prices">
            <h3 className="mb-2 px-1 text-[13px] font-semibold text-gold-ink">
              Missing ingredient prices <span className="font-normal text-ink-4">· {unpriced.length}</span>
            </h3>
            <div className="overflow-hidden rounded-2xl bg-docket-surface text-docket-ink ring-1 ring-hairline ring-inset">
              {unpriced.map((r) => (
                <div key={`${r.dishId}:${r.variantName ?? ''}`} className="border-b border-docket-line px-4 py-3.5 last:border-0 sm:px-5">
                  <span className="block text-[15px] font-semibold">{label(r)}</span>
                  <span className="block text-[12.5px] text-docket-inksoft">
                    No price yet for {r.missing.join(', ')}. Enter what you paid next time you receive it.
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
        <Panel variant="subtle">
          <p className="max-w-[68ch] text-[13px] leading-relaxed text-ink-3">
            Cost is the recipe at the price of each ingredient’s latest delivery. Add-ons aren’t included, and the target is saved on this device.{' '}
            <Link to="/admin/inventory" className="font-semibold text-flame-1">
              Receive deliveries on the Stock page.
            </Link>
          </p>
        </Panel>
      </div>
    </section>
  );
}

function MarginList({ rows, currency, tone }: { rows: DishMargin[]; currency: string; tone: 'bad' | 'ok' }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-docket-surface text-docket-ink ring-1 ring-hairline ring-inset">
      {rows.map((r) => {
        const top = r.drivers[0];
        const rising = r.drivers.find((d) => d.changeSincePrevious !== null && d.changeSincePrevious >= 0.05);
        return (
          <div key={`${r.dishId}:${r.variantName ?? ''}`} className="grid gap-2 border-b border-docket-line px-4 py-4 last:border-0 sm:px-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{label(r)}</span>
              <span className={cx('text-[17px] font-bold tnum', tone === 'bad' ? 'text-berry-ink' : 'text-docket-ink')}>{pct(r.margin)} left</span>
            </div>
            <div className="h-1.5 max-w-sm rounded-full bg-docket-line" role="img" aria-label={`${pct(r.margin)} of the price left`}>
              <div className={cx('h-full rounded-full', tone === 'bad' ? 'bg-berry' : 'bg-mint')} style={{ width: `${Math.max(2, Math.min(100, r.margin * 100))}%` }} />
            </div>
            <p className="text-[13px] text-docket-inksoft">
              Sells for <span className="tnum">{formatMoney(r.price, currency)}</span>, costs <span className="tnum">{formatMoney(r.cost, currency)}</span> to make
              {top && (
                <>
                  {' '}
                  — {top.ingredientName} is <span className="tnum">{pct(top.share)}</span> of that
                </>
              )}
              .
            </p>
            {tone === 'bad' && (
              <p className="text-[13px] text-docket-inksoft">
                What to do: raise the price, use a little less, or find a cheaper supplier.{' '}
                <Link to={`/admin/menu/${r.dishId}`} className="font-semibold text-flame-1">
                  Edit this dish
                </Link>
              </p>
            )}
            {rising && rising.changeSincePrevious !== null && (
              <p className="text-[13px] font-semibold text-gold-ink">
                {rising.ingredientName} is up <span className="tnum">{pct(rising.changeSincePrevious)}</span> since the delivery before.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
