import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatMoney } from '../../domain/money';
import { hueOf } from '../../components/admin/CustomerSheet';
import { ADMIN_GHOST, Empty, Loading } from '../../components/admin/kit';
import { ChevronRight, Plate } from '../../components/icons';
import { useAuth } from '../../state/AuthContext';
import { DISPLAY, cx } from '../../components/ui';
import { Hero, TrendPill, by, isRising, isSlipping, useDishRows } from './dishRows';
import type { Row } from './dishRows';

/** Needs at least this many selling dishes before "sells well and earns well" means anything. */
const MIN_FOR_STARS = 4;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The page answers "what should I do?" in four plain sections instead of one list to filter. */
export function DishPerformance() {
  const { rows, days, setDays, sales, currency } = useDishRows();
  const { allows } = useAuth();

  if (sales.error && !sales.data) return <Empty emoji="⚠️" title="Couldn't load dish performance" message={sales.error.message} action={<button type="button" className={ADMIN_GHOST} onClick={sales.reload}>Try again</button>} />;
  if (!sales.data) return <Loading label="Counting what sold…" />;

  // Every dish lands in one section: moving beats holding, because a slide is the thing to act on.
  const selling = rows.filter((r) => r.units > 0);
  const slipping = selling.filter(isSlipping).sort(by((r) => -r.trend.delta));
  const climbing = selling.filter((r) => !isSlipping(r) && isRising(r)).sort(by((r) => r.trend.delta));
  const rest = selling.filter((r) => !isSlipping(r) && !isRising(r));
  const unitsMid = median(selling.map((r) => r.units));
  const moneyMid = median(selling.map((r) => r.revenue));
  const isStar = (r: Row) => selling.length >= MIN_FOR_STARS && r.units >= unitsMid && r.revenue >= moneyMid;
  const stars = rest.filter(isStar).sort(by((r) => r.units));
  const others = rest.filter((r) => !isStar(r)).sort(by((r) => r.units));
  const idle = rows.filter((r) => r.units === 0).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-6xl">
      <Hero rows={rows} days={days} setDays={setDays} currency={currency} />

      <div className={cx('mt-12 grid gap-6 transition-opacity duration-200', sales.loading && 'opacity-50')}>
        <Story title="Holding strong" verdict="Sell well and earn well. Keep them on the menu and easy to find." rows={stars} currency={currency} delay={240} big />
        <Story title="Climbing" verdict={`Selling more than in the ${days} days before. Worth making sure you never run out.`} rows={climbing} currency={currency} delay={300} />
        <Story title="Slipping" verdict="Selling less than before. Was it sold out, did the price change, or is the photo letting it down?" rows={slipping} currency={currency} delay={360} tone="warn" />

        {others.length > 0 && (
          <details className="group animate-rise rounded-3xl bg-surface px-5 py-5 ring-1 ring-hairline ring-inset [animation-delay:420ms] sm:px-6">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 outline-none focus-visible:ring-2 focus-visible:ring-flame-2">
              <span className={cx(DISPLAY, 'text-[24px]')}>Everything else that sold <span className="text-ink-3 tnum">({others.length})</span></span>
              <span className="text-[13px] font-semibold text-ink-3 group-open:hidden">Show</span>
            </summary>
            <Lines rows={others} currency={currency} className="mt-4" />
          </details>
        )}

        {idle.length > 0 && (
          <section className="animate-rise rounded-3xl bg-surface-2/60 px-5 py-5 ring-1 ring-hairline ring-inset [animation-delay:480ms] sm:px-6">
            <h2 className={cx(DISPLAY, 'text-[24px]')}>On the menu, not selling</h2>
            <p className="mt-1 text-[14.5px] text-ink-3">Nobody paid for these in the last {days} days — try a promotion, a better photo, or take them off.</p>
            <p className="mt-4 text-[16px] font-medium leading-relaxed text-ink-2">{idle.map((r, i) => (
              <span key={r.id}>{i > 0 && ' · '}<Link to={`/admin/menu/${r.id}`} className="hover:text-ink hover:underline">{r.name}</Link></span>
            ))}</p>
          </section>
        )}

        {selling.length === 0 && idle.length === 0 && <p className="py-10 text-center text-[15px] text-ink-3">No dishes yet.</p>}
      </div>

      {allows('inventory:view') && (
        <p className="mt-8 text-[14.5px] text-ink-3">
          Want to know what each dish earns after food cost?{' '}
          <Link to="/admin/dish-margins" className="inline-flex items-center gap-0.5 font-semibold text-flame-1 hover:underline">
            See dish margins <ChevronRight size={14} />
          </Link>
        </p>
      )}
    </div>
  );
}

function Story({ title, verdict, rows, currency, delay, tone, big }: { title: string; verdict: string; rows: Row[]; currency: string; delay: number; tone?: 'warn'; big?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <section className={cx('animate-rise rounded-3xl px-5 py-5 ring-1 ring-inset sm:px-6', tone === 'warn' ? 'bg-berry/10 ring-berry/30' : 'bg-surface ring-hairline')} style={{ animationDelay: `${delay}ms` }}>
      <h2 className={cx(DISPLAY, 'text-[28px]')}>{title}</h2>
      <p className="mb-4 mt-1 max-w-[60ch] text-[14.5px] leading-relaxed text-ink-3">{verdict}</p>
      <Lines rows={rows} currency={currency} big={big} />
    </section>
  );
}

/** The dish's own photo; a tinted plate when it has none, so the rows still line up. */
function Thumb({ row: r, big }: { row: Row; big?: boolean }) {
  return (
    <span className="row-span-2 grid aspect-square w-(--thumb) place-items-center self-start overflow-hidden rounded-2xl ring-1 ring-hairline-strong ring-inset transition-transform duration-300 ease-out-quart group-hover:scale-105 sm:row-span-1 sm:self-center" style={{ background: `oklch(0.34 0.07 ${hueOf(r.name)})` }}>
      {r.imageUrl ? <img src={r.imageUrl} alt="" loading="lazy" className="size-full object-cover" /> : <Plate size={big ? 32 : 24} className="text-white/35" />}
    </span>
  );
}

function Lines({ rows, currency, className, big }: { rows: Row[]; currency: string; className?: string; big?: boolean }): ReactNode {
  return (
    <ul className={className} style={{ '--thumb': big ? '5rem' : '3.5rem' } as CSSProperties}>
      {rows.map((r) => (
        <li key={r.id} className="group grid grid-cols-[var(--thumb)_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-hairline py-3.5 first:pt-0 last:border-0 last:pb-0 sm:grid-cols-[var(--thumb)_minmax(0,1fr)_auto_7.5rem] sm:gap-x-5">
          <Thumb row={r} big={big} />
          <p className={cx(DISPLAY, 'truncate text-[20px] font-semibold text-ink-2 transition-[translate] duration-300 ease-out-quart group-hover:translate-x-1 group-hover:text-ink')}>
            <Link to={`/admin/menu/${r.id}`} className="hover:underline">{r.name}</Link>
          </p>
          <p className="col-start-2 text-[14.5px] text-ink-3 tnum sm:col-start-auto sm:text-right">
            <span className="font-semibold text-ink">{r.units} sold</span> · {formatMoney(r.revenue, currency)}
            {r.previous !== null && r.trend.kind !== 'quiet' && <span className="block">was {r.previous} before</span>}
          </p>
          <div className="col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto">
            <TrendPill trend={r.trend} previous={r.previous} />
          </div>
        </li>
      ))}
    </ul>
  );
}
