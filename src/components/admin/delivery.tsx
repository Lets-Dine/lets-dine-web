import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IS_LIVE_API } from '../../api/http';
import { assignDelivery, completeDelivery, fetchDispatchBook, recordSettlement } from '../../api/delivery';
import type { DispatchDraft, PartnerDraft, RiderDraft, SettleOrderInput } from '../../api/delivery';
import { formatMoney } from '../../domain/money';
import {
  RIDER_KIND_LABEL,
  RIDER_PAY_LABEL,
  balanceWords,
  partnerFee,
  partnerTerms,
  riderFee,
  riderTerms,
} from '../../domain/delivery';
import type { Account, Balance, DeliveryAssignment, DeliveryData, DeliveryPartner, Rider } from '../../domain/delivery';
import type { Minor, Order } from '../../domain/types';
import { useAsync } from '../../state/useAsync';
import { DISPLAY, cx } from '../ui';
import { Bike, Handshake, X } from '../icons';
import { ADMIN_GHOST, Field, MoneyInput, PercentInput, Segmented, Select, TextInput, Toggle, useCommand } from './kit';
import { FOOT_PRIMARY, SHEET_FOOT, Sheet } from './Sheet';

/* ── Identity ──────────────────────────────────────────────────────── */

/** Each pair is [fill token, ink token]. Written out so Tailwind-free CSS vars resolve on both admin themes. */
const TINTS: [string, string][] = [
  ['--color-flame-2', '--color-flame-1'],
  ['--color-gold', '--color-gold-ink'],
  ['--color-mint', '--color-mint-ink'],
  ['--color-pass', '--color-pass'],
  ['--color-berry', '--color-berry-ink'],
  ['--color-leaf', '--color-leaf'],
];

/** A name always lands on the same tint, so a courier is recognisable across the list, the card and the statement. */
function tintStyle(name: string): CSSProperties {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const [fill, ink] = TINTS[hash % TINTS.length];
  return { background: `color-mix(in oklab, var(${fill}) 20%, var(--color-surface))`, color: `var(${ink})` };
}

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export function Monogram({ name, size = 'md', shape = 'round' }: { name: string; size?: 'sm' | 'md' | 'lg'; shape?: 'round' | 'tile' }) {
  return (
    <span
      aria-hidden
      style={tintStyle(name)}
      className={cx(
        'grid shrink-0 place-items-center font-semibold tracking-tight',
        shape === 'tile' ? 'rounded-2xl' : 'rounded-full',
        size === 'sm' && 'size-9 text-[13px]',
        size === 'md' && 'size-11 text-[15px]',
        size === 'lg' && 'size-14 text-[19px]',
      )}
    >
      {initials(name) || '·'}
    </span>
  );
}

/* ── Balances ──────────────────────────────────────────────────────── */

export const TONE_TEXT = { 'owes-us': 'text-gold-ink', 'we-owe': 'text-pass', square: 'text-ink-4' } as const;
const TONE_BAR = { 'owes-us': 'bg-gold', 'we-owe': 'bg-pass', square: 'bg-ink-4' } as const;

/**
 * The Ledger Line: an axis with a tick at zero. The bar grows right when the courier holds the
 * branch's cash and left when the branch owes them, scaled to the biggest balance on the page so
 * lines compare across couriers.
 */
export function LedgerLine({ net, max, compact = false }: { net: Minor; max: Minor; compact?: boolean }) {
  const { tone, label } = balanceWords(net);
  const share = max > 0 ? Math.min(1, Math.abs(net) / max) : 0;
  // Starts at zero and grows once painted — the one authored moment on this page.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const width = `${(grown ? share : 0) * 50}%`;
  return (
    <span role="img" aria-label={`${label}${net === 0 ? '' : `, ${Math.abs(net)}`}`} className={cx('relative block w-full rounded-full bg-ink/8', compact ? 'h-1' : 'h-1.5')}>
      {net !== 0 && (
        <span
          className={cx('absolute inset-y-0 rounded-full motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-out-quart', TONE_BAR[tone])}
          style={net > 0 ? { left: '50%', width } : { right: '50%', width }}
        />
      )}
      <span className={cx('absolute left-1/2 w-px -translate-x-1/2 bg-ink/45', compact ? '-inset-y-0.5' : '-inset-y-1')} />
    </span>
  );
}

/** The balance as words and a figure — "Holds your cash  Rs 4,200". */
export function BalanceFigure({ balance, currency, align = 'left', size = 'md' }: { balance: Balance; currency: string; align?: 'left' | 'right'; size?: 'md' | 'lg' }) {
  const { tone, label } = balanceWords(balance.net);
  return (
    <span className={cx('block', align === 'right' && 'text-right')}>
      <span className={cx('block font-semibold tnum tracking-tight', size === 'lg' ? 'text-[26px] leading-none' : 'text-[16px]', TONE_TEXT[tone])}>
        {tone === 'square' ? formatMoney(0, currency) : formatMoney(Math.abs(balance.net), currency)}
      </span>
      <span className="mt-1 block text-[12px] text-ink-3">{label}</span>
    </span>
  );
}

export function Chip({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'mint' | 'gold' | 'warn' }) {
  return (
    <span
      className={cx(
        'inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[12px] font-semibold ring-1 ring-inset',
        tone === 'plain' && 'bg-surface-2 text-ink-3 ring-hairline',
        tone === 'mint' && 'bg-mint/12 text-mint-ink ring-mint/25',
        tone === 'gold' && 'bg-gold/12 text-gold-ink ring-gold/25',
        tone === 'warn' && 'bg-berry/10 text-berry-ink ring-berry/25',
      )}
    >
      {children}
    </span>
  );
}

/* ── Sheet furniture ───────────────────────────────────────────────── */

export function SheetHeader({ title, intro, onClose }: { title: string; intro?: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5">
      <div className="min-w-0">
        <h2 className={cx(DISPLAY, 'text-[24px]')}>{title}</h2>
        {intro && <p className="mt-1 max-w-[42ch] text-[13px] leading-relaxed text-ink-3">{intro}</p>}
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3 ring-1 ring-hairline ring-inset transition-move hover:text-ink active:scale-90"
      >
        <X size={16} />
      </button>
    </div>
  );
}

/** A plain-language read-back of what pressing the button will do, set quietly under the fields. */
export function Outcome({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-surface-2/70 px-3.5 py-3 text-[13px] leading-relaxed text-ink-2 ring-1 ring-hairline ring-inset">{children}</p>;
}

/* ── Courier fields (shared by the add sheets and the detail pages) ── */

export const emptyPartnerDraft = (): PartnerDraft => ({ name: '', phone: '', contactPerson: '', note: '', feeModel: 'FLAT', feeValue: 0, collectsCash: true });
export const emptyRiderDraft = (): RiderDraft => ({ name: '', phone: '', kind: 'STAFF', partnerId: null, vehicle: '', note: '', payModel: 'SALARIED', payValue: 0 });

export const partnerDraftOf = (p: DeliveryPartner): PartnerDraft => ({
  name: p.name, phone: p.phone, contactPerson: p.contactPerson, note: p.note, feeModel: p.feeModel, feeValue: p.feeValue, collectsCash: p.collectsCash,
});
export const riderDraftOf = (r: Rider): RiderDraft => ({
  name: r.name, phone: r.phone, kind: r.kind, partnerId: r.partnerId, vehicle: r.vehicle, note: r.note, payModel: r.payModel, payValue: r.payValue,
});

export function PartnerFields({ draft, onChange, currency }: { draft: PartnerDraft; onChange: (next: PartnerDraft) => void; currency: string }) {
  const set = <K extends keyof PartnerDraft>(key: K, value: PartnerDraft[K]) => onChange({ ...draft, [key]: value });
  // Percent is typed as text so "12." survives the keystroke; basis points are what is stored.
  const [percentText, setPercentText] = useState(draft.feeModel === 'PERCENT' && draft.feeValue ? String(draft.feeValue / 100) : '');
  return (
    <>
      <Field label="Name">
        <TextInput value={draft.name} onChange={(v) => set('name', v)} maxLength={60} placeholder="Roadrunner Couriers" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone">
          <TextInput value={draft.phone} onChange={(v) => set('phone', v)} maxLength={30} placeholder="98XXXXXXXX" />
        </Field>
        <Field label="Contact person" hint="Optional.">
          <TextInput value={draft.contactPerson} onChange={(v) => set('contactPerson', v)} maxLength={60} />
        </Field>
      </div>
      <div className="grid gap-3">
        <span className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-4">What they charge</span>
        <Segmented
          label="Fee model"
          value={draft.feeModel}
          onChange={(feeModel) => {
            setPercentText('');
            onChange({ ...draft, feeModel, feeValue: 0 });
          }}
          options={[
            { value: 'FLAT', label: 'Flat' },
            { value: 'PERCENT', label: 'Percent' },
            { value: 'NONE', label: 'No fee' },
          ]}
        />
        {draft.feeModel === 'FLAT' && (
          <Field label="Per delivery" hint="Added to what you owe them each time they deliver.">
            <MoneyInput key="flat" value={draft.feeValue} onChange={(v) => set('feeValue', v)} currency={currency} />
          </Field>
        )}
        {draft.feeModel === 'PERCENT' && (
          <Field label="Share of each order" hint="Worked out on the order total when you dispatch it.">
            <PercentInput
              value={percentText}
              onChange={(text) => {
                setPercentText(text);
                set('feeValue', Math.round((Number.parseFloat(text) || 0) * 100));
              }}
            />
          </Field>
        )}
        {draft.feeModel === 'NONE' && <p className="text-[12.5px] leading-snug text-ink-3">Nothing accrues per delivery. Use this for a partner you pay another way.</p>}
      </div>
      <Toggle
        checked={draft.collectsCash}
        onChange={(v) => set('collectsCash', v)}
        label="Collects cash from the customer"
        hint="Cash they take at the door becomes money they owe you until they hand it over."
      />
      <Field label="Notes" hint="Optional. Settlement day, account details, anything to remember.">
        <TextInput value={draft.note} onChange={(v) => set('note', v)} maxLength={200} />
      </Field>
    </>
  );
}

export function RiderFields({ draft, onChange, currency, partners }: { draft: RiderDraft; onChange: (next: RiderDraft) => void; currency: string; partners: DeliveryPartner[] }) {
  const set = <K extends keyof RiderDraft>(key: K, value: RiderDraft[K]) => onChange({ ...draft, [key]: value });
  const partnered = draft.partnerId !== null;
  return (
    <>
      <Field label="Name">
        <TextInput value={draft.name} onChange={(v) => set('name', v)} maxLength={60} placeholder="Ramesh Thapa" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone">
          <TextInput value={draft.phone} onChange={(v) => set('phone', v)} maxLength={30} placeholder="98XXXXXXXX" />
        </Field>
        <Field label="Vehicle" hint="Optional.">
          <TextInput value={draft.vehicle} onChange={(v) => set('vehicle', v)} maxLength={60} placeholder="Bike · plate" />
        </Field>
      </div>
      <div className="grid gap-3">
        <span className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-4">Who they ride for</span>
        <Segmented
          label="Rider kind"
          value={draft.kind}
          onChange={(kind) => set('kind', kind)}
          options={[
            { value: 'STAFF', label: RIDER_KIND_LABEL.STAFF },
            { value: 'FREELANCE', label: RIDER_KIND_LABEL.FREELANCE },
          ]}
        />
        {partners.length > 0 && (
          <Field label="Partner" hint={partnered ? 'Their cash and fees settle through the partner, not through them.' : 'Leave empty if they ride for the branch directly.'}>
            <Select
              value={draft.partnerId ?? ''}
              onChange={(id) => onChange({ ...draft, partnerId: id || null, ...(id ? { payModel: 'SALARIED', payValue: 0 } : {}) })}
              options={[{ value: '', label: 'Rides for the branch' }, ...partners.map((p) => ({ value: p.id, label: p.name }))]}
            />
          </Field>
        )}
      </div>
      {!partnered && (
        <div className="grid gap-3">
          <span className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-4">How they are paid</span>
          <Segmented
            label="Pay model"
            value={draft.payModel}
            onChange={(payModel) => onChange({ ...draft, payModel, payValue: payModel === 'SALARIED' ? 0 : draft.payValue })}
            options={[
              { value: 'SALARIED', label: 'Salaried' },
              { value: 'PER_DELIVERY', label: 'Per delivery' },
            ]}
          />
          {draft.payModel === 'PER_DELIVERY' ? (
            <Field label="Per delivery" hint="Added to what you owe them each time they deliver.">
              <MoneyInput key="per" value={draft.payValue} onChange={(v) => set('payValue', v)} currency={currency} />
            </Field>
          ) : (
            <p className="text-[12.5px] leading-snug text-ink-3">{RIDER_PAY_LABEL.SALARIED}. They only ever hand over cash.</p>
          )}
        </div>
      )}
      <Field label="Notes" hint="Optional.">
        <TextInput value={draft.note} onChange={(v) => set('note', v)} maxLength={200} />
      </Field>
    </>
  );
}

/* ── Paying a courier ──────────────────────────────────────────────── */

/**
 * Pays a courier the fees they are owed — all of it or part, now or long after the deliveries. A courier's cash is
 * not settled here: it comes in when each delivered order is settled, on its ticket.
 */
export function SettleSheet({
  branchId,
  account,
  name,
  balance,
  currency,
  onClose,
  onDone,
}: {
  branchId: string;
  account: Account;
  name: string;
  balance: Balance;
  currency: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { pending, busy, run } = useCommand();
  const owed = Math.max(balance.feesOwed, 0);
  const [amount, setAmount] = useState<Minor>(owed);
  const [method, setMethod] = useState<'CASH' | 'BANK'>('CASH');
  const [note, setNote] = useState('');
  const over = amount > owed;
  const rest = owed - amount;
  const first = name.split(' ')[0] || name;

  return (
    <Sheet label={`Pay ${name}`} onClose={onClose}>
      {(close) => (
        <>
          <SheetHeader
            title={`Pay ${first}`}
            intro={`You owe ${first} ${formatMoney(owed, currency)} in delivery fees.${IS_LIVE_API ? ' The payment is entered in the cash book.' : ''}`}
            onClose={() => close()}
          />
          <form
            className="grid flex-1 grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-y-auto px-5 pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (amount <= 0 || over) return;
              void run('settle', () => recordSettlement(branchId, account, { direction: 'PAYOUT', amount, offset: 0, method, note }), 'Payment recorded').then((ok) => {
                if (!ok) return;
                onDone();
                close();
              });
            }}
          >
            <Field label="Amount" hint={`Up to ${formatMoney(owed, currency)}, everything you owe. Pay part now and the rest later if you like.`}>
              <MoneyInput value={amount} onChange={setAmount} currency={currency} />
            </Field>
            <div className="grid gap-1.5">
              <span className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-4">How</span>
              <Segmented
                label="Method"
                value={method}
                onChange={setMethod}
                options={[
                  { value: 'CASH', label: 'Cash from the drawer' },
                  { value: 'BANK', label: 'Bank or wallet' },
                ]}
              />
            </div>
            <Field label="Note" hint="Optional. A statement reference, or who was paid.">
              <TextInput value={note} onChange={setNote} maxLength={120} />
            </Field>
            {over ? (
              <p role="alert" className="rounded-xl bg-berry/10 px-3.5 py-3 text-[13px] leading-relaxed text-berry-ink ring-1 ring-berry/25 ring-inset">
                That is more than you owe {first}. Lower the amount.
              </p>
            ) : (
              <Outcome>{rest === 0 ? `After this, you have paid ${first} everything you owe.` : `After this, you still owe ${first} ${formatMoney(rest, currency)}.`}</Outcome>
            )}
            <div className={SHEET_FOOT}>
              <button type="submit" disabled={busy || amount <= 0 || over} className={FOOT_PRIMARY}>
                {pending === 'settle' ? 'Recording…' : 'Record payment'}
              </button>
              <button type="button" className={cx(ADMIN_GHOST, 'h-11')} onClick={() => close()}>
                Cancel
              </button>
            </div>
          </form>
        </>
      )}
    </Sheet>
  );
}

/* ── Dispatch: from a delivery ticket ──────────────────────────────── */

type Choice = { kind: 'RIDER' | 'PARTNER'; id: string };

/** Picking who carries an order, what they will be paid and whether they take cash at the door. */
export function DispatchSheet({
  branchId,
  order,
  onClose,
  onDispatch,
}: {
  branchId: string;
  order: Order;
  onClose: () => void;
  /** `null` dispatches with no courier recorded — the ticket still moves. */
  onDispatch: (draft: DispatchDraft | null) => Promise<unknown>;
}) {
  const { pending, busy, run } = useCommand();
  const book = useAsync(() => fetchDispatchBook(branchId), [branchId]);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [fee, setFee] = useState<Minor>(0);
  const [feeKey, setFeeKey] = useState(0);
  const [cash, setCash] = useState(true);

  const data: DeliveryData = book.data ?? { partners: [], riders: [], assignments: [], settlements: [] };
  const riders = data.riders.filter((r) => r.isActive);
  const partners = data.partners.filter((p) => p.isActive);
  const rider = choice?.kind === 'RIDER' ? (riders.find((r) => r.id === choice.id) ?? null) : null;
  const partner = choice?.kind === 'PARTNER' ? (partners.find((p) => p.id === choice.id) ?? null) : null;
  const ridersPartner = rider?.partnerId ? (data.partners.find((p) => p.id === rider.partnerId) ?? null) : null;
  const carrier = partner ?? ridersPartner;
  const collects = carrier ? carrier.collectsCash : true;
  const cashDue = cash && collects ? order.total : 0;
  const currency = order.currency;
  const busyRuns = (kind: 'RIDER' | 'PARTNER', id: string) =>
    data.assignments.filter((a) => a.status === 'ASSIGNED' && (kind === 'RIDER' ? a.riderId === id : a.partnerId === id)).length;

  const choose = (next: Choice) => {
    setChoice(next);
    const r = next.kind === 'RIDER' ? riders.find((x) => x.id === next.id) : null;
    const p = next.kind === 'PARTNER' ? partners.find((x) => x.id === next.id) : null;
    const viaPartner = r?.partnerId ? data.partners.find((x) => x.id === r.partnerId) : null;
    setFee(p ? partnerFee(p, order.total) : viaPartner ? partnerFee(viaPartner, order.total) : r ? riderFee(r) : 0);
    setFeeKey((k) => k + 1);
  };

  const submit = (draft: DispatchDraft | null) =>
    void run(
      'dispatch',
      async () => {
        if (draft) await assignDelivery(branchId, order, draft);
        await onDispatch(draft);
      },
      `${order.reference} out for delivery`,
    );

  const nobody = book.data && riders.length === 0 && partners.length === 0;

  return (
    <Sheet label={`Dispatch ${order.reference}`} onClose={onClose}>
      {(close) => (
        <>
          <SheetHeader title={`Send out ${order.reference}`} intro={`${order.deliveryCustomerName || 'Guest'} · ${order.deliveryAddress || 'No address on file'}`} onClose={() => close()} />
          <form
            className="grid flex-1 grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-y-auto px-5 pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!choice) return;
              submit({ riderId: rider?.id ?? null, partnerId: partner?.id ?? null, courierFee: fee, cashToCollect: cashDue });
              close();
            }}
          >
            {book.loading && !book.data ? (
              <div className="grid gap-2" role="status" aria-label="Loading couriers">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="shimmer-bg animate-shimmer h-14 rounded-xl" style={{ opacity: 1 - i * 0.2 }} />
                ))}
              </div>
            ) : nobody ? (
              <div className="grid justify-items-start gap-2 rounded-2xl bg-surface-2/60 p-4 ring-1 ring-hairline ring-inset">
                <p className="text-[14px] font-semibold">No riders or partners yet</p>
                <p className="text-[13px] leading-relaxed text-ink-3">Add the people who deliver for this branch and you can hand orders to them here, with their fee and the cash they collect tracked for you.</p>
                <Link to="/admin/delivery" className={cx(ADMIN_GHOST, 'mt-1 h-9 text-[13px]')}>
                  Add a rider or partner
                </Link>
              </div>
            ) : (
              <fieldset className="grid gap-2">
                <legend className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-4">Who is taking it</legend>
                {partners.map((p) => (
                  <ChoiceRow key={p.id} name={p.name} sub={`Partner · ${partnerTerms(p, (m) => formatMoney(m, currency))}`} runs={busyRuns('PARTNER', p.id)} checked={choice?.kind === 'PARTNER' && choice.id === p.id} onPick={() => choose({ kind: 'PARTNER', id: p.id })} />
                ))}
                {riders.map((r) => (
                  <ChoiceRow
                    key={r.id}
                    name={r.name}
                    sub={`${r.partnerId ? `Rides for ${data.partners.find((p) => p.id === r.partnerId)?.name ?? 'a partner'}` : RIDER_KIND_LABEL[r.kind]} · ${riderTerms(r, (m) => formatMoney(m, currency))}`}
                    runs={busyRuns('RIDER', r.id)}
                    checked={choice?.kind === 'RIDER' && choice.id === r.id}
                    onPick={() => choose({ kind: 'RIDER', id: r.id })}
                  />
                ))}
              </fieldset>
            )}

            {choice && (
              <>
                <Field label="Their fee for this run" hint="Filled in from their terms. Change it if today is different.">
                  <MoneyInput key={feeKey} value={fee} onChange={setFee} currency={currency} />
                </Field>
                {collects ? (
                  <Toggle checked={cash} onChange={setCash} label="Customer pays cash at the door" hint={cash ? `They will bring back ${formatMoney(order.total, currency)}.` : 'Already paid, so there is no cash to bring back.'} />
                ) : (
                  <p className="text-[12.5px] leading-snug text-ink-3">{carrier?.name} does not collect cash, so nothing comes back from this run.</p>
                )}
              </>
            )}

            <div className={SHEET_FOOT}>
              <button type="submit" disabled={busy || !choice} className={FOOT_PRIMARY}>
                {pending === 'dispatch' ? 'Sending…' : 'Send out for delivery'}
              </button>
              <button
                type="button"
                disabled={busy}
                className={cx(ADMIN_GHOST, 'h-11')}
                onClick={() => {
                  submit(null);
                  close();
                }}
              >
                Skip courier
              </button>
            </div>
          </form>
        </>
      )}
    </Sheet>
  );
}

function ChoiceRow({ name, sub, runs, checked, onPick }: { name: string; sub: string; runs: number; checked: boolean; onPick: () => void }) {
  return (
    <label
      className={cx(
        'flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 ring-1 ring-inset transition-[background-color,box-shadow] duration-150',
        checked ? 'bg-flame/10 ring-[1.5px] ring-flame-2/60' : 'bg-surface-2/50 ring-hairline hover:bg-surface-2',
      )}
    >
      <input type="radio" name="courier" checked={checked} onChange={onPick} className="sr-only" />
      <Monogram name={name} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold">{name}</span>
        <span className="block truncate text-[12.5px] text-ink-3">{sub}</span>
      </span>
      {runs > 0 && <Chip tone="mint">{runs} out</Chip>}
    </label>
  );
}

/* ── Handing cash back, from a delivery ticket ─────────────────────── */

export function HandoverSheet({
  order,
  run: assignment,
  onClose,
  onDelivered,
}: {
  order: Order;
  run: DeliveryAssignment;
  onClose: () => void;
  onDelivered: () => Promise<unknown>;
}) {
  const { pending, busy, run } = useCommand();
  const [cash, setCash] = useState<Minor>(assignment.cashToCollect);
  const short = assignment.cashToCollect - cash;
  const currency = order.currency;
  const submit = () => void run('deliver', async () => { await completeDelivery(order.id, cash); await onDelivered(); }, `${order.reference} delivered`);

  return (
    <Sheet label={`Delivered ${order.reference}`} onClose={onClose}>
      {(close) => (
        <>
          <SheetHeader title={`Delivered ${order.reference}`} intro="Record the cash that came back so the rider's balance stays right." onClose={() => close()} />
          <form
            className="grid flex-1 grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-y-auto px-5 pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
              close();
            }}
          >
            <Field label="Cash collected at the door" hint={`The order was ${formatMoney(assignment.cashToCollect, currency)}.`}>
              <MoneyInput value={cash} onChange={setCash} currency={currency} />
            </Field>
            <Outcome>
              {short > 0
                ? `${formatMoney(short, currency)} short. It is recorded as collected, so the rider's balance shows what they actually hold.`
                : short < 0
                  ? `${formatMoney(-short, currency)} more than the order total — a tip, or a change error. Check before you settle.`
                  : 'The full amount came back.'}
            </Outcome>
            <div className={SHEET_FOOT}>
              <button type="submit" disabled={busy} className={FOOT_PRIMARY}>
                {pending === 'deliver' ? 'Saving…' : 'Mark delivered'}
              </button>
              <button type="button" className={cx(ADMIN_GHOST, 'h-11')} onClick={() => close()}>
                Cancel
              </button>
            </div>
          </form>
        </>
      )}
    </Sheet>
  );
}

/* ── Settling a delivered order, from its ticket ───────────────────── */

function SettleLine({ label, children, strong = false }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline py-2.5 last:border-0">
      <dt className="text-[13.5px] text-ink-3">{label}</dt>
      <dd className={cx('text-right text-[14.5px] tnum', strong ? 'font-semibold text-ink' : 'text-ink-2')}>{children}</dd>
    </div>
  );
}

/**
 * The money side of a delivery. The order has arrived and is waiting at SETTLE; settling books its payment, takes the
 * courier's cash and pays their fee now or leaves it owed — to be paid later from the courier's page. Everyone who
 * works the pass can settle; paying a fee takes money from the drawer, so that is a manager's choice.
 */
export function SettleOrderSheet({
  order,
  run,
  canPayFee,
  onClose,
  onSettle,
}: {
  order: Order;
  /** The courier's delivered run, or null if the order went out with nobody recorded. */
  run: DeliveryAssignment | null;
  canPayFee: boolean;
  onClose: () => void;
  onSettle: (input: SettleOrderInput) => Promise<unknown>;
}) {
  const { pending, busy, run: command } = useCommand();
  const fee = run?.courierFee ?? 0;
  const cash = run?.cashCollected ?? 0;
  const short = run ? run.cashToCollect - cash : 0;
  const [payFee, setPayFee] = useState(canPayFee && fee > 0);
  const [feeMethod, setFeeMethod] = useState<'CASH' | 'BANK'>('CASH');
  const currency = order.currency;
  const money = (m: Minor) => formatMoney(m, currency);
  const courier = run ? (run.riderName ?? run.partnerName ?? 'the courier') : null;
  const first = courier?.split(' ')[0] ?? '';
  const paidUpFront = run !== null && run.cashToCollect === 0;
  const method = paidUpFront ? 'card' : 'cash';

  const submit = () =>
    void command('settle', () => onSettle({ payFee: payFee && fee > 0, feeMethod }), `${order.reference} settled`);

  return (
    <Sheet label={`Settle ${order.reference}`} onClose={onClose}>
      {(close) => (
        <>
          <SheetHeader
            title={`Settle ${order.reference}`}
            intro={`${order.deliveryCustomerName || 'Guest'} · ${order.deliveryAddress || 'No address on file'}`}
            onClose={() => close()}
          />
          <form
            className="grid flex-1 grid-cols-[minmax(0,1fr)] content-start gap-5 overflow-y-auto px-5 pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
              close();
            }}
          >
            <section>
              <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-4">Payment</h3>
              <dl>
                <SettleLine label="Order total" strong>
                  {money(order.total)}
                </SettleLine>
                <SettleLine label="Recorded as">{paidUpFront ? 'Card payment, paid up front' : 'Cash payment'}</SettleLine>
              </dl>
            </section>

            {run && courier && (
              <section>
                <div className="mb-1 flex items-center gap-2.5">
                  <Monogram name={courier} size="sm" />
                  <h3 className="text-[15px] font-semibold">{courier}</h3>
                  {run.riderName && run.partnerName && <span className="text-[12.5px] text-ink-4">via {run.partnerName}</span>}
                </div>
                <dl>
                  <SettleLine label={`${first} hands over`}>
                    {cash > 0 ? money(cash) : 'Nothing, it was paid up front'}
                    {short > 0 && <Chip tone="warn">{money(short)} short</Chip>}
                  </SettleLine>
                  <SettleLine label="Delivery fee">{fee > 0 ? money(fee) : 'None'}</SettleLine>
                </dl>

                {fee > 0 && (
                  <div className="mt-4 grid gap-3">
                    <span className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-4">The fee</span>
                    <Segmented
                      label="Fee"
                      value={payFee ? 'now' : 'later'}
                      onChange={(v) => canPayFee && setPayFee(v === 'now')}
                      options={[
                        { value: 'now', label: `Pay ${first} now` },
                        { value: 'later', label: 'Pay later' },
                      ]}
                    />
                    {!canPayFee && <p className="text-[12.5px] leading-snug text-ink-3">Only a manager can pay a fee. It stays owed until one does.</p>}
                    {payFee && (
                      <Segmented
                        label="Fee method"
                        value={feeMethod}
                        onChange={setFeeMethod}
                        options={[
                          { value: 'CASH', label: 'Cash from the drawer' },
                          { value: 'BANK', label: 'Bank or wallet' },
                        ]}
                      />
                    )}
                  </div>
                )}
              </section>
            )}

            <Outcome>
              Settling records a {method} payment of {money(order.total)}
              {run && courier ? (
                <>
                  {cash > 0 ? `, takes ${money(cash)} in cash from ${first}` : ''}
                  {fee > 0
                    ? payFee
                      ? ` and pays ${first}'s ${money(fee)} fee ${feeMethod === 'CASH' ? 'from the drawer' : 'by bank'}`
                      : `, and leaves ${first}'s ${money(fee)} fee owed. Pay it later from ${first}'s page`
                    : ''}
                </>
              ) : (
                ''
              )}
              .{IS_LIVE_API ? ' It all goes into the cash book.' : ''}
            </Outcome>

            <div className={SHEET_FOOT}>
              <button type="submit" disabled={busy} className={FOOT_PRIMARY}>
                {pending === 'settle' ? 'Settling…' : 'Settle'}
              </button>
              <button type="button" className={cx(ADMIN_GHOST, 'h-11')} onClick={() => close()}>
                Cancel
              </button>
            </div>
          </form>
        </>
      )}
    </Sheet>
  );
}

/** Used by tickets: who has the order, in a line. */
export function CourierTag({ run }: { run: DeliveryAssignment }) {
  const who = run.riderName ?? run.partnerName ?? 'Courier';
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-2">
      {run.riderName ? <Bike size={13} className="text-mint-ink" /> : <Handshake size={13} className="text-mint-ink" />}
      {who}
      {run.riderName && run.partnerName ? <span className="font-normal text-ink-4">via {run.partnerName}</span> : null}
    </span>
  );
}
