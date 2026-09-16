import { Link } from 'react-router-dom';
import { resetDemoData } from '../api/client';
import { demoEntry, getRestaurant } from '../api/diner';
import { funnel } from '../domain/analytics';
import { useAsync } from '../state/useAsync';
import { Skeleton } from '../components/Bits';
import { RatingPill } from '../components/Rating';
import { BTN, BTN_QUIET, BTN_SIZE_LG, DISPLAY, SHELL, cx } from '../components/ui';
import { Qr, Sparkle } from '../components/icons';

const LOOP = ['Discover', 'Order', 'Eat', 'Rate'];

/**
 * Stands in for the physical QR code on the table. In production the diner
 * lands straight on /r/:slug/t/:token and never sees this screen.
 */
export function Entry() {
  // Whichever source is configured names the table this opens — and the
  // restaurant on the card, so the two can never disagree.
  const entry = demoEntry();
  const restaurant = useAsync(async () => (entry ? getRestaurant(entry.slug) : null), [entry?.slug]).data;
  const { dishDecisionRate, counts } = funnel();

  return (
    <main className={cx(SHELL, 'relative overflow-hidden')}>
      <div
        className="pointer-events-none absolute -top-45 left-1/2 h-105 w-115 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(255_138_61_/_0.3),transparent_66%)] blur-[10px] lg:left-1/4"
        aria-hidden
      />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 pb-[calc(30px+var(--safe-b))] pt-[calc(58px+var(--safe-t))] sm:px-6 lg:grid lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8 lg:py-16">
        {/* ── Pitch ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <span className="inline-flex w-fit animate-rise items-center gap-1.5 rounded-full bg-flame-2/14 py-1.5 pl-3 pr-3.5 text-[13px] font-bold text-flame-1 ring-1 ring-flame-2/35 ring-inset">
            <Sparkle size={15} />
            myfood
          </span>
          <h1 className={cx(DISPLAY, 'animate-rise text-[clamp(34px,11vw,44px)] lg:text-6xl')} style={{ animationDelay: '60ms' }}>
            Stop guessing
            <br />
            what to order.
          </h1>
          <p
            className="max-w-[38ch] animate-rise text-[15px] leading-relaxed text-ink-3 lg:text-lg"
            style={{ animationDelay: '120ms' }}
          >
            Every rating here comes from someone who actually ate the dish at this table. No installs, no account.
          </p>

          <div className="mt-2 hidden lg:flex lg:flex-wrap lg:gap-2">
            {LOOP.map((step, i) => (
              <span key={step} className="inline-flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-4">
                {step}
                {i < LOOP.length - 1 && <i className="not-italic text-flame-3/70">→</i>}
              </span>
            ))}
          </div>
        </div>

        {/* ── The "table" ───────────────────────────────────────── */}
        <div className="flex flex-col gap-3 lg:mx-auto lg:w-full lg:max-w-md">
          <div
            className="animate-rise-slow overflow-hidden rounded-4xl bg-surface shadow-deep ring-1 ring-hairline ring-inset"
            style={{ animationDelay: '180ms' }}
          >
            <div className="relative hidden h-52 lg:block">
              {restaurant?.coverImageUrl ? (
                <img src={restaurant.coverImageUrl} alt="" className="size-full object-cover" />
              ) : (
                <div className="size-full bg-surface-2" aria-hidden />
              )}
              <span className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent" aria-hidden />
            </div>

            <div className="flex items-center gap-3.5 p-4">
              <span className="grid size-13.5 shrink-0 place-items-center rounded-2xl bg-flame-dim text-flame-1 ring-1 ring-flame-2/35 ring-inset lg:hidden">
                <Qr size={30} />
              </span>
              <div className="min-w-0 flex-1">
                {restaurant ? (
                  <b className="block text-[16px] font-semibold tracking-tight lg:text-xl">{restaurant.name}</b>
                ) : (
                  <Skeleton className="h-5 w-40" />
                )}
                <span className="text-[13px] text-ink-3">Scan simulated</span>
              </div>
              {restaurant && restaurant.ratingCount > 0 && (
                <span className="hidden lg:block">
                  <RatingPill rating={restaurant.avgRating} count={restaurant.ratingCount} />
                </span>
              )}
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-2 lg:mt-0">
            {entry ? (
              <Link
                to={`/r/${entry.slug}/t/${entry.tableToken}`}
                className={cx(BTN, BTN_SIZE_LG, 'w-full bg-flame text-ember shadow-flame')}
              >
                Open the menu
              </Link>
            ) : (
              // Live, with no table configured: say which knob is missing rather
              // than sending the diner to a table that cannot resolve.
              <div className="rounded-2xl bg-surface-2 px-4 py-3.5 text-[13px] leading-relaxed text-ink-3 ring-1 ring-hairline ring-inset">
                <b className="text-ink-2">No table configured.</b> Set <code>VITE_DEMO_SLUG</code> and{' '}
                <code>VITE_DEMO_TABLE_TOKEN</code> in <code>.env.local</code> to open a seeded table — see{' '}
                <code>.env.example</code>.
              </div>
            )}
            <div className="flex items-center justify-center gap-1 lg:justify-start">
              <Link to="/admin" className={BTN_QUIET}>
                Restaurant dashboard
              </Link>
              <span className="text-ink-4" aria-hidden>
                ·
              </span>
              <button
                type="button"
                className={BTN_QUIET}
                onClick={() => {
                  resetDemoData();
                  window.location.reload();
                }}
              >
                Reset demo data
              </button>
            </div>
          </div>

          <div className="mt-2 text-center lg:text-left">
            <div className="inline-flex gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-4 lg:hidden">
              {LOOP.map((step, i) => (
                <span key={step}>
                  {step}
                  {i < LOOP.length - 1 && <i className="ml-1.5 not-italic text-flame-3/70">→</i>}
                </span>
              ))}
            </div>
            {dishDecisionRate !== null && (
              <p className="mt-3 text-[11.5px] leading-relaxed text-ink-4">
                Dish decision rate this session: <b className="text-flame-1 tnum">{Math.round(dishDecisionRate * 100)}%</b>{' '}
                <span className="opacity-75">
                  ({counts.dish_added_to_cart ?? 0} of {counts.dish_detail_viewed ?? 0} dish pages led to an add)
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
