import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatQty } from '../../api/inventory';
import { fetchSupplier, fetchSupplierDeliveries, fetchSupplierPrices, logSupplierIssue, paySupplier, priceLabel, updateSupplier } from '../../api/suppliers';
import type { IngredientPrice, IssueKind, SupplierDelivery, SupplierDetail as Detail } from '../../api/suppliers';
import { ADMIN_GHOST, ADMIN_PRIMARY, Empty, Field, Loading, MoneyInput, Segmented, TextInput, useCommand } from '../../components/admin/kit';
import { PagedSheet } from '../../components/admin/PagedSheet';
import { PurchaseSheet } from '../../components/admin/PurchaseSheet';
import { ReturnSheet } from '../../components/admin/ReturnSheet';
import { Tip } from '../../components/admin/Tip';
import { Block, Num, reduced, useCountUp } from '../../components/admin/profile';
import { Box, Contact, Send } from '../../components/icons';
import { DISPLAY, cx } from '../../components/ui';
import { formatMoney } from '../../domain/money';
import type { Minor, PaymentMethod } from '../../domain/types';
import { useAsync } from '../../state/useAsync';
import { useAuth } from '../../state/AuthContext';
import { useDashboard } from './AdminLayout';

const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const ISSUES: { kind: IssueKind; label: string; noun: string }[] = [
  { kind: 'LATE', label: 'Late', noun: 'late' },
  { kind: 'SHORT', label: 'Short delivery', noun: 'short' },
  { kind: 'QUALITY', label: 'Poor quality', noun: 'poor quality' },
  { kind: 'OTHER', label: 'Other', noun: 'other' },
];

export function SupplierDetail() {
  const { name = '' } = useParams();
  const found = useAsync(() => fetchSupplier(name), [name]);

  if (found.error && !found.loading)
    return (
      <Empty
        emoji="⚠️"
        title="Couldn't load this supplier"
        message={found.error.message}
        action={
          <button type="button" className={ADMIN_GHOST} onClick={found.reload}>
            Try again
          </button>
        }
      />
    );
  if (found.loading && found.data?.name.toLowerCase() !== name.toLowerCase()) return <Loading label="Opening their file…" />;
  if (!found.data)
    return (
      <Empty
        emoji="🔍"
        title="Supplier not found"
        message="They may have been removed, or the link is out of date."
        action={
          <Link to="/admin/suppliers" className={ADMIN_GHOST}>
            Back to suppliers
          </Link>
        }
      />
    );
  return <Page key={found.data.name} item={found.data} reload={found.reload} />;
}

function Page({ item, reload }: { item: Detail; reload: () => void }) {
  const { allows } = useAuth();
  const { menu } = useDashboard();
  const { busy, run } = useCommand();
  const currency = menu.restaurant.currency;
  const canManage = allows('inventory:manage');
  const first = item.name;
  const digits = item.phone.replace(/\D/g, '');
  const wa = `https://wa.me/${digits.length === 10 ? '977' + digits : digits}`;
  const spent = useCountUp(item.spent);
  const owed = useCountUp(item.owed);

  // "View all" lists open here; each pages in more rows as it is scrolled.
  const [modal, setModal] = useState<'deliveries' | 'prices' | null>(null);
  const [buying, setBuying] = useState(false);
  const [returning, setReturning] = useState<SupplierDelivery | null>(null);
  // From the full list, the list closes first: it would be out of date once something is returned.
  const startReturn = (d: SupplierDelivery) => {
    setModal(null);
    setReturning(d);
  };
  const loadDeliveries = useCallback((offset: number) => fetchSupplierDeliveries(item.name, offset), [item.name]);
  const loadPrices = useCallback((offset: number) => fetchSupplierPrices(item.name, offset), [item.name]);

  const [phone, setPhone] = useState(item.phone);
  const [note, setNote] = useState(item.note);
  const dirty = phone.trim() !== item.phone || note.trim() !== item.note;

  const [amount, setAmount] = useState<Minor | ''>('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [payNote, setPayNote] = useState('');

  const pay = () => {
    if (!amount || amount > item.owed) return;
    void run('pay', () => paySupplier({ supplier: item.name, amount, method, note: payNote.trim() }), `${formatMoney(amount, currency)} paid to ${item.name}`).then((ok) => {
      if (!ok) return;
      setAmount('');
      setPayNote('');
      reload();
    });
  };

  const goTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  const issueTotal = ISSUES.reduce((n, i) => n + item.issueCounts[i.kind], 0);

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/admin/suppliers" className="mb-4 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-ink">
        ← Suppliers
      </Link>

      <section className="max-w-3xl">
        <h1 className={cx(DISPLAY, 'animate-rise wrap-break-word text-[clamp(40px,7vw,76px)] leading-[0.98] tracking-[-0.03em]')}>{item.name}</h1>

        <p className="mt-5 max-w-[36ch] animate-rise text-[clamp(20px,2.6vw,28px)] leading-[1.3] font-medium text-ink-2 [animation-delay:80ms]">
          {item.deliveries === 0 ? (
            <>Nothing has been delivered by {first} yet.</>
          ) : (
            <>
              {item.deliveries} {item.deliveries === 1 ? 'delivery' : 'deliveries'}
              {item.spent > 0 && (
                <>
                  , <Num>{formatMoney(spent, currency)}</Num> spent
                </>
              )}
              . Last here <span className="text-ink">{item.lastDeliveryAt ? day.format(new Date(item.lastDeliveryAt)) : 'never'}</span>.
            </>
          )}
        </p>

        <div className="mt-6 flex animate-rise flex-wrap gap-2.5 [animation-delay:160ms]">
          {canManage && (
            <button type="button" onClick={() => setBuying(true)} className={cx(ADMIN_PRIMARY, 'h-11 px-5 text-[14.5px]')}>
              <Box size={16} /> Buy from {item.name}
            </button>
          )}
          {digits && (
            <>
              <a href={`tel:${digits}`} className={cx(canManage ? ADMIN_GHOST : ADMIN_PRIMARY, 'h-11 px-5 text-[14.5px]')}>
                <Contact size={16} /> Call
              </a>
              <a href={wa} target="_blank" rel="noreferrer" className={cx(ADMIN_GHOST, 'h-11 px-5 text-[14.5px]')}>
                <Send size={16} /> WhatsApp
              </a>
            </>
          )}
          {item.owed > 0 && (
            <button
              type="button"
              onClick={() => goTo('owed')}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-berry/16 px-5 text-[14.5px] font-semibold text-berry-ink ring-1 ring-berry/40 ring-inset transition-move active:scale-[0.965]"
            >
              Owed <span className="tnum">{formatMoney(item.owed, currency)}</span>
            </button>
          )}
        </div>
      </section>

      <section aria-label="At a glance" className="mt-12 animate-rise overflow-hidden rounded-[28px] bg-surface-2 ring-1 ring-hairline-strong ring-inset [animation-delay:240ms]">
        <div className="grid divide-y divide-hairline md:grid-cols-3 md:divide-x md:divide-y-0">
          <Cell title="You owe them" alert={item.owed > 0}>
            <p className={cx(DISPLAY, 'text-[30px] tnum', item.owed > 0 && 'text-berry-ink')}>{item.owed > 0 ? formatMoney(owed, currency) : 'Nothing'}</p>
            <p className="mt-1.5 text-[14px] text-ink-3">{item.owed > 0 ? 'From deliveries bought on credit.' : 'Every credit delivery is paid.'}</p>
          </Cell>
          <Cell title="Worth knowing">
            <p className="line-clamp-4 text-[16px] leading-relaxed text-ink-2">{item.note || 'No note saved yet.'}</p>
          </Cell>
          <Cell title="Their record">
            <p className={cx(DISPLAY, 'text-[24px]')}>{issueTotal === 0 ? 'No problems logged' : `${issueTotal} ${issueTotal === 1 ? 'problem' : 'problems'} logged`}</p>
            {issueTotal > 0 && (
              <p className="mt-1.5 text-[14px] text-ink-3">
                {ISSUES.filter((i) => item.issueCounts[i.kind] > 0)
                  .map((i) => `${item.issueCounts[i.kind]} ${i.noun}`)
                  .join(' · ')}
              </p>
            )}
          </Cell>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          <Block
            title="Deliveries"
            hint={item.deliveriesTotal > 0 ? `latest ${item.deliveriesList.length}` : undefined}
            delay={300}
            action={item.deliveriesTotal > item.deliveriesList.length && <ViewAll label={`View all ${item.deliveriesTotal}`} onClick={() => setModal('deliveries')} />}
          >
            {item.deliveriesList.length === 0 ? (
              <p className="text-[13.5px] text-ink-3">Nothing delivered yet. Pick this supplier when you receive stock on the Stock page.</p>
            ) : (
              <DeliveryTable rows={item.deliveriesList} currency={currency} onReturn={canManage ? startReturn : undefined} delay={400} />
            )}
          </Block>

          <Block
            title="Prices"
            hint="latest, against the delivery before"
            delay={360}
            action={item.pricesTotal > item.prices.length && <ViewAll label={`View all ${item.pricesTotal}`} onClick={() => setModal('prices')} />}
          >
            {item.prices.length === 0 ? (
              <p className="text-[13.5px] text-ink-3">No priced deliveries yet. Enter what you paid when a delivery arrives.</p>
            ) : (
              <PriceList rows={item.prices} currency={currency} delay={460} />
            )}
          </Block>
        </div>

        <div className="grid content-start gap-6">
          <Block title="Payments" hint={item.owed > 0 ? 'pay what you owe' : undefined} id="owed" delay={320}>
            {item.owed > 0 && canManage && (
              <form
                className="mb-5 grid gap-3.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  pay();
                }}
              >
                <Field label="Amount">
                  <MoneyInput value={amount} onChange={setAmount} currency={currency} />
                </Field>
                <button type="button" className="justify-self-start text-[12.5px] font-semibold text-flame-1" onClick={() => setAmount(item.owed)}>
                  Pay all {formatMoney(item.owed, currency)}
                </button>
                <Segmented
                  label="Paid with"
                  value={method}
                  onChange={setMethod}
                  options={[
                    { value: 'CASH', label: 'Cash' },
                    { value: 'CARD', label: 'Bank' },
                  ]}
                />
                <Field label="Note (optional)">
                  <TextInput value={payNote} onChange={setPayNote} maxLength={200} placeholder="Bill number, cheque…" />
                </Field>
                {amount !== '' && amount > item.owed && <p className="text-[13px] text-berry-ink">That is more than the {formatMoney(item.owed, currency)} owed.</p>}
                <button type="submit" disabled={busy || !amount || amount > item.owed} className={cx(ADMIN_PRIMARY, 'h-11 justify-self-start px-5')}>
                  {amount ? `Pay ${formatMoney(amount, currency)}` : 'Record payment'}
                </button>
              </form>
            )}
            {item.payments.length === 0 ? (
              <p className="text-[13.5px] text-ink-3">{item.owed > 0 ? 'No payments yet.' : 'Nothing is owed. Mark a delivery “On credit” when it arrives to start a balance.'}</p>
            ) : (
              <ul>
                {item.payments.map((p, i) => (
                  <li key={p.id} className="animate-rise flex items-baseline justify-between gap-3 border-b border-hairline py-3 text-[14px] first:pt-0 last:border-0 last:pb-0" style={{ animationDelay: `${360 + Math.min(i, 10) * 40}ms` }}>
                    <span className="min-w-0">
                      <span className="block text-ink-3">{day.format(new Date(p.createdAt))}</span>
                      {p.note && <span className="block truncate text-[12.5px] text-ink-3">{p.note}</span>}
                    </span>
                    <span className="font-semibold tnum">{formatMoney(p.amount, currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          {item.returns.length > 0 && (
            <Block title="Returns" hint="sent back" delay={350}>
              <ul>
                {item.returns.map((r, i) => (
                  <li key={r.id} className="animate-rise flex items-baseline justify-between gap-3 border-b border-hairline py-3 text-[14px] first:pt-0 last:border-0 last:pb-0" style={{ animationDelay: `${450 + Math.min(i, 10) * 40}ms` }}>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {r.ingredientName} <span className="font-normal text-ink-3 tnum">{formatQty(r.quantity, r.unit)}</span>
                      </span>
                      <span className="block truncate text-[12.5px] text-ink-3">
                        {day.format(new Date(r.createdAt))}
                        {r.note ? ` · ${r.note}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-right tnum">
                      {r.amount > 0 ? formatMoney(r.amount, currency) : <span className="text-ink-4">-</span>}
                      <span className="block text-[11.5px] text-ink-3">{r.amount === 0 ? 'no refund' : r.owedOffset === r.amount ? 'off what you owe' : r.owedOffset === 0 ? 'money back' : 'part off what you owe'}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Block>
          )}

          <Block title="How they've done" hint="tap when something goes wrong" delay={380}>
            {canManage && (
              <div className="mb-4 flex flex-wrap gap-2">
                {ISSUES.map((i) => (
                  <button
                    key={i.kind}
                    type="button"
                    disabled={busy}
                    onClick={() => void run('issue', () => logSupplierIssue({ supplier: item.name, kind: i.kind }), `Noted: ${i.noun}`).then((ok) => ok && reload())}
                    className={cx(ADMIN_GHOST, 'h-9 px-3.5 text-[13.5px]')}
                  >
                    {i.label}
                    {item.issueCounts[i.kind] > 0 && <span className="ml-1 text-ink-3 tnum">{item.issueCounts[i.kind]}</span>}
                  </button>
                ))}
              </div>
            )}
            {item.issues.length === 0 ? (
              <p className="text-[13.5px] text-ink-3">Nothing logged. A supplier with a clean record is worth knowing about.</p>
            ) : (
              <ul>
                {item.issues.map((i, n) => (
                  <li key={i.id} className="animate-rise flex items-baseline justify-between gap-3 border-b border-hairline py-3 text-[14px] first:pt-0 last:border-0 last:pb-0" style={{ animationDelay: `${480 + Math.min(n, 10) * 40}ms` }}>
                    <span className="font-semibold">{ISSUES.find((x) => x.kind === i.kind)?.label ?? 'Other'}</span>
                    <span className="text-ink-3">
                      {day.format(new Date(i.createdAt))}
                      {i.createdByName ? ` · ${i.createdByName}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block title="Contact" delay={440}>
            {item.id === null ? (
              <p className="text-[13.5px] leading-relaxed text-ink-3">This name only appears on deliveries. Save it as a supplier from the Suppliers page to keep a phone number and notes.</p>
            ) : (
              <form
                className="grid gap-3.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (item.id && dirty) void run('save', () => updateSupplier(item.id as string, { phone: phone.trim(), note: note.trim() }), 'Saved').then((ok) => ok && reload());
                }}
              >
                <Field label="Phone">
                  <TextInput value={phone} onChange={setPhone} maxLength={30} type="tel" disabled={!canManage} />
                </Field>
                <Field label="Note">
                  <TextInput value={note} onChange={setNote} maxLength={300} placeholder="Delivers before 8am" disabled={!canManage} />
                </Field>
                {canManage && (
                  <button type="submit" disabled={busy || !dirty} className={cx(ADMIN_PRIMARY, 'justify-self-start')}>
                    Save
                  </button>
                )}
              </form>
            )}
          </Block>
        </div>
      </div>
      {returning && <ReturnSheet supplier={item.name} delivery={returning} currency={currency} onClose={() => setReturning(null)} onSaved={reload} />}
      {buying && <PurchaseSheet supplier={item.name} currency={currency} onClose={() => setBuying(false)} onSaved={reload} />}
      {modal === 'deliveries' && <PagedSheet title="Deliveries" load={loadDeliveries} onClose={() => setModal(null)} render={(rows) => <DeliveryTable rows={rows} currency={currency} onReturn={canManage ? startReturn : undefined} />} />}
      {modal === 'prices' && <PagedSheet title="Prices" load={loadPrices} onClose={() => setModal(null)} render={(rows) => <PriceList rows={rows} currency={currency} />} />}
    </div>
  );
}

function ViewAll({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="shrink-0 rounded-full px-2 py-1 text-[13px] font-semibold text-flame-1 transition-move hover:bg-surface-2 active:scale-95">
      {label}
    </button>
  );
}

/** Shared by the page's preview and the full list in the sheet. */
function DeliveryTable({ rows, currency, onReturn, delay }: { rows: SupplierDelivery[]; currency: string; onReturn?: (d: SupplierDelivery) => void; delay?: number }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-left text-[14px]">
        <thead className="text-[12.5px] text-ink-3">
          <tr>
            <th className="px-1 pb-2.5 font-semibold">Date</th>
            <th className="px-1 pb-2.5 font-semibold">Item</th>
            <th className="px-1 pb-2.5 text-right font-semibold">Quantity</th>
            <th className="px-1 pb-2.5 text-right font-semibold">Paid</th>
            {onReturn && <th className="w-px px-1 pb-2.5" aria-label="Return" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((d, i) => (
            <tr key={d.id} className={delay !== undefined ? 'animate-rise border-t border-hairline' : 'border-t border-hairline'} style={delay !== undefined ? { animationDelay: `${delay + Math.min(i, 10) * 40}ms` } : {}}>
              <td className="px-1 py-3 whitespace-nowrap text-ink-3">{day.format(new Date(d.receivedAt))}</td>
              <td className="max-w-[14rem] truncate px-1 py-3 font-semibold">{d.ingredientName}</td>
              <td className="px-1 py-3 text-right whitespace-nowrap tnum">{formatQty(d.quantity, d.unit)}</td>
              <td className="px-1 py-3 text-right tnum">
                {d.cost ? formatMoney(d.cost, currency) : <span className="text-ink-4">-</span>}
                {d.onCredit && <span className="ml-1.5 rounded-md bg-gold/16 px-1.5 py-0.5 text-[11px] font-bold text-gold-ink">credit</span>}
              </td>
              {onReturn && (
                <td className="px-1 py-3 text-right">
                  {d.remaining > 0 && (
                    <button type="button" onClick={() => onReturn(d)} aria-label={`Return ${d.ingredientName} from ${day.format(new Date(d.receivedAt))}`} className="rounded-full px-2.5 py-1 text-[13px] font-semibold text-flame-1 transition-move hover:bg-surface-2 active:scale-95">
                      Return
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriceList({ rows, currency, delay }: { rows: IngredientPrice[]; currency: string; delay?: number }) {
  return (
    <ol>
      {rows.map((p, i) => {
        const now = priceLabel(p.latestUnitCost, p.unit, currency);
        // Only worth showing what it was when it actually moved (the rounded prices differ).
        const was = p.previousUnitCost !== null ? priceLabel(p.previousUnitCost, p.unit, currency) : null;
        const changed = was !== null && was !== now && p.changePercent !== 0;
        const elsewhere = p.cheaper ? priceLabel(p.cheaper.unitCost, p.unit, currency) : null;
        const cheaper = p.cheaper && elsewhere !== now ? { supplier: p.cheaper.supplier, price: elsewhere as string } : null;
        return (
          <li key={p.ingredientId} className={delay !== undefined ? 'animate-rise flex items-baseline justify-between gap-3 border-b border-hairline py-2.5 text-[14px] first:pt-0 last:border-0 last:pb-0' : 'flex items-baseline justify-between gap-3 border-b border-hairline py-2.5 text-[14px] first:pt-0 last:border-0 last:pb-0'} style={delay !== undefined ? { animationDelay: `${delay + Math.min(i, 10) * 40}ms` } : {}}>
            <span className="min-w-0 truncate font-semibold">{p.ingredientName}</span>
            <span className="flex shrink-0 flex-wrap items-baseline justify-end gap-x-2 tnum">
              {changed && (
                <Tip label="Previous price" tip={p.previousAt ? `${was} · ${day.format(new Date(p.previousAt))}` : was}>
                  <span className="text-[12.5px] text-ink-4 line-through">{was}</span>
                </Tip>
              )}
              <span>{now}</span>
              {changed && p.changePercent !== null && (
                <span className={cx('text-[12px] font-bold', p.changePercent > 0 ? 'text-berry-ink' : 'text-mint-ink')}>
                  {p.changePercent > 0 ? '↑' : '↓'} {Math.abs(p.changePercent)}%
                </span>
              )}
              {cheaper && (
                <Tip label={cheaper.supplier} tip={cheaper.price}>
                  <span className="rounded-md bg-mint/14 px-1.5 py-0.5 text-[11px] font-bold text-mint-ink">cheaper elsewhere</span>
                </Tip>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Cell({ title, alert, children }: { title: string; alert?: boolean; children: ReactNode }) {
  return (
    <div className={cx('px-6 py-6', alert && 'bg-berry/14')}>
      <h2 className="mb-3 text-[13px] font-semibold text-ink-3">{title}</h2>
      {children}
    </div>
  );
}
