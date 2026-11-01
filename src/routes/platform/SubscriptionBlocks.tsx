import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  cancelSubscription,
  changeTenantPlan,
  editSubscription,
  listPlans,
  listSubscriptionChanges,
  planFor,
  reactivateSubscription,
  setOverrides,
  setTenantStatus,
} from '../../api/platformConsole';
import type { PlanKey, SubscriptionEdit, Tenant } from '../../api/platformConsole';
import { changeEffect, formatDay, monthsFree, planPrice, planSummary } from '../../domain/subscription';
import type { BillingInterval, Subscription } from '../../domain/subscription';
import { useAsync } from '../../state/useAsync';
import { ADMIN_DANGER, ADMIN_GHOST, ADMIN_PRIMARY, Field, IntInput, Segmented, Select, TextInput, useCommand } from '../../components/admin/kit';
import { DatePicker } from '../../components/admin/DatePicker';
import { Block } from '../../components/admin/profile';
import { Minus, Plus, Sliders } from '../../components/icons';
import { cx } from '../../components/ui';
import { relTime, rupees } from './kit';

/**
 * The two blocks an operator acts from on a restaurant page:
 *  - SubscriptionBlock: what they pay for, read at a glance, edited in place with one Save.
 *  - AccessBlock: the rare, serious actions (suspend, cancel) kept apart from everyday edits.
 */

type Tri = 'plan' | 'on' | 'off';
type Tier = 'plan' | 'basic' | 'full';

/** The viewer's local calendar day, to match `endOfDay`. */
const day = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** End of the chosen day, so "until 1 Dec" still covers the whole of 1 Dec. */
const endOfDay = (d: string) => new Date(`${d}T23:59:59`).toISOString();
const toTri = (v: boolean | undefined): Tri => (v === undefined ? 'plan' : v ? 'on' : 'off');
const fromTri = (v: Tri) => (v === 'plan' ? null : v === 'on');

function Line({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-3">{k}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-3 border-t border-hairline pt-4 first:border-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <h3 className="text-[13px] font-semibold text-ink-2">{title}</h3>
      {children}
    </fieldset>
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

const EDIT_BUTTON = 'inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[13px] font-semibold text-ink ring-1 ring-hairline ring-inset transition-move hover:bg-surface-3 active:scale-95';

/* ── Subscription ──────────────────────────────────────────────────── */

export function SubscriptionBlock({ tenant, onChange }: { tenant: Tenant; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const plan = planFor(tenant);
  const o = tenant.featureOverrides;
  const closed = tenant.status === 'CANCELLED';
  const trial = tenant.status === 'TRIAL';
  const base = planPrice(plan, tenant.interval);
  const net = base !== null && tenant.discountPercent ? Math.round(base * (1 - tenant.discountPercent / 100)) : base;
  const per = tenant.interval === 'ANNUAL' ? 'year' : 'month';
  const overrides = [
    o.exports !== undefined && `Exports ${o.exports ? 'on' : 'off'}`,
    o.autoStockConsumption !== undefined && `Auto stock use ${o.autoStockConsumption ? 'on' : 'off'}`,
    o.analyticsTier && `${o.analyticsTier === 'full' ? 'Full' : 'Basic'} analytics`,
  ].filter(Boolean);
  const changes = useAsync(
    () => listSubscriptionChanges(tenant.id),
    [tenant.id, tenant.status, tenant.periodEnd, tenant.planKey, tenant.discountPercent, tenant.discountEndsAt, tenant.cancelAtPeriodEnd, tenant.extraBranches, tenant.extraSeats, JSON.stringify(o)],
  );

  return (
    <Block
      title="Subscription"
      hint={`${plan.name} · ${planSummary(plan)}`}
      delay={0}
      id="subscription"
      action={!editing && !closed && (
        <button type="button" className={EDIT_BUTTON} onClick={() => setEditing(true)}>
          <Sliders size={14} /> Edit
        </button>
      )}
    >
      {editing ? (
        <SubscriptionEditor
          // Remount whenever the saved state moves, so the form never carries a stale value into the next save.
          key={[tenant.planKey, tenant.interval, tenant.status, tenant.periodEnd, tenant.trialEndsAt, tenant.discountPercent, tenant.discountEndsAt, tenant.extraBranches, tenant.extraSeats, JSON.stringify(o)].join('|')}
          tenant={tenant}
          onDone={() => {
            setEditing(false);
            onChange();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <dl className="grid gap-2.5 text-[14px]">
          <Line k="Plan">
            {plan.name} · {tenant.interval === 'ANNUAL' ? 'yearly' : 'monthly'}
          </Line>
          <Line k="Price">
            {net === null ? '—' : <span className="tnum">{rupees(net)} / {per}</span>}
            {tenant.discountPercent ? (
              <span className="text-ink-3">
                {' '}
                · {tenant.discountPercent}% off{tenant.discountEndsAt ? ` until ${formatDay(tenant.discountEndsAt)}` : ''}
              </span>
            ) : null}
          </Line>
          <Line k={trial ? 'Trial ends' : closed ? 'Ended' : tenant.cancelAtPeriodEnd ? 'Cancels on' : 'Paid until'}>{formatDay(trial && tenant.trialEndsAt ? tenant.trialEndsAt : tenant.periodEnd)}</Line>
          <Line k="Extra capacity">
            {tenant.extraBranches || tenant.extraSeats ? `+${tenant.extraBranches} branches, +${tenant.extraSeats} seats` : 'None'}
          </Line>
          <Line k="Feature overrides">{overrides.length ? overrides.join(' · ') : 'Follows the plan'}</Line>
        </dl>
      )}

      {(changes.data?.length ?? 0) > 0 && !editing && (
        <details className="mt-4 border-t border-hairline pt-3">
          <summary className="cursor-pointer text-[13px] font-semibold text-ink-3 hover:text-ink">Recent changes ({changes.data?.length})</summary>
          <ul className="mt-2 divide-y divide-hairline">
            {changes.data?.slice(0, 8).map((c) => (
              <li key={c.id} className="py-2.5">
                <p className="text-[13.5px] font-medium text-ink-2">{c.detail || c.action}</p>
                <p className="mt-0.5 text-[12.5px] text-ink-4">
                  {c.reason} · {relTime(c.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Block>
  );
}

function SubscriptionEditor({ tenant, onDone, onCancel }: { tenant: Tenant; onDone: () => void; onCancel: () => void }) {
  const plans = useAsync(listPlans, []);
  const { busy, run } = useCommand();
  const current = planFor(tenant);
  const o = tenant.featureOverrides;
  const trial = tenant.status === 'TRIAL';
  const today = day(new Date().toISOString());
  // A deliberately late-bound state: only fields that differ from what is saved are sent.
  const [planKey, setPlanKey] = useState<PlanKey>(tenant.planKey);
  const [interval, setInterval] = useState<BillingInterval>(tenant.interval);
  const [extraB, setExtraB] = useState(tenant.extraBranches);
  const [extraS, setExtraS] = useState(tenant.extraSeats);
  const [percent, setPercent] = useState<number | ''>(tenant.discountPercent ?? '');
  const [until, setUntil] = useState(day(tenant.discountEndsAt));
  const [ends, setEnds] = useState(day(trial ? tenant.trialEndsAt : tenant.periodEnd));
  const [exports, setExports] = useState<Tri>(toTri(o.exports));
  const [stock, setStock] = useState<Tri>(toTri(o.autoStockConsumption));
  const [tier, setTier] = useState<Tier>(o.analyticsTier ?? 'plan');
  const [reason, setReason] = useState('');

  const all = plans.data?.plans ?? [];
  const target = all.find((p) => p.key === planKey);
  const planChanged = planKey !== tenant.planKey || interval !== tenant.interval;
  const capacityChanged = extraB !== tenant.extraBranches || extraS !== tenant.extraSeats;

  const adjust: Omit<SubscriptionEdit, 'reason'> = {};
  const wantPercent = percent === '' || percent === 0 ? null : percent;
  if (wantPercent !== tenant.discountPercent) adjust.discountPercent = wantPercent;
  if (wantPercent === null) {
    if (tenant.discountPercent !== null) adjust.discountEndsAt = null;
  } else if (until !== day(tenant.discountEndsAt)) adjust.discountEndsAt = until ? endOfDay(until) : null;
  const savedEnd = day(trial ? tenant.trialEndsAt : tenant.periodEnd);
  if (ends && ends !== savedEnd) adjust[trial ? 'trialEndsAt' : 'currentPeriodEnd'] = endOfDay(ends);
  const features: NonNullable<SubscriptionEdit['featureOverrides']> = {};
  if (exports !== toTri(o.exports)) features.exports = fromTri(exports);
  if (stock !== toTri(o.autoStockConsumption)) features.autoStockConsumption = fromTri(stock);
  if (tier !== (o.analyticsTier ?? 'plan')) features.analyticsTier = tier === 'plan' ? null : tier;
  if (Object.keys(features).length) adjust.featureOverrides = features;

  const needsReason = Object.keys(adjust).length > 0;
  const reasonOk = reason.trim().length >= 3;
  const badPercent = percent !== '' && percent > 100;
  const dirty = planChanged || capacityChanged || needsReason;

  const effect =
    target && planChanged
      ? changeEffect({ status: tenant.status, plan: current } as Subscription, target) === 'now'
        ? 'Takes effect now, and the next invoice uses the new price.'
        : `Takes effect on ${formatDay(tenant.periodEnd)}, when the paid period ends.`
      : null;
  const price = target ? planPrice(target, interval) : null;
  const triOptions = (on: boolean): { value: Tri; label: string }[] => [
    { value: 'plan', label: `Plan (${on ? 'on' : 'off'})` },
    { value: 'on', label: 'On' },
    { value: 'off', label: 'Off' },
  ];

  const save = () =>
    void run(
      'save',
      async () => {
        if (planChanged) await changeTenantPlan(tenant.id, planKey, interval);
        if (capacityChanged) await setOverrides(tenant.id, extraB, extraS);
        if (needsReason) await editSubscription(tenant.id, { ...adjust, reason: reason.trim() });
      },
      'Subscription saved.',
    ).then((ok) => ok && onDone());

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && (!needsReason || reasonOk) && !badPercent) save();
      }}
    >
      <Group title="Plan">
        <Field label="Plan">
          <Select<PlanKey> value={planKey} onChange={setPlanKey} options={all.map((p) => ({ value: p.key as PlanKey, label: `${p.name}${p.key === tenant.planKey ? ' (current)' : ''}` }))} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<BillingInterval> label="Billing" value={interval} onChange={setInterval} options={[{ value: 'MONTHLY', label: 'Monthly' }, { value: 'ANNUAL', label: 'Yearly' }]} />
          {target && interval === 'ANNUAL' && monthsFree(target) > 0 && <span className="text-[12.5px] font-semibold text-mint-ink">{monthsFree(target)} months free</span>}
        </div>
        {target && planChanged && (
          <p className="text-[13px] text-ink-3">
            {target.name}: {price === null ? '—' : rupees(price)} {interval === 'ANNUAL' ? 'a year' : 'a month'}. {effect}
          </p>
        )}
      </Group>

      <Group title="Extra capacity">
        <Stepper label={`Extra branches (plan includes ${current.limits.branches ?? '∞'})`} value={extraB} onChange={setExtraB} />
        <Stepper label={`Extra staff seats (plan includes ${current.limits.staffSeats ?? '∞'})`} value={extraS} onChange={setExtraS} />
      </Group>

      <Group title="Price and dates">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Discount %" error={badPercent ? 'Between 0 and 100.' : undefined}>
            <IntInput value={percent} onChange={setPercent} placeholder="0" />
          </Field>
          <Field label="Discount ends" hint="Blank = no end date">
            <DatePicker value={until} min={today} onChange={setUntil} aria-label="Discount ends" />
          </Field>
        </div>
        <Field label={trial ? 'Trial ends' : 'Paid until'} hint={trial ? undefined : 'Open invoices are voided so the next one matches.'}>
          <DatePicker value={ends} min={today} onChange={setEnds} clearable={false} aria-label={trial ? 'Trial ends' : 'Paid until'} />
        </Field>
      </Group>

      <Group title="Features for this restaurant">
        <Field label="Exports">
          <Segmented<Tri> label="Exports" value={exports} onChange={setExports} options={triOptions(current.features.exports)} />
        </Field>
        <Field label="Automatic stock use">
          <Segmented<Tri> label="Automatic stock use" value={stock} onChange={setStock} options={triOptions(current.features.autoStockConsumption)} />
        </Field>
        <Field label="Analytics">
          <Select<Tier>
            value={tier}
            onChange={setTier}
            options={[
              { value: 'plan', label: `Plan (${current.features.analyticsTier === 'full' ? 'full' : 'basic'})` },
              { value: 'basic', label: 'Basic' },
              { value: 'full', label: 'Full' },
            ]}
          />
        </Field>
      </Group>

      {needsReason && (
        <Field label="Reason" hint="Required for price, date and feature changes. Recorded in the change log.">
          <TextInput value={reason} onChange={setReason} maxLength={140} placeholder="Agreed 20% for the first year" />
        </Field>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" className={ADMIN_GHOST} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={ADMIN_PRIMARY} disabled={busy || !dirty || badPercent || (needsReason && !reasonOk)}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

/* ── Access ────────────────────────────────────────────────────────── */

type Asking = null | 'suspend' | 'cancel';

export function AccessBlock({ tenant, onChange }: { tenant: Tenant; onChange: () => void }) {
  const { busy, run } = useCommand();
  const [asking, setAsking] = useState<Asking>(null);
  const [reason, setReason] = useState('');
  const closed = tenant.status === 'CANCELLED';
  const suspended = tenant.status === 'SUSPENDED';
  const ok = reason.trim().length >= 3;
  const done = (good: boolean) => {
    if (!good) return;
    setAsking(null);
    setReason('');
    onChange();
  };

  const reasonField = (
    <Field label="Reason" hint="Required. Recorded in the change log; a suspension reason is also shown to the owner.">
      <TextInput value={reason} onChange={setReason} maxLength={140} autoFocus />
    </Field>
  );

  let body: ReactNode;
  if (closed || tenant.cancelAtPeriodEnd) {
    body = (
      <div className="grid gap-3">
        <p className="text-[13.5px] text-ink-3">{closed ? 'Cancelled. Their menu and order history are kept.' : `Set to cancel on ${formatDay(tenant.periodEnd)}.`}</p>
        {reasonField}
        <div className="flex justify-end">
          <button type="button" className={ADMIN_PRIMARY} disabled={busy || !ok} onClick={() => void run('reactivate', () => reactivateSubscription(tenant.id, reason.trim()), 'Subscription reactivated.').then(done)}>
            Reactivate
          </button>
        </div>
      </div>
    );
  } else if (asking === 'suspend') {
    body = (
      <div className="grid gap-3">
        {reasonField}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={ADMIN_GHOST} onClick={() => setAsking(null)}>
            Keep open
          </button>
          <button type="button" className={ADMIN_DANGER} disabled={busy || !ok} onClick={() => void run('suspend', () => setTenantStatus(tenant.id, 'SUSPENDED', reason.trim()), `${tenant.name} suspended.`).then(done)}>
            Suspend restaurant
          </button>
        </div>
      </div>
    );
  } else if (asking === 'cancel') {
    const atEnd = tenant.status === 'TRIAL' || tenant.status === 'ACTIVE';
    body = (
      <div className="grid gap-3">
        {reasonField}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={ADMIN_GHOST} onClick={() => setAsking(null)}>
            Keep subscription
          </button>
          {atEnd && (
            <button type="button" className={ADMIN_GHOST} disabled={busy || !ok} onClick={() => void run('cancel-end', () => cancelSubscription(tenant.id, 'PERIOD_END', reason.trim()), 'Will cancel at period end.').then(done)}>
              At period end
            </button>
          )}
          <button type="button" className={ADMIN_DANGER} disabled={busy || !ok} onClick={() => void run('cancel-now', () => cancelSubscription(tenant.id, 'NOW', reason.trim()), 'Subscription cancelled.').then(done)}>
            Cancel now
          </button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="grid gap-3">
        {suspended ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-[40ch] text-[13.5px] text-ink-3">Suspended{tenant.suspendedReason ? `: ${tenant.suspendedReason}` : '.'} Staff cannot sign in.</p>
            <button type="button" className={ADMIN_PRIMARY} disabled={busy} onClick={() => void run('restore', () => setTenantStatus(tenant.id, 'ACTIVE'), `${tenant.name} restored.`).then(done)}>
              Restore access
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-[40ch] text-[13.5px] text-ink-3">Stops staff signing in and diners ordering. History is kept.</p>
            <button type="button" className={ADMIN_DANGER} onClick={() => setAsking('suspend')}>
              Suspend…
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3">
          <p className="max-w-[40ch] text-[13.5px] text-ink-3">End the subscription now, or when the paid period runs out. It can be reactivated.</p>
          <button type="button" className={cx(ADMIN_DANGER)} onClick={() => setAsking('cancel')}>
            Cancel…
          </button>
        </div>
      </div>
    );
  }

  return (
    <Block title="Access" hint={closed ? 'Closed' : suspended ? 'Suspended' : 'Open to staff and diners'} delay={320}>
      {body}
    </Block>
  );
}
