import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DATA_CHANGED_EVENT } from '../../api/http';
import { ONBOARDING_ENABLED, fetchOnboarding } from '../../api/onboarding';
import type { OnboardingProgress, OnboardingStepKey } from '../../api/onboarding';
import type { Permission } from '../../domain/permissions';
import { useAuth } from '../../state/AuthContext';
import { useSubscription } from '../../state/SubscriptionContext';
import { useAsync } from '../../state/useAsync';
import { cx } from '../ui';
import { TOURS, startTour, stopTour } from './tour';

const dismissedKey = (restaurantId: string) => `FeastoX.setupGuide.dismissed.v1.${restaurantId}`;

/** What each step asks of the owner and where it is done. The server only says whether it is. */
const COPY: Record<OnboardingStepKey, { title: string; hint: string }> = {
  brand: { title: 'Add your logo', hint: 'Guests see it at the top of your menu.' },
  fees: { title: 'Set tax and service charge', hint: 'Skip it if you charge neither.' },
  categories: { title: 'Create menu categories', hint: 'Starters, mains, drinks — however you group the menu.' },
  dishes: { title: 'Add your dishes', hint: 'A name, a price and a photo is enough to start.' },
  tables: { title: 'Add your tables', hint: 'Each table gets its own QR code to order from.' },
  staff: { title: 'Invite your team', hint: 'Give cooks and servers their own sign-in.' },
  'first-order': { title: 'Place a test order', hint: 'Scan a table QR yourself and watch it reach the pass.' },
};

const collapsedKey = (restaurantId: string) => `FeastoX.setupGuide.collapsed.v1.${restaurantId}`;

/** Steps done on a page only an owner can edit are hidden from everyone else, or a manager could never finish the list. */
const NEEDS: Partial<Record<OnboardingStepKey, Permission>> = { brand: 'settings:edit', fees: 'settings:edit', staff: 'settings:edit' };

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    if (on) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    /* private mode: it just resets next visit */
  }
}

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));
}

/**
 * The owner's first-run checklist, floating bottom-right on every admin page. Steps tick themselves from real
 * data; it folds down to a small pill, and goes away once everything required is done.
 */
export function SetupGuide() {
  const { allows, staff } = useAuth();
  const { subscription } = useSubscription();
  const restaurantId = staff?.restaurantId ?? '';
  const [dismissed, setDismissed] = useState(() => readFlag(dismissedKey(restaurantId)));
  const [collapsed, setCollapsed] = useState(() => readFlag(collapsedKey(restaurantId)));
  const location = useLocation();
  const navigate = useNavigate();
  const enabled = ONBOARDING_ENABLED && allows('tables:edit') && !dismissed;
  // Re-read on navigation (at most every 20s), so finishing a step on its page ticks it by the time the owner is back.
  // Once everything required is done the guide is gone for the session, so it stops asking.
  const complete = useRef(false);
  const force = useRef(false);
  const fetchedAt = useRef(0);
  const latest = useRef<Promise<OnboardingProgress> | null>(null);
  const progress = useAsync(() => {
    if (!enabled) return Promise.resolve(null);
    // Skipping hands back the latest fetch (possibly still in flight), so a forced reload cut short by navigation still lands.
    if (latest.current && (complete.current || (!force.current && Date.now() - fetchedAt.current < 20_000))) return latest.current;
    force.current = false;
    latest.current = fetchOnboarding().then((p) => {
      fetchedAt.current = Date.now();
      complete.current = p.steps.filter((s) => allows(NEEDS[s.key] ?? 'tables:edit')).every((s) => s.done || s.optional);
      return p;
    });
    return latest.current;
  }, [enabled, location.pathname]);

  // A tour belongs to the page it was opened on; leaving the page (even through the control it points at) ends it.
  useEffect(() => stopTour, [location.pathname]);

  // A step was clicked: its page is now open, so point at what to do there. Clearing the state keeps a refresh from replaying it.
  const tourKey = (location.state as { tour?: OnboardingStepKey } | null)?.tour;
  useEffect(() => {
    if (!tourKey || !(tourKey in TOURS)) return;
    // No cleanup: clearing the state below re-runs this effect, which would cancel the tour before it opens.
    startTour(tourKey);
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourKey]);

  // Finishing a step is a write on the page the owner is already on, so navigation alone would never notice it.
  const { reload } = progress;
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    const onChange = () => {
      if (complete.current) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        force.current = true;
        reload();
      }, 400);
    };
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(DATA_CHANGED_EVENT, onChange);
    };
  }, [enabled, reload]);

  if (!enabled || !progress.data) return null;
  const steps = progress.data.steps.filter((s) => allows(NEEDS[s.key] ?? 'tables:edit'));
  const data = { steps, completed: steps.filter((s) => s.done).length, total: steps.length };
  if (steps.every((s) => s.done || s.optional)) return null;

  const next = steps.find((s) => !s.done && !s.optional);
  const trial = subscription?.status === 'TRIAL' && subscription.trialEndsAt ? daysLeft(subscription.trialEndsAt) : null;
  const percent = Math.round((data.completed / data.total) * 100);

  const toggle = () => {
    writeFlag(collapsedKey(restaurantId), !collapsed);
    setCollapsed(!collapsed);
  };
  const hide = () => {
    writeFlag(dismissedKey(restaurantId), true);
    setDismissed(true);
  };

  return (
    <div className="fixed right-4 bottom-[calc(1rem+var(--safe-b,0px))] z-30 print:hidden">
      {collapsed ? (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={false}
          className="flex h-10 items-center gap-2.5 rounded-full bg-surface pr-4 pl-3 text-[13px] font-semibold text-ink shadow-deep ring-1 ring-hairline-strong ring-inset transition-move active:scale-95"
        >
          <span className="relative grid size-5 place-items-center rounded-full" style={{ background: `conic-gradient(var(--flame) ${percent}%, var(--color-surface-2) 0)` }} aria-hidden>
            <span className="size-3 rounded-full bg-surface" />
          </span>
          Setup {data.completed}/{data.total}
        </button>
      ) : (
        <section aria-label="Setup guide" className="w-[min(18rem,calc(100vw-2rem))] animate-rise overflow-hidden rounded-2xl bg-surface shadow-deep ring-1 ring-hairline-strong ring-inset">
          <header className="flex items-center gap-2 px-3.5 pt-3 pb-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-[13.5px] font-semibold text-ink">Get set up · {data.completed}/{data.total}</h2>
              {trial !== null && <p className="text-[11.5px] text-ink-3">{trial} day{trial === 1 ? '' : 's'} left in your trial</p>}
            </div>
            <button type="button" onClick={toggle} aria-expanded aria-label="Collapse setup guide" className="grid size-7 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink">
              <span aria-hidden>–</span>
            </button>
          </header>
          <div className="mx-3.5 h-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Setup progress">
            <div className="h-full rounded-full bg-flame transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${percent}%` }} />
          </div>
          <ol className="max-h-[50vh] overflow-y-auto px-1.5 py-2">
            {data.steps.map((step) => {
              const copy = COPY[step.key];
              const isNext = step === next;
              return (
                <li key={step.key}>
                  <button
                    type="button"
                    disabled={step.done}
                    onClick={() => navigate(TOURS[step.key].path, { replace: location.pathname === TOURS[step.key].path.split('?')[0], state: { tour: step.key } })}
                    className={cx('flex w-full items-start gap-2.5 rounded-xl px-2 py-1.5 text-left', !step.done && 'hover:bg-surface-2', isNext && 'bg-flame/8')}
                  >
                    <span aria-hidden className={cx('mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold', step.done ? 'bg-mint text-white' : 'ring-1.5 ring-hairline-strong ring-inset')}>
                      {step.done ? '✓' : ''}
                    </span>
                    <span className="min-w-0">
                      <span className={cx('block text-[13px] font-semibold', step.done ? 'text-ink-3 line-through decoration-hairline-strong' : 'text-ink')}>
                        {copy.title}
                        {step.done && <span className="sr-only"> (done)</span>}
                        {step.optional && !step.done && <span className="ml-1.5 text-[11px] font-medium text-ink-3">optional</span>}
                      </span>
                      {isNext && <span className="block text-[12px] text-ink-3">{copy.hint}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <footer className="border-t border-hairline px-3.5 py-2 text-right">
            <button type="button" onClick={hide} className="text-[12px] font-semibold text-ink-3 hover:text-ink">
              Don't show again
            </button>
          </footer>
        </section>
      )}
    </div>
  );
}
