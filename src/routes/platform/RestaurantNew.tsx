import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { registerRestaurant } from '../../api/platform';
import { createTenant, listPlans, slugAvailable } from '../../api/platformConsole';
import type { PlanKey, Tenant } from '../../api/platformConsole';
import type { BillingInterval, Plan } from '../../domain/subscription';
import { monthsFree, planPrice, planSummary } from '../../domain/subscription';
import { useAsync } from '../../state/useAsync';
import { ADMIN_GHOST, ADMIN_PRIMARY, Field, PageTitle, Panel, PercentInput, Segmented, Select, TextInput, useCommand } from '../../components/admin/kit';
import { usePageTitle } from '../../state/usePageTitle';
import { useToast } from '../../state/ToastContext';
import { Check, ChevronLeft, Copy } from '../../components/icons';
import { cx } from '../../components/ui';
import { rupees, shortDay } from './kit';

const STEPS = ['Restaurant', 'Owner', 'Plan'] as const;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

type SlugState = 'idle' | 'checking' | 'free' | 'taken';

const blank = {
  name: '',
  slug: '',
  city: '',
  cuisine: '',
  ownerName: '',
  ownerEmail: '',
  planKey: 'growth' as PlanKey,
  interval: 'MONTHLY' as BillingInterval,
  trialDays: '14',
  service: '10',
  tax: '13',
};

/**
 * Onboarding is three short steps with the consequences always in view on the
 * right: the diner address that will exist, the plan and trial that will start,
 * and what the owner will receive. The temporary PIN is generated here and
 * shown once, on the hand-off screen, because the operator is the one person
 * who has to get it to the owner.
 */
export function PlatformRestaurantNew() {
  usePageTitle('Add a restaurant · Platform admin');
  const toast = useToast();
  const plans = useAsync(listPlans, []);
  const { busy, run } = useCommand();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(blank);
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<SlugState>('idle');
  const [done, setDone] = useState<{ tenant: Tenant; pin: string } | null>(null);

  const set = <K extends keyof typeof blank>(key: K, value: (typeof blank)[K]) =>
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'name' && !slugTouched) next.slug = slugify(value as string);
      return next;
    });

  const slugValid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug);
  useEffect(() => {
    if (!slugValid) {
      setSlugState('idle');
      return;
    }
    setSlugState('checking');
    let live = true;
    const timer = setTimeout(() => {
      void slugAvailable(form.slug).then((free) => live && setSlugState(free ? 'free' : 'taken'));
    }, 320);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [form.slug, slugValid]);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail);
  const valid = [
    form.name.trim().length > 1 && slugValid && slugState === 'free',
    form.ownerName.trim().length > 1 && emailOk,
    true,
  ];

  const plan: Plan | undefined = plans.data?.plans.find((p) => p.key === form.planKey);
  const trial = Number(form.trialDays);
  const trialEnds = trial > 0 ? new Date(Date.now() + trial * 86400000).toISOString() : null;

  const submit = () => {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    void run('create', async () => {
      await registerRestaurant({
        name: form.name.trim(),
        slug: form.slug,
        serviceChargeRate: Number(form.service) / 100,
        taxRate: Number(form.tax) / 100,
        owner: { name: form.ownerName.trim(), email: form.ownerEmail.trim(), pin },
      });
      const tenant = await createTenant({
        name: form.name.trim(),
        slug: form.slug,
        city: form.city.trim() || 'Nepal',
        cuisine: form.cuisine.trim() || 'Restaurant',
        planKey: form.planKey,
        interval: form.interval,
        trialDays: trial,
        ownerName: form.ownerName.trim(),
        ownerEmail: form.ownerEmail.trim(),
        serviceChargePct: Number(form.service) || 0,
        taxPct: Number(form.tax) || 0,
      });
      setDone({ tenant, pin });
    });
  };

  if (done) return <Handoff done={done} onAnother={() => { setDone(null); setForm(blank); setStep(0); setSlugTouched(false); }} onCopy={(text, what) => copy(text).then(() => toast(`${what} copied.`, <Copy size={16} />))} />;

  return (
    <>
      <Link to="/platform/restaurants" className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-ink">
        <ChevronLeft size={15} /> Restaurants
      </Link>
      <PageTitle title="Add a restaurant" subtitle="Creates the restaurant, its first owner, and starts their plan." />

      <ol className="mb-5 flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((label, i) => {
          const reachable = i <= step || valid.slice(0, i).every(Boolean);
          const on = i === step;
          return (
            <li key={label}>
              <button
                type="button"
                disabled={!reachable}
                aria-current={on ? 'step' : undefined}
                onClick={() => setStep(i)}
                className={cx(
                  'inline-flex h-9 items-center gap-2 rounded-full pl-1.5 pr-4 text-[13.5px] font-semibold transition-move disabled:opacity-40',
                  on ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset',
                )}
              >
                <span className={cx('grid size-6 place-items-center rounded-full text-[12px] tnum', on ? 'bg-bg/20' : i < step ? 'bg-mint/20 text-mint-ink' : 'bg-surface-3')}>
                  {i < step ? <Check size={13} /> : i + 1}
                </span>
                {label}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <Panel>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!valid[step] || busy) return;
              if (step < STEPS.length - 1) setStep(step + 1);
              else submit();
            }}
          >
            {step === 0 && (
              <>
                <Field label="Restaurant name">
                  <TextInput value={form.name} onChange={(v) => set('name', v)} maxLength={120} placeholder="Newa Kitchen" autoFocus />
                </Field>
                <Field
                  label="Diner address"
                  hint={
                    slugState === 'taken'
                      ? undefined
                      : 'Lowercase letters, numbers and dashes. Printed QR codes point here, so choose carefully — it is hard to change later.'
                  }
                >
                  <div>
                    <div className="flex items-center overflow-hidden rounded-xl bg-surface-2 ring-1 ring-hairline ring-inset focus-within:ring-[1.5px] focus-within:ring-flame-2/40">
                      <span className="shrink-0 pl-3.5 text-[14px] text-ink-4">FeastoX.app/r/</span>
                      <input
                        className="w-full bg-transparent px-1 py-2.5 pr-3.5 text-[14.5px] text-ink outline-none"
                        value={form.slug}
                        maxLength={80}
                        placeholder="newa-kitchen"
                        aria-label="Diner address slug"
                        onChange={(e) => {
                          setSlugTouched(true);
                          set('slug', e.target.value.toLowerCase());
                        }}
                      />
                    </div>
                    <p className="mt-1.5 min-h-[18px] text-[12.5px]" aria-live="polite">
                      {form.slug && !slugValid && <span className="text-berry-ink">Use only lowercase letters, numbers and single dashes.</span>}
                      {slugState === 'checking' && <span className="text-ink-4">Checking…</span>}
                      {slugState === 'free' && <span className="font-semibold text-mint-ink">Available</span>}
                      {slugState === 'taken' && <span className="text-berry-ink">Already taken. Try adding the city, like {form.slug}-patan.</span>}
                    </p>
                  </div>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="City">
                    <TextInput value={form.city} onChange={(v) => set('city', v)} maxLength={60} placeholder="Kathmandu" />
                  </Field>
                  <Field label="Cuisine">
                    <TextInput value={form.cuisine} onChange={(v) => set('cuisine', v)} maxLength={60} placeholder="Newari" />
                  </Field>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <Field label="Owner's name">
                  <TextInput value={form.ownerName} onChange={(v) => set('ownerName', v)} maxLength={120} placeholder="Ranjana Shrestha" autoFocus />
                </Field>
                <Field label="Owner's email" hint="Their sign-in. Staff, menus and prices are managed by them from here on.">
                  <TextInput value={form.ownerEmail} onChange={(v) => set('ownerEmail', v)} type="email" placeholder="owner@restaurant.com.np" />
                </Field>
                <p className="rounded-xl bg-surface-2/60 px-3.5 py-3 text-[13px] leading-relaxed text-ink-3 ring-1 ring-hairline ring-inset">
                  A temporary PIN is generated when you create the restaurant. You will see it once, on the next screen, to pass on to the owner. They can change it after their first sign-in.
                </p>
              </>
            )}

            {step === 2 && (
              <>
                <fieldset>
                  <legend className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-4">Plan</legend>
                  <div className="grid gap-2" role="radiogroup" aria-label="Plan">
                    {(plans.data?.plans ?? []).map((p) => {
                      const on = p.key === form.planKey;
                      const amount = planPrice(p, form.interval);
                      return (
                        <button
                          key={p.key}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => set('planKey', p.key as PlanKey)}
                          className={cx(
                            'flex items-center gap-3 rounded-xl px-3.5 py-3 text-left ring-1 ring-inset transition-move',
                            on ? 'bg-flame-dim ring-[1.5px] ring-flame-2/60' : 'bg-surface-2/60 ring-hairline hover:bg-surface-2',
                          )}
                        >
                          <span className={cx('grid size-5 shrink-0 place-items-center rounded-full ring-1.5 ring-inset', on ? 'bg-flame text-white ring-flame' : 'ring-ink-4')}>{on && <Check size={12} />}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[14.5px] font-semibold">{p.name}</span>
                            <span className="block text-[12.5px] text-ink-3">{planSummary(p)}</span>
                          </span>
                          <span className="text-right text-[14px] font-semibold tnum">
                            {amount === null ? '—' : rupees(amount)}
                            <span className="block text-[11.5px] font-medium text-ink-4">{form.interval === 'ANNUAL' ? 'a year' : 'a month'}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="flex flex-wrap items-center gap-3">
                  <Segmented<BillingInterval> label="Billing" value={form.interval} onChange={(v) => set('interval', v)} options={[{ value: 'MONTHLY', label: 'Monthly' }, { value: 'ANNUAL', label: 'Yearly' }]} />
                  {plan && form.interval === 'ANNUAL' && monthsFree(plan) > 0 && <span className="text-[12.5px] font-semibold text-mint-ink">{monthsFree(plan)} months free</span>}
                </div>

                <div className="grid gap-4 border-t border-hairline pt-4 sm:grid-cols-3">
                  <Field label="Free trial">
                    <Select value={form.trialDays} onChange={(v) => set('trialDays', v)} options={[{ value: '0', label: 'No trial' }, { value: '7', label: '7 days' }, { value: '14', label: '14 days' }, { value: '30', label: '30 days' }]} />
                  </Field>
                  <Field label="Service charge">
                    <PercentInput value={form.service} onChange={(v) => set('service', v)} />
                  </Field>
                  <Field label="Tax (VAT)">
                    <PercentInput value={form.tax} onChange={(v) => set('tax', v)} />
                  </Field>
                </div>
              </>
            )}

            <div className="mt-1 flex items-center justify-between gap-3 border-t border-hairline pt-4">
              <button type="button" className={cx(ADMIN_GHOST, step === 0 && 'invisible')} onClick={() => setStep(step - 1)} disabled={busy}>
                Back
              </button>
              <button type="submit" disabled={!valid[step] || busy} className={cx(ADMIN_PRIMARY, 'min-w-36')}>
                {step < STEPS.length - 1 ? 'Continue' : busy ? 'Creating…' : 'Create restaurant'}
              </button>
            </div>
          </form>
        </Panel>

        <aside className="grid gap-4 lg:sticky lg:top-6" aria-label="What will be created">
          <Panel title="What will be created" variant="subtle">
            <dl className="grid gap-3.5 text-[13.5px]">
              <Row label="Restaurant">{form.name.trim() || <Muted>Not named yet</Muted>}</Row>
              <Row label="Diner address">{form.slug ? <span className="break-all">FeastoX.app/r/{form.slug}</span> : <Muted>—</Muted>}</Row>
              <Row label="Owner">{form.ownerName.trim() ? `${form.ownerName.trim()}${emailOk ? ` · ${form.ownerEmail}` : ''}` : <Muted>Added in step 2</Muted>}</Row>
              <Row label="Plan">
                {plan ? `${plan.name} · ${form.interval === 'ANNUAL' ? 'yearly' : 'monthly'}` : <Muted>—</Muted>}
              </Row>
              <Row label="Billing starts">{trialEnds ? `${shortDay(trialEnds)}, after a ${trial}-day trial` : 'Immediately'}</Row>
            </dl>
          </Panel>
          <p className="px-1 text-[12.5px] leading-relaxed text-ink-4">The restaurant can start building its menu right away. Nothing is shown to diners until the owner prints a table QR code.</p>
        </aside>
      </div>
    </>
  );
}

const Muted = ({ children }: { children: string }) => <span className="font-normal text-ink-4">{children}</span>;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-4">{label}</dt>
      <dd className="mt-0.5 font-semibold">{children}</dd>
    </div>
  );
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard blocked; the value is on screen to read out */
  }
}

/* ── Hand-off ──────────────────────────────────────────────────────── */

function Handoff({ done, onAnother, onCopy }: { done: { tenant: Tenant; pin: string }; onAnother: () => void; onCopy: (text: string, what: string) => void }) {
  const { tenant, pin } = done;
  const [shown, setShown] = useState(false);
  const message = useMemo(
    () => `Welcome to Let's Dine, ${tenant.owner.name}!\n\nYour restaurant dashboard is ready.\nSign in: FeastoX.app/admin/signin\nEmail: ${tenant.owner.email}\nTemporary PIN: ${pin}\n\nPlease change your PIN after your first sign-in.`,
    [tenant, pin],
  );
  return (
    <div className="mx-auto max-w-[620px]">
      <div className="mb-6 text-center">
        <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-mint/16 text-mint-ink">
          <Check size={22} />
        </span>
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight">{tenant.name} is on the platform</h1>
        <p className="mt-1.5 text-[14px] text-ink-3">
          {tenant.status === 'TRIAL' && tenant.trialEndsAt ? `Trial runs until ${shortDay(tenant.trialEndsAt)}.` : 'Billing has started.'} Now get {tenant.owner.name.split(' ')[0]} signed in.
        </p>
      </div>

      <Panel title="Sign-in details for the owner" hint="The PIN is shown only here. Copy it before leaving.">
        <dl className="grid gap-3.5 text-[14px]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-4">Email</dt>
              <dd className="font-semibold">{tenant.owner.email}</dd>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-4">Temporary PIN</dt>
              <dd className="font-semibold tnum tracking-[0.2em]">{shown ? pin : '••••••'}</dd>
            </div>
            <button type="button" className={ADMIN_GHOST} onClick={() => setShown((s) => !s)}>
              {shown ? 'Hide' : 'Reveal'}
            </button>
          </div>
        </dl>
        <button type="button" className={cx(ADMIN_PRIMARY, 'mt-4 w-full')} onClick={() => onCopy(message, 'Welcome message')}>
          <Copy size={15} /> Copy welcome message
        </button>
      </Panel>

      <Panel title="What happens next" className="mt-4" variant="subtle">
        <ol className="grid gap-3 text-[13.5px]">
          {['The owner signs in and adds their menu and tables.', 'They print a QR code for each table.', 'The first diner orders. This restaurant leaves “No order yet” on your overview.'].map((text, i) => (
            <li key={text} className="flex gap-3">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-3 text-[11.5px] font-bold tnum">{i + 1}</span>
              <span className="text-ink-2">{text}</span>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link to={`/platform/restaurants/${tenant.id}`} className={ADMIN_PRIMARY}>
          Open {tenant.name}
        </Link>
        <button type="button" className={ADMIN_GHOST} onClick={onAnother}>
          Add another
        </button>
      </div>
    </div>
  );
}
