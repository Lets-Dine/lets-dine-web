import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../api/store';
import {
  PAY_METHOD_LABEL,
  addNote,
  changeTenantPlan,
  extendTrial,
  getTenant,
  issueInvoice,
  listPlans,
  planFor,
  resetPin,
  setOverrides,
  setPersonActive,
  setTenantStatus,
  tenantMrr,
  usageLimits,
} from '../../api/platformConsole';
import type { Person, PlanKey, Tenant, TenantDetail } from '../../api/platformConsole';
import { changeEffect, formatDay, monthsFree, planPrice, planSummary } from '../../domain/subscription';
import type { BillingInterval, Subscription } from '../../domain/subscription';
import { useAsync } from '../../state/useAsync';
import {
  ADMIN_DANGER,
  ADMIN_GHOST,
  ADMIN_PRIMARY,
  ADMIN_TINY,
  Confirm,
  Empty,
  Field,
  Loading,
  MoneyInput,
  Panel,
  Segmented,
  Select,
  TextArea,
  TextInput,
  useCommand,
} from '../../components/admin/kit';
import { usePageTitle } from '../../state/usePageTitle';
import { useToast } from '../../state/ToastContext';
import { ArrowUpRight, ChevronLeft, Copy, Eye, Minus, Plus } from '../../components/icons';
import { DISPLAY, cx } from '../../components/ui';
import { Avatar, Badge, Fact, Meter, StatusBadge, WeekBars, relTime, rupees, shortDay } from './kit';
import { EventList } from './EventList';
import { InvoiceList } from './InvoiceList';

type Tab = 'overview' | 'subscription' | 'people' | 'billing' | 'activity';
const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'people', label: 'People' },
  { value: 'billing', label: 'Billing' },
  { value: 'activity', label: 'Activity' },
];

/**
 * One restaurant, everything an operator might do about it. Tabs split it by
 * intent — look, change the plan, manage people, chase money, review history —
 * and a single status line under the title says the one thing to do first.
 */
export function PlatformRestaurantDetail() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const detail = useAsync(() => getTenant(id), [id]);
  const toast = useToast();
  const tab = (TABS.find((t) => t.value === params.get('tab'))?.value ?? 'overview') as Tab;
  usePageTitle(`${detail.data?.tenant.name ?? 'Restaurant'} · Platform admin`);

  if (detail.error instanceof ApiError && detail.error.status === 404) return <Navigate to="/platform/restaurants" replace />;
  if (!detail.data) return detail.error ? <p className="text-[14px] text-berry">{detail.error.message}</p> : <Loading label="Opening restaurant…" />;

  const { tenant, invoices } = detail.data;
  const reload = detail.reload;
  const overdue = invoices.find((i) => i.state === 'OVERDUE');
  const locked = tenant.status === 'SUSPENDED' || tenant.status === 'CANCELLED';

  return (
    <>
      <Link to="/platform/restaurants" className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-ink">
        <ChevronLeft size={15} /> Restaurants
      </Link>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={tenant.name} size={52} className="rounded-2xl" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className={cx(DISPLAY, 'text-[26px] sm:text-[30px]')}>{tenant.name}</h1>
              <StatusBadge status={tenant.status} />
            </div>
            <p className="mt-1 text-[13.5px] text-ink-3">
              /{tenant.slug} · {tenant.city} · {tenant.cuisine} · joined {shortDay(tenant.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={ADMIN_GHOST}
            onClick={() => toast(`Support view opened for ${tenant.name}. Read-only, and recorded in Activity.`, <Eye size={16} />)}
          >
            <Eye size={15} /> Support view <ArrowUpRight size={13} className="text-ink-4" />
          </button>
        </div>
      </header>

      <StatusLine tenant={tenant} overdueNumber={overdue?.number} onTab={(t) => setParams({ tab: t }, { replace: true })} onChange={reload} />

      <div className="mb-5 mt-5 overflow-x-auto no-scrollbar">
        <Segmented<Tab> label="Sections" value={tab} onChange={(t) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })} options={TABS} />
      </div>

      {tab === 'overview' && <OverviewTab tenant={tenant} onChange={reload} />}
      {tab === 'subscription' && <SubscriptionTab tenant={tenant} onChange={reload} locked={locked} />}
      {tab === 'people' && <PeopleTab tenant={tenant} onChange={reload} />}
      {tab === 'billing' && <BillingTab tenant={tenant} detail={detail.data} onChange={reload} />}
      {tab === 'activity' && (
        <Panel bare>{detail.data.events.length === 0 ? <Empty emoji="🗒️" title="No activity yet" message="Operator actions on this restaurant will be listed here." /> : <EventList events={detail.data.events} showTenant={false} />}</Panel>
      )}
    </>
  );
}

/* ── The one thing to do first ─────────────────────────────────────── */

function StatusLine({ tenant, overdueNumber, onTab, onChange }: { tenant: Tenant; overdueNumber?: string; onTab: (t: Tab) => void; onChange: () => void }) {
  const { busy, run } = useCommand();
  let tone: 'warn' | 'bad' | 'info' | null = null;
  let text = '';
  let action: ReactNode = null;

  if (tenant.status === 'PAST_DUE' || tenant.status === 'RESTRICTED') {
    tone = tenant.status === 'RESTRICTED' ? 'bad' : 'warn';
    text = `${overdueNumber ?? 'An invoice'} is overdue${tenant.pastDueSince ? ` since ${shortDay(tenant.pastDueSince)}` : ''}. ${tenant.status === 'RESTRICTED' ? 'New orders are blocked until it is settled.' : 'It restricts automatically if it stays unpaid.'}`;
    action = (
      <button type="button" className={ADMIN_PRIMARY} onClick={() => onTab('billing')}>
        Go to billing
      </button>
    );
  } else if (tenant.status === 'SUSPENDED') {
    tone = 'bad';
    text = `Suspended. ${tenant.suspendedReason ?? ''} Staff cannot sign in; the owner can still reach the plan page.`;
    action = (
      <button type="button" disabled={busy} className={ADMIN_PRIMARY} onClick={() => void run('restore', () => setTenantStatus(tenant.id, 'ACTIVE'), `${tenant.name} restored.`).then((ok) => ok && onChange())}>
        Restore access
      </button>
    );
  } else if (tenant.status === 'TRIAL' && tenant.trialEndsAt) {
    const left = Math.ceil((Date.parse(tenant.trialEndsAt) - Date.now()) / 86400000);
    tone = left <= 3 ? 'warn' : 'info';
    text = `Trial ends ${shortDay(tenant.trialEndsAt)} (${left <= 0 ? 'today' : `${left} day${left === 1 ? '' : 's'} left`}). ${tenant.ordersThisMonth.toLocaleString()} orders so far.`;
    action = (
      <button type="button" disabled={busy} className={ADMIN_GHOST} onClick={() => void run('extend', () => extendTrial(tenant.id, 7), 'Trial extended by 7 days.').then((ok) => ok && onChange())}>
        Extend 7 days
      </button>
    );
  } else if (tenant.status === 'CANCELLED') {
    tone = 'info';
    text = 'Cancelled by the owner. Their menu and order history are kept.';
  }

  if (!tone) return null;
  const toneClass = { warn: 'bg-gold/12 ring-gold/30', bad: 'bg-berry/10 ring-berry/25', info: 'bg-pass/10 ring-pass/25' }[tone];
  return (
    <div role="status" className={cx('flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 ring-1 ring-inset', toneClass)}>
      <p className="max-w-[70ch] text-[13.5px] leading-snug text-ink-2">{text}</p>
      {action}
    </div>
  );
}

/* ── Overview ──────────────────────────────────────────────────────── */

function OverviewTab({ tenant, onChange }: { tenant: Tenant; onChange: () => void }) {
  const lim = usageLimits(tenant);
  const { busy, run } = useCommand();
  const [note, setNote] = useState('');

  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr] lg:items-start">
      <div className="grid gap-5">
        <Panel title="This month" hint="Against what the plan includes">
          <div className="grid gap-4">
            <Meter label="Orders" used={tenant.ordersThisMonth} limit={lim.orders} />
            <Meter label="Branches" used={tenant.branches} limit={lim.branches} />
            <Meter label="Staff seats" used={tenant.seats} limit={lim.seats} />
          </div>
          <div className="mt-5 flex items-end justify-between gap-4 border-t border-hairline pt-4">
            <div>
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-4">Orders per week</div>
              <div className="mt-0.5 text-[13px] text-ink-3">Last 8 weeks, latest in orange</div>
            </div>
            <WeekBars data={tenant.weekly} />
          </div>
        </Panel>

        <Panel title="Notes" hint="Only visible to the platform team">
          <form
            className="grid gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!note.trim()) return;
              void run('note', () => addNote(tenant.id, note.trim()), 'Note saved.').then((ok) => {
                if (ok) {
                  setNote('');
                  onChange();
                }
              });
            }}
          >
            <TextArea value={note} onChange={setNote} rows={2} maxLength={500} placeholder="Promised a call on Sunday, agreed to hold off on restricting…" />
            <div className="flex justify-end">
              <button type="submit" disabled={busy || !note.trim()} className={ADMIN_GHOST}>
                Add note
              </button>
            </div>
          </form>
          {tenant.notes.length > 0 && (
            <ul className="mt-4 grid gap-3 border-t border-hairline pt-4">
              {tenant.notes.map((n) => (
                <li key={n.id} className="text-[13.5px]">
                  <p className="leading-relaxed">{n.text}</p>
                  <p className="mt-0.5 text-[12px] text-ink-4">
                    {n.author} · {relTime(n.at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Details">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
          <Fact label="Owner">{tenant.owner.name}</Fact>
          <Fact label="Owner email">{tenant.owner.email}</Fact>
          <Fact label="Plan">
            {planFor(tenant).name} · {tenant.interval === 'ANNUAL' ? 'yearly' : 'monthly'}
          </Fact>
          <Fact label="Revenue">{tenantMrr(tenant) > 0 ? `${rupees(tenantMrr(tenant))} / mo` : 'Not billing'}</Fact>
          <Fact label="Last active">{relTime(tenant.lastActiveAt)}</Fact>
          <Fact label="First order">{tenant.firstOrderAt ? shortDay(tenant.firstOrderAt) : 'None yet'}</Fact>
          <Fact label="Currency">{tenant.currency}</Fact>
          <Fact label="Timezone">{tenant.timezone}</Fact>
          <Fact label="Service charge">{Math.round(tenant.serviceChargeRate * 100)}%</Fact>
          <Fact label="Tax">{Math.round(tenant.taxRate * 100)}%</Fact>
        </dl>
        <p className="mt-5 border-t border-hairline pt-4 text-[12.5px] leading-relaxed text-ink-4">
          Fees and menu are the owner's to edit. Platform defaults only apply when a restaurant is created.
        </p>
      </Panel>
    </div>
  );
}

/* ── Subscription ──────────────────────────────────────────────────── */

function SubscriptionTab({ tenant, onChange, locked }: { tenant: Tenant; onChange: () => void; locked: boolean }) {
  const plans = useAsync(listPlans, []);
  const { busy, run } = useCommand();
  const [planKey, setPlanKey] = useState<PlanKey>(tenant.planKey);
  const [interval, setInterval] = useState<BillingInterval>(tenant.interval);
  const [extraB, setExtraB] = useState(tenant.extraBranches);
  const [extraS, setExtraS] = useState(tenant.extraSeats);
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState('');

  const all = plans.data?.plans ?? [];
  const current = planFor(tenant);
  const target = all.find((p) => p.key === planKey);
  const changed = planKey !== tenant.planKey || interval !== tenant.interval;
  const effect =
    target && changed
      ? changeEffect({ status: tenant.status, plan: current } as Subscription, target) === 'now'
        ? 'Takes effect now, and the next invoice uses the new price.'
        : `Takes effect on ${formatDay(tenant.periodEnd)}, when the paid period ends.`
      : null;
  const price = target ? planPrice(target, interval) : null;

  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <Panel title="Plan" hint={`${current.name} · ${planSummary(current)}`}>
        <div className="grid gap-4">
          <Field label="Move to">
            <Select<PlanKey> value={planKey} onChange={setPlanKey} options={all.map((p) => ({ value: p.key as PlanKey, label: `${p.name}${p.key === tenant.planKey ? ' (current)' : ''}` }))} />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented<BillingInterval> label="Billing" value={interval} onChange={setInterval} options={[{ value: 'MONTHLY', label: 'Monthly' }, { value: 'ANNUAL', label: 'Yearly' }]} />
            {target && interval === 'ANNUAL' && monthsFree(target) > 0 && <span className="text-[12.5px] font-semibold text-mint-ink">{monthsFree(target)} months free</span>}
          </div>
          {target && (
            <p className="text-[13px] text-ink-3">
              {target.name}: {price === null ? '—' : rupees(price)} {interval === 'ANNUAL' ? 'a year' : 'a month'}. {effect}
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={busy || !changed}
              className={ADMIN_PRIMARY}
              onClick={() => void run('plan', () => changeTenantPlan(tenant.id, planKey, interval), `${tenant.name} moved to ${target?.name}.`).then((ok) => ok && onChange())}
            >
              Change plan
            </button>
          </div>
        </div>
        <p className="mt-4 border-t border-hairline pt-4 text-[12.5px] text-ink-4">
          Current period ends {formatDay(tenant.periodEnd)}.
        </p>
      </Panel>

      <div className="grid gap-5">
        {tenant.status === 'TRIAL' && tenant.trialEndsAt && (
          <Panel title="Trial" hint={`Ends ${formatDay(tenant.trialEndsAt)}`}>
            <div className="flex flex-wrap gap-2">
              {[7, 14].map((d) => (
                <button key={d} type="button" disabled={busy} className={ADMIN_GHOST} onClick={() => void run(`t${d}`, () => extendTrial(tenant.id, d), `Trial extended by ${d} days.`).then((ok) => ok && onChange())}>
                  <Plus size={14} /> {d} days
                </button>
              ))}
            </div>
          </Panel>
        )}

        <Panel title="Extra capacity" hint="Billed at the plan's add-on prices">
          <div className="grid gap-3">
            <Stepper label={`Extra branches (plan includes ${current.limits.branches ?? '∞'})`} value={extraB} onChange={setExtraB} />
            <Stepper label={`Extra staff seats (plan includes ${current.limits.staffSeats ?? '∞'})`} value={extraS} onChange={setExtraS} />
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={busy || (extraB === tenant.extraBranches && extraS === tenant.extraSeats)}
              className={ADMIN_GHOST}
              onClick={() => void run('limits', () => setOverrides(tenant.id, extraB, extraS), 'Capacity updated.').then((ok) => ok && onChange())}
            >
              Save capacity
            </button>
          </div>
        </Panel>

        <Panel title="Access" hint={locked ? 'Currently closed to staff' : 'Open to staff and diners'} variant="subtle">
          {locked ? (
            <button type="button" disabled={busy || tenant.status === 'CANCELLED'} className={ADMIN_PRIMARY} onClick={() => void run('restore', () => setTenantStatus(tenant.id, 'ACTIVE'), `${tenant.name} restored.`).then((ok) => ok && onChange())}>
              Restore access
            </button>
          ) : suspending ? (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void run('suspend', () => setTenantStatus(tenant.id, 'SUSPENDED', reason.trim()), `${tenant.name} suspended.`).then((ok) => {
                  if (ok) {
                    setSuspending(false);
                    setReason('');
                    onChange();
                  }
                });
              }}
            >
              <Field label="Reason" hint="Recorded in Activity and shown to the owner on their plan page.">
                <TextInput value={reason} onChange={setReason} maxLength={140} placeholder="Unpaid after three reminders" autoFocus />
              </Field>
              <div className="flex gap-2">
                <button type="button" className={ADMIN_GHOST} onClick={() => setSuspending(false)}>
                  Keep open
                </button>
                <button type="submit" disabled={busy || reason.trim().length < 3} className={ADMIN_DANGER}>
                  Suspend restaurant
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-[44ch] text-[13px] text-ink-3">Suspending stops staff signing in and diners ordering. History is kept and it can be restored at any time.</p>
              <button type="button" className={ADMIN_DANGER} onClick={() => setSuspending(true)}>
                Suspend…
              </button>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13.5px] text-ink-2">{label}</span>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-hairline ring-inset">
        <button type="button" aria-label="Fewer" disabled={value <= 0} onClick={() => onChange(value - 1)} className="grid size-8 place-items-center rounded-lg text-ink-2 transition-move hover:bg-surface-3 active:scale-90 disabled:opacity-30">
          <Minus size={14} />
        </button>
        <span className="w-8 text-center text-[14px] font-semibold tnum" aria-live="polite">
          {value}
        </span>
        <button type="button" aria-label="More" disabled={value >= 20} onClick={() => onChange(value + 1)} className="grid size-8 place-items-center rounded-lg text-ink-2 transition-move hover:bg-surface-3 active:scale-90 disabled:opacity-30">
          <Plus size={14} />
        </button>
      </span>
    </div>
  );
}

/* ── People ────────────────────────────────────────────────────────── */

function PeopleTab({ tenant, onChange }: { tenant: Tenant; onChange: () => void }) {
  const lim = usageLimits(tenant);
  return (
    <Panel
      title="People with access"
      hint={`${tenant.people.filter((p) => p.active).length} active · plan includes ${lim.seats ?? 'unlimited'} seats`}
      bare
    >
      <ul>
        {tenant.people.map((p) => (
          <PersonRow key={p.id} tenantId={tenant.id} person={p} onChange={onChange} />
        ))}
      </ul>
      {tenant.people.length < tenant.seats && (
        <p className="border-t border-hairline px-4 py-3 text-[12.5px] text-ink-4 sm:px-5">
          {tenant.seats - tenant.people.length} more staff {tenant.seats - tenant.people.length === 1 ? 'account is' : 'accounts are'} in use at this restaurant. Only owners and managers are listed here.
        </p>
      )}
    </Panel>
  );
}

const ROLE_TONE = { OWNER: 'info', MANAGER: 'muted', STAFF: 'muted' } as const;

function PersonRow({ tenantId, person, onChange }: { tenantId: string; person: Person; onChange: () => void }) {
  const { busy, run } = useCommand();
  const toast = useToast();
  const [pin, setPin] = useState<string | null>(null);

  return (
    <li className="border-b border-hairline px-4 py-3.5 last:border-0 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Avatar name={person.name} size={34} className="rounded-full" />
        <div className="min-w-[160px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx('text-[14px] font-semibold', !person.active && 'text-ink-3 line-through')}>{person.name}</span>
            <Badge tone={ROLE_TONE[person.role]}>{person.role === 'OWNER' ? 'Owner' : person.role === 'MANAGER' ? 'Manager' : 'Staff'}</Badge>
            {!person.active && <Badge tone="bad">Deactivated</Badge>}
          </div>
          <div className="text-[12.5px] text-ink-3">
            {person.email} · {person.lastSignInAt ? `signed in ${relTime(person.lastSignInAt)}` : 'never signed in'}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Confirm
            label="Reset PIN"
            question="Issue a new PIN?"
            confirmLabel="Reset"
            disabled={busy || !person.active}
            onConfirm={() => void run('pin', async () => setPin(await resetPin(tenantId, person.id)))}
          />
          {person.active ? (
            person.role !== 'OWNER' && (
              <Confirm label="Deactivate" question="Block sign-in?" confirmLabel="Deactivate" onConfirm={() => void run('off', () => setPersonActive(tenantId, person.id, false), `${person.name} deactivated.`).then((ok) => ok && onChange())} />
            )
          ) : (
            <button type="button" className={cx(ADMIN_TINY, 'bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset')} onClick={() => void run('on', () => setPersonActive(tenantId, person.id, true), `${person.name} reactivated.`).then((ok) => ok && onChange())}>
              Reactivate
            </button>
          )}
        </div>
      </div>
      {pin && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-mint/10 px-3.5 py-2.5 ring-1 ring-mint/25 ring-inset" role="status">
          <p className="text-[13px]">
            New PIN for {person.name.split(' ')[0]}: <strong className="tnum tracking-[0.18em]">{pin}</strong>
            <span className="text-ink-3"> · shown once</span>
          </p>
          <span className="flex gap-1.5">
            <button
              type="button"
              className={cx(ADMIN_TINY, 'bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset')}
              onClick={() => {
                void navigator.clipboard?.writeText(pin).catch(() => undefined);
                toast('PIN copied.', <Copy size={16} />);
              }}
            >
              <Copy size={13} /> Copy
            </button>
            <button type="button" className={cx(ADMIN_TINY, 'text-ink-3')} onClick={() => setPin(null)}>
              Done
            </button>
          </span>
        </div>
      )}
    </li>
  );
}

/* ── Billing ───────────────────────────────────────────────────────── */

function BillingTab({ tenant, detail, onChange }: { tenant: Tenant; detail: TenantDetail; onChange: () => void }) {
  const { busy, run } = useCommand();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | ''>('');
  const [memo, setMemo] = useState('');
  const paidTotal = detail.invoices.filter((i) => i.state === 'PAID').reduce((s, i) => s + i.amount, 0);

  return (
    <div className="grid gap-5">
      <Panel
        title="Invoices"
        hint={detail.invoices.length ? `${rupees(paidTotal)} paid to date · payments are recorded by hand` : 'Payments are recorded by hand'}
        action={
          <button type="button" className={ADMIN_GHOST} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <Plus size={14} /> One-off invoice
          </button>
        }
        bare
      >
        {open && (
          <form
            className="grid gap-3 border-b border-hairline bg-surface-2/40 px-4 py-4 sm:grid-cols-[1fr_1.6fr_auto] sm:items-end sm:px-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!amount) return;
              void run('issue', () => issueInvoice(tenant.id, amount, memo.trim()), 'Invoice issued.').then((ok) => {
                if (ok) {
                  setOpen(false);
                  setAmount('');
                  setMemo('');
                  onChange();
                }
              });
            }}
          >
            <Field label="Amount">
              <MoneyInput value={amount} onChange={setAmount} currency="NPR" />
            </Field>
            <Field label="What it is for">
              <TextInput value={memo} onChange={setMemo} maxLength={80} placeholder="QR table stands, 12 pieces" />
            </Field>
            <button type="submit" disabled={busy || !amount} className={ADMIN_PRIMARY}>
              Issue invoice
            </button>
          </form>
        )}
        {detail.invoices.length === 0 ? (
          <Empty emoji="🧾" title="No invoices yet" message={tenant.status === 'TRIAL' ? 'The first invoice is issued when the trial ends.' : 'Invoices appear here once billing begins.'} />
        ) : (
          <InvoiceList invoices={detail.invoices} showTenant={false} onChange={onChange} />
        )}
      </Panel>
      <p className="px-1 text-[12.5px] text-ink-4">Accepted: {Object.values(PAY_METHOD_LABEL).join(', ')}.</p>
    </div>
  );
}
