import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ApiError } from '../../api/store';
import {
  PAY_METHOD_LABEL,
  addNote,
  extendTrial,
  getTenant,
  recordRenewal,
  issueInvoice,
  planFor,
  resetPin,
  setPersonActive,
  setTenantClaimed,
  setTenantStatus,
  tenantMrr,
  usageLimits,
} from '../../api/platformConsole';
import type { PayMethod, Person, Tenant, TenantDetail } from '../../api/platformConsole';
import { useAsync } from '../../state/useAsync';
import {
  ADMIN_GHOST,
  ADMIN_PRIMARY,
  ADMIN_TINY,
  Confirm,
  Empty,
  Field,
  Loading,
  MoneyInput,
  Select,
  TextArea,
  TextInput,
  useCommand,
} from '../../components/admin/kit';
import { usePageTitle } from '../../state/usePageTitle';
import { useToast } from '../../state/ToastContext';
import { ArrowUpRight, ChevronLeft, Contact, Copy, Eye, Plus } from '../../components/icons';
import { DISPLAY, cx } from '../../components/ui';
import { Avatar, Badge, Meter, StatusBadge, WeekBars, relTime, rupees, shortDay } from './kit';
import { Block, FloatingBar, Num, reduced, useAway } from '../../components/admin/profile';
import { AccessBlock, SubscriptionBlock } from './SubscriptionBlocks';
import { EventList } from './EventList';
import { InvoiceList } from './InvoiceList';

/**
 * One restaurant on one page, laid out like a customer's file: who they are and the one thing to
 * do first up top, the numbers at a glance, then everything an operator edits — subscription,
 * invoices, people, notes — as blocks to scroll, with the serious actions kept at the bottom.
 */
export function PlatformRestaurantDetail() {
  const { id = '' } = useParams();
  const detail = useAsync(() => getTenant(id), [id]);
  const heroRef = useRef<HTMLElement>(null);
  const away = useAway(heroRef);
  usePageTitle(`${detail.data?.tenant.name ?? 'Restaurant'} · Platform admin`);

  if (detail.error instanceof ApiError && detail.error.status === 404) return <Navigate to="/platform/restaurants" replace />;
  if (!detail.data) return detail.error ? <p className="text-[14px] text-berry">{detail.error.message}</p> : <Loading label="Opening restaurant…" />;

  const { tenant, invoices } = detail.data;
  const reload = detail.reload;
  const overdue = invoices.find((i) => i.state === 'OVERDUE');
  const plan = planFor(tenant);
  const lim = usageLimits(tenant);
  const jump = (target: string) => document.getElementById(target)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  const first = tenant.owner.name.split(' ')[0];

  return (
    <div>
      <FloatingBar show={away}>
        <span className="truncate text-[14px] font-semibold">{tenant.name}</span>
        <StatusBadge status={tenant.status} />
        <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-flame px-3.5 text-[13px] font-semibold text-white" onClick={() => jump('subscription')}>
          Subscription
        </button>
      </FloatingBar>

      <Link to="/platform/restaurants" className="mb-4 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-ink">
        <ChevronLeft size={15} /> Restaurants
      </Link>

      <section ref={heroRef} className="flex flex-wrap items-start gap-x-6 gap-y-5">
        <Avatar name={tenant.name} size={84} className="rounded-3xl" />
        <div className="min-w-0 flex-1 basis-80">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className={cx(DISPLAY, 'animate-rise wrap-break-word text-[clamp(34px,5vw,56px)] leading-[1] tracking-[-0.03em]')}>{tenant.name}</h1>
            <StatusBadge status={tenant.status} />
          </div>
          <p className="mt-2 text-[13.5px] text-ink-3">
            /{tenant.slug} · {tenant.city} · {tenant.cuisine} · joined {shortDay(tenant.createdAt)}
          </p>
          <p className="mt-4 max-w-[44ch] animate-rise text-[clamp(18px,2.2vw,24px)] font-medium leading-[1.3] text-ink-2 [animation-delay:80ms]">
            {plan.name} plan, billed {tenant.interval === 'ANNUAL' ? 'yearly' : 'monthly'}. <Num>{tenant.ordersThisMonth.toLocaleString()}</Num> orders this month, last active <span className="text-ink">{relTime(tenant.lastActiveAt)}</span>.
          </p>
          <div className="mt-5 flex animate-rise flex-wrap gap-2.5 [animation-delay:160ms]">
            <a href={`mailto:${tenant.owner.email}`} className={cx(ADMIN_PRIMARY, 'h-11 px-5 text-[14.5px]')}>
              <Contact size={16} /> Email {first}
            </a>
            <SupportViewButton name={tenant.name} />
          </div>
        </div>
      </section>

      <div className="mt-6">
        <StatusLine tenant={tenant} overdueNumber={overdue?.number} onJump={jump} onChange={reload} />
      </div>

      <section aria-label="At a glance" className="mt-8 animate-rise overflow-hidden rounded-[28px] bg-surface-2 ring-1 ring-hairline-strong ring-inset [animation-delay:200ms]">
        <div className="grid divide-y divide-hairline md:grid-cols-3 md:divide-x md:divide-y-0">
          <Cell title="Plan">
            <p className={cx(DISPLAY, 'text-[26px]')}>{plan.name}</p>
            <p className="mt-1 text-[14px] text-ink-3">
              {tenantMrr(tenant) > 0 ? `${rupees(tenantMrr(tenant))} a month` : 'Not billing'} · {tenant.status === 'TRIAL' && tenant.trialEndsAt ? `trial ends ${shortDay(tenant.trialEndsAt)}` : `paid until ${shortDay(tenant.periodEnd)}`}
            </p>
          </Cell>
          <Cell title="This month">
            <p className={cx(DISPLAY, 'text-[26px] tnum')}>{tenant.ordersThisMonth.toLocaleString()} <span className="text-[15px] font-medium text-ink-3">orders{lim.orders ? ` of ${lim.orders.toLocaleString()}` : ''}</span></p>
            <p className="mt-1 text-[14px] text-ink-3">
              {tenant.branches} {tenant.branches === 1 ? 'branch' : 'branches'} · {tenant.seats} staff seats
            </p>
          </Cell>
          <Cell title="Owner">
            <p className={cx(DISPLAY, 'text-[26px]')}>{tenant.owner.name}</p>
            <p className="mt-1 truncate text-[14px] text-ink-3">{tenant.owner.email} · {tenant.claimed ? 'claimed' : 'not claimed yet'}</p>
          </Cell>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          <SubscriptionBlock tenant={tenant} onChange={reload} />
          <InvoicesBlock tenant={tenant} detail={detail.data} onChange={reload} />
          <Block title="Activity" hint="What operators did here" delay={240}>
            {detail.data.events.length === 0 ? (
              <p className="text-[14px] text-ink-3">Operator actions on this restaurant will be listed here.</p>
            ) : (
              <div className="-mx-5 -mb-5 border-t border-hairline sm:-mx-6 sm:-mb-6">
                <EventList events={detail.data.events} showTenant={false} />
              </div>
            )}
          </Block>
        </div>

        <div className="grid content-start gap-6">
          <DetailsBlock tenant={tenant} onChange={reload} />
          <UsageBlock tenant={tenant} />
          <NotesBlock tenant={tenant} onChange={reload} />
          <PeopleBlock tenant={tenant} onChange={reload} />
          <AccessBlock tenant={tenant} onChange={reload} />
        </div>
      </div>
    </div>
  );
}

function Cell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-6 py-5">
      <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-4">{title}</h2>
      {children}
    </div>
  );
}

function SupportViewButton({ name }: { name: string }) {
  const toast = useToast();
  return (
    <button type="button" className={cx(ADMIN_GHOST, 'h-11 px-5 text-[14.5px]')} onClick={() => toast(`Support view opened for ${name}. Read-only, and recorded in Activity.`, <Eye size={16} />)}>
      <Eye size={15} /> Support view <ArrowUpRight size={13} className="text-ink-4" />
    </button>
  );
}

const Line = ({ k, children }: { k: string; children: ReactNode }) => (
  <div className="flex justify-between gap-4">
    <dt className="text-ink-3">{k}</dt>
    <dd className="min-w-0 truncate text-right font-medium">{children}</dd>
  </div>
);

function DetailsBlock({ tenant, onChange }: { tenant: Tenant; onChange: () => void }) {
  const { busy, run } = useCommand();
  return (
    <Block title="Details" delay={120}>
      <dl className="grid gap-2.5 text-[14px]">
        <Line k="Owner">{tenant.owner.name}</Line>
        <Line k="Email">{tenant.owner.email}</Line>
        <Line k="Location">{tenant.city} · {tenant.cuisine}</Line>
        <Line k="Joined">{shortDay(tenant.createdAt)}</Line>
        <Line k="First order">{tenant.firstOrderAt ? shortDay(tenant.firstOrderAt) : 'None yet'}</Line>
        <Line k="Currency · timezone">{tenant.currency} · {tenant.timezone}</Line>
        <Line k="Service charge · tax">{Math.round(tenant.serviceChargeRate * 100)}% · {Math.round(tenant.taxRate * 100)}%</Line>
      </dl>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
        <p className="max-w-[30ch] text-[13px] text-ink-3">{tenant.claimed ? 'The owner has taken this restaurant over.' : 'Not claimed: diners see a "Claim it" button on its menu.'}</p>
        <button
          type="button"
          disabled={busy}
          className={ADMIN_GHOST}
          onClick={() => void run('claimed', () => setTenantClaimed(tenant.id, !tenant.claimed), tenant.claimed ? 'Marked unclaimed.' : 'Marked claimed.').then((ok) => ok && onChange())}
        >
          {tenant.claimed ? 'Mark unclaimed' : 'Mark claimed'}
        </button>
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-4">Fees and menu are the owner's to edit; platform defaults only apply when a restaurant is created.</p>
    </Block>
  );
}

function UsageBlock({ tenant }: { tenant: Tenant }) {
  const lim = usageLimits(tenant);
  return (
    <Block title="Usage" hint="Against what the plan includes" delay={160}>
      <div className="grid gap-4">
        <Meter label="Orders" used={tenant.ordersThisMonth} limit={lim.orders} />
        <Meter label="Branches" used={tenant.branches} limit={lim.branches} />
        <Meter label="Staff seats" used={tenant.seats} limit={lim.seats} />
      </div>
      <div className="mt-5 flex items-end justify-between gap-4 border-t border-hairline pt-4">
        <p className="text-[13px] text-ink-3">Orders per week, last 8 weeks</p>
        <WeekBars data={tenant.weekly} />
      </div>
    </Block>
  );
}

function NotesBlock({ tenant, onChange }: { tenant: Tenant; onChange: () => void }) {
  const { busy, run } = useCommand();
  const [note, setNote] = useState('');
  return (
    <Block title="Notes" hint="Only the platform team sees these" delay={180}>
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
        {note.trim() && (
          <div className="flex justify-end">
            <button type="submit" disabled={busy} className={ADMIN_PRIMARY}>
              Save note
            </button>
          </div>
        )}
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
    </Block>
  );
}

/* ── The one thing to do first ─────────────────────────────────────── */

function StatusLine({ tenant, overdueNumber, onJump, onChange }: { tenant: Tenant; overdueNumber?: string; onJump: (id: string) => void; onChange: () => void }) {
  const { busy, run } = useCommand();
  let tone: 'warn' | 'bad' | 'info' | null = null;
  let text = '';
  let action: ReactNode = null;

  if (tenant.status === 'PAST_DUE' || tenant.status === 'RESTRICTED') {
    tone = tenant.status === 'RESTRICTED' ? 'bad' : 'warn';
    text = `${overdueNumber ?? 'An invoice'} is overdue${tenant.pastDueSince ? ` since ${shortDay(tenant.pastDueSince)}` : ''}. ${tenant.status === 'RESTRICTED' ? 'New orders are blocked until it is settled.' : 'It restricts automatically if it stays unpaid.'}`;
    action = (
      <button type="button" className={ADMIN_PRIMARY} onClick={() => onJump('invoices')}>
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

function PeopleBlock({ tenant, onChange }: { tenant: Tenant; onChange: () => void }) {
  const lim = usageLimits(tenant);
  return (
    <Block title="People" hint={`${tenant.people.filter((p) => p.active).length} active · plan includes ${lim.seats ?? 'unlimited'} seats`} delay={200}>
      <ul className="-mx-5 -mb-5 border-t border-hairline sm:-mx-6 sm:-mb-6">
        {tenant.people.map((p) => (
          <PersonRow key={p.id} tenantId={tenant.id} person={p} onChange={onChange} />
        ))}
      </ul>
      {tenant.people.length < tenant.seats && (
        <p className="-mx-5 border-t border-hairline px-5 py-3 text-[12.5px] text-ink-4 sm:-mx-6 sm:px-6">
          {tenant.seats - tenant.people.length} more staff {tenant.seats - tenant.people.length === 1 ? 'account is' : 'accounts are'} in use at this restaurant. Only owners and managers are listed here.
        </p>
      )}
    </Block>
  );
}

const ROLE_TONE = { OWNER: 'info', MANAGER: 'muted', STAFF: 'muted' } as const;

function PersonRow({ tenantId, person, onChange }: { tenantId: string; person: Person; onChange: () => void }) {
  const { busy, run } = useCommand();
  const toast = useToast();
  const [pin, setPin] = useState<string | null>(null);

  return (
    <li className="border-b border-hairline px-5 py-3.5 last:border-0 sm:px-6">
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

function InvoicesBlock({ tenant, detail, onChange }: { tenant: Tenant; detail: TenantDetail; onChange: () => void }) {
  const { busy, run } = useCommand();
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [method, setMethod] = useState<PayMethod>('BANK');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [memo, setMemo] = useState('');
  const paidTotal = detail.invoices.filter((i) => i.state === 'PAID').reduce((s, i) => s + i.amount, 0);
  const methods = (Object.keys(PAY_METHOD_LABEL) as PayMethod[]).map((value) => ({ value, label: PAY_METHOD_LABEL[value] }));

  return (
    <>
      <Block
        title="Invoices"
        hint={detail.invoices.length ? `${rupees(paidTotal)} paid to date` : undefined}
        action={
          <div className="flex gap-2">
            <button type="button" className={ADMIN_GHOST} disabled={busy} onClick={() => setRecording((value) => !value)} aria-expanded={recording}>
              Record renewal
            </button>
            <button type="button" className={ADMIN_GHOST} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              <Plus size={14} /> One-off invoice
            </button>
          </div>
        }
        id="invoices"
      >
        <div className="-mx-5 -mb-5 mt-1 overflow-hidden rounded-b-3xl border-t border-hairline sm:-mx-6 sm:-mb-6">
        {recording && (
          <form
            className="grid gap-3 border-b border-hairline bg-surface-2/40 px-4 py-4 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end sm:px-5"
            onSubmit={(e) => {
              e.preventDefault();
              void run('renewal', () => recordRenewal(tenant.id, method, reference.trim()), 'Renewal recorded.').then((ok) => {
                if (ok) {
                  setRecording(false);
                  setReference('');
                  onChange();
                }
              });
            }}
          >
            <Field label="Received by">
              <Select value={method} onChange={setMethod} options={methods} />
            </Field>
            <Field label="Reference" hint="Optional. Transaction or voucher number.">
              <TextInput value={reference} onChange={setReference} maxLength={60} placeholder="TXN483320" />
            </Field>
            <button type="submit" disabled={busy} className={ADMIN_PRIMARY}>
              {busy ? 'Saving…' : 'Record renewal'}
            </button>
          </form>
        )}
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
          <Empty emoji="🧾" title="No payments yet" message={tenant.status === 'TRIAL' ? 'A renewal is recorded when the trial ends and the restaurant pays.' : 'Renewals appear here once a payment is recorded.'} />
        ) : (
          <InvoiceList invoices={detail.invoices} showTenant={false} onChange={onChange} />
        )}
        </div>
      </Block>
    </>
  );
}
