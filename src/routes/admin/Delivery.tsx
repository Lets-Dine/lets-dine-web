import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { branchKeyOf, fetchDeliveryOverview, savePartner, saveRider } from '../../api/delivery';
import type { PartnerDraft, RiderDraft } from '../../api/delivery';
import { formatMoney } from '../../domain/money';
import { RIDER_KIND_LABEL, partnerTerms, riderStatus } from '../../domain/delivery';
import type { Balance, DeliveryOverview, DeliveryPartner, PartnerListing, RiderListing } from '../../domain/delivery';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { ADMIN_GHOST, ADMIN_PRIMARY, Empty, PANEL, Panel, Segmented, useCommand } from '../../components/admin/kit';
import { FOOT_PRIMARY, SHEET_FOOT, Sheet } from '../../components/admin/Sheet';
import {
  BalanceFigure,
  Chip,
  LedgerLine,
  Monogram,
  Outcome,
  PartnerFields,
  RiderFields,
  SheetHeader,
  emptyPartnerDraft,
  emptyRiderDraft,
} from '../../components/admin/delivery';
import { Bike, ChevronRight, Handshake, Plus, Search } from '../../components/icons';
import { PageTitle } from '../../components/admin/kit';
import { cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

type RiderFilter = 'all' | 'road' | 'cash';

/**
 * Everyone who carries food out of this branch, on one page: partners as cards, riders as a list.
 * Each is an account — it holds the branch's cash, or is owed fees, or is square — and the line
 * at the foot of every card and row is that balance, drawn to one scale so they compare.
 */
export function Delivery() {
  const staff = useStaff();
  const { allows } = useAuth();
  const { menu, orders } = useDashboard();
  const currency = menu.restaurant.currency;
  const branchId = branchKeyOf(staff);
  const canManage = allows('ledger:manage');
  const book = useAsync(() => fetchDeliveryOverview(branchId), [branchId]);
  // Open-order counts come from the book, so re-read it when the layout's live queue moves.
  const reloadBook = book.reload;
  const seenOrders = useRef(orders);
  useEffect(() => {
    if (seenOrders.current === orders) return;
    seenOrders.current = orders;
    reloadBook();
  }, [orders, reloadBook]);

  const [filter, setFilter] = useState<RiderFilter>('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState<'rider' | 'partner' | null>(null);

  const view = useMemo(() => (book.data ? arrange(book.data) : null), [book.data]);

  if (book.loading && !book.data)
    return (
      <>
        <PageTitle title="Delivery" />
        <div role="status" aria-label="Loading delivery" className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="shimmer-bg animate-shimmer h-[196px] rounded-2xl" style={{ opacity: 1 - i * 0.18 }} />
            ))}
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="shimmer-bg animate-shimmer h-14 rounded-xl" style={{ opacity: 1 - i * 0.16 }} />
          ))}
        </div>
      </>
    );

  if (book.error && !book.data)
    return (
      <>
        <PageTitle title="Delivery" />
        <p role="alert" className="rounded-2xl bg-berry/10 px-4 py-3 text-[14px] text-berry-ink ring-1 ring-berry/25 ring-inset">
          {book.error.message}{' '}
          <button type="button" className="font-semibold underline underline-offset-2" onClick={book.reload}>
            Try again
          </button>
        </p>
      </>
    );

  const v = view!;
  const first = v.partners.length === 0 && v.riders.length === 0;
  const q = query.trim().toLowerCase();
  const riders = v.riders.filter((rider) => {
    if (q && !`${rider.name} ${rider.phone}`.toLowerCase().includes(q)) return false;
    if (filter === 'road') return rider.open > 0;
    if (filter === 'cash') return rider.balance !== null && rider.balance.cashHeld > 0;
    return true;
  });

  return (
    <>
      <div className="animate-rise">
      <PageTitle
        title="Delivery"
        purpose="Who carries the food, and who owes whom."
        subtitle="Hand an order to a rider or a partner from its ticket. Their fees and the cash they bring back build up here until you settle."
        action={
          canManage && !first ? (
            <>
              <button type="button" className={ADMIN_GHOST} onClick={() => setAdding('partner')}>
                <Handshake size={16} /> Add partner
              </button>
              <button type="button" className={ADMIN_PRIMARY} onClick={() => setAdding('rider')}>
                <Plus size={16} /> Add rider
              </button>
            </>
          ) : undefined
        }
      />
      </div>

      {first ? (
        <FirstRun onRider={canManage ? () => setAdding('rider') : undefined} onPartner={canManage ? () => setAdding('partner') : undefined} />
      ) : (
        <>
          <div className="animate-rise [animation-delay:80ms]">
            <Sentence summary={v.summary} currency={currency} />
          </div>

          <section aria-labelledby="partners-h" className="mt-6 animate-rise [animation-delay:160ms]">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id="partners-h" className="text-[15px] font-semibold tracking-tight">
                Partners
              </h2>
              <span className="text-[12.5px] text-ink-4">{v.partners.length === 0 ? 'None yet' : `${v.partners.length} on the books`}</span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-3">
              {v.partners.map((partner, index) => (
                <PartnerCard key={partner.id} partner={partner} max={v.max} currency={currency} index={index} />
              ))}
              {canManage && (
                <button
                  type="button"
                  onClick={() => setAdding('partner')}
                  className="group grid min-h-[132px] place-content-center justify-items-center gap-2 rounded-2xl border border-dashed border-hairline-strong p-4 text-ink-3 transition-move hover:border-flame-2/50 hover:text-ink"
                >
                  <span className="grid size-9 place-items-center rounded-full bg-surface-2 ring-1 ring-hairline ring-inset transition-move group-hover:bg-flame group-hover:text-white">
                    <Plus size={16} />
                  </span>
                  <span className="text-[13.5px] font-semibold">{v.partners.length === 0 ? 'Add a delivery partner' : 'Add another partner'}</span>
                </button>
              )}
            </div>
          </section>

          <section aria-labelledby="riders-h" className="mt-8 animate-rise [animation-delay:280ms]">
            <Panel
              bare
              title="Riders"
              hint={v.riders.length === 0 ? undefined : `${v.riders.length} ${v.riders.length === 1 ? 'rider' : 'riders'}`}
              action={
                v.riders.length > 0 ? (
                  <Segmented
                    label="Filter riders"
                    value={filter}
                    onChange={setFilter}
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'road', label: 'On the road' },
                      { value: 'cash', label: 'Holding cash' },
                    ]}
                  />
                ) : undefined
              }
            >
              {v.riders.length === 0 ? (
                <Empty
                  title="No riders yet"
                  message="Add the staff or freelancers who deliver for this branch."
                  action={
                    canManage ? (
                      <button type="button" className={ADMIN_PRIMARY} onClick={() => setAdding('rider')}>
                        <Plus size={16} /> Add rider
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <div className="relative border-b border-hairline px-4 py-2.5 sm:px-5">
                    <Search size={15} className="pointer-events-none absolute left-7 top-1/2 -translate-y-1/2 text-ink-4 sm:left-8" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by name or phone"
                      aria-label="Search riders"
                      className="h-9 w-full rounded-lg bg-transparent pl-8 text-[14px] text-ink outline-none placeholder:text-ink-4"
                    />
                  </div>
                  {riders.length === 0 ? (
                    <p className="px-5 py-10 text-center text-[13.5px] text-ink-3">
                      {q ? `Nobody matches “${query.trim()}”.` : filter === 'road' ? 'Nobody is out on a delivery right now.' : 'No rider is holding cash. Everyone has handed theirs over.'}
                    </p>
                  ) : (
                    <>
                      <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_120px_minmax(0,1.1fr)_16px] items-center gap-4 border-b border-hairline px-5 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-4 md:grid">
                        <span>Rider</span>
                        <span>Rides for</span>
                        <span>Now</span>
                        <span className="text-right">Balance</span>
                        <span />
                      </div>
                      <ul>
                        {riders.map((rider, n) => (
                          <RiderRow key={rider.id} rider={rider} max={v.max} currency={currency} delay={340 + Math.min(n, 10) * 45} />
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </Panel>
          </section>
        </>
      )}

      {adding === 'rider' && <AddRiderSheet branchId={branchId} currency={currency} partners={v.partners.filter((p) => p.isActive)} onClose={() => setAdding(null)} />}
      {adding === 'partner' && <AddPartnerSheet branchId={branchId} currency={currency} onClose={() => setAdding(null)} />}
    </>
  );
}

/* ── Ordering what the page shows ─────────────────────────────────── */

/** The server sums the balances; the page only orders them and finds the longest bar. */
function arrange(overview: DeliveryOverview) {
  const partners = [...overview.partners].sort(
    (a, b) => Number(b.isActive) - Number(a.isActive) || Math.abs(b.balance.net) - Math.abs(a.balance.net) || a.name.localeCompare(b.name),
  );
  const riders = [...overview.riders].sort(
    (a, b) => Number(b.isActive) - Number(a.isActive) || b.open - a.open || Math.abs(b.balance?.net ?? 0) - Math.abs(a.balance?.net ?? 0) || a.name.localeCompare(b.name),
  );
  const balances: Balance[] = [...partners.map((p) => p.balance), ...riders.flatMap((r) => (r.balance ? [r.balance] : []))];
  return { partners, riders, max: balances.reduce((m, b) => Math.max(m, Math.abs(b.net)), 0), summary: overview.summary };
}

/** One sentence in place of a row of summary tiles. */
function Sentence({ summary, currency }: { summary: { onRoad: number; cashOut: number; owed: number }; currency: string }) {
  const quiet = summary.onRoad === 0 && summary.cashOut === 0 && summary.owed === 0;
  const strong = 'font-semibold text-ink tnum';
  return (
    <p className="text-[14px] leading-relaxed text-ink-3" aria-live="polite">
      {quiet ? (
        'Nobody is out, and every account is settled.'
      ) : (
        <>
          <span className={strong}>{summary.onRoad}</span> on the road
          <span className="mx-2 text-ink-4">·</span>
          <span className={strong}>{formatMoney(summary.cashOut, currency)}</span> of your cash is with couriers
          <span className="mx-2 text-ink-4">·</span>
          <span className={strong}>{formatMoney(summary.owed, currency)}</span> in fees owed to them
        </>
      )}
    </p>
  );
}

/* ── Partner card ──────────────────────────────────────────────────── */

function PartnerCard({ partner, max, currency, index }: { partner: PartnerListing; max: number; currency: string; index: number }) {
  const { balance, riders, runs30 } = partner;
  const money = (m: number) => formatMoney(m, currency);
  return (
    <Link
      to={`/admin/delivery/partners/${partner.id}`}
      style={{ animationDelay: `${220 + Math.min(index, 10) * 45}ms` }}
      className={cx(
        'group animate-rise flex flex-col p-4 transition-move', PANEL,
        'hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame-2',
        !partner.isActive && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-3">
        <Monogram name={partner.name} size="md" shape="tile" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15.5px] font-semibold tracking-tight">{partner.name}</h3>
          <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{partnerTerms(partner, money)}</p>
        </div>
        {!partner.isActive ? <Chip tone="warn">Paused</Chip> : balance.open > 0 ? <Chip tone="mint">{balance.open} out</Chip> : null}
      </div>

      <div className="mt-5 flex items-end justify-between gap-4">
        <BalanceFigure balance={balance} currency={currency} size="lg" />
        <dl className="grid gap-0.5 text-right text-[12px] text-ink-3">
          <div className="flex justify-end gap-2">
            <dt>Cash held</dt>
            <dd className="w-[78px] font-medium text-ink-2 tnum">{money(Math.max(balance.cashHeld, 0))}</dd>
          </div>
          <div className="flex justify-end gap-2">
            <dt>Fees owed</dt>
            <dd className="w-[78px] font-medium text-ink-2 tnum">{money(Math.max(balance.feesOwed, 0))}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-3.5">
        <LedgerLine net={balance.net} max={max} delay={220 + Math.min(index, 10) * 45 + 250} />
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-hairline pt-3 text-[12px] text-ink-3">
        <span className="min-w-0 flex-1 truncate">
          {riders > 0 ? `${riders} ${riders === 1 ? 'rider' : 'riders'} · ` : ''}
          {runs30} {runs30 === 1 ? 'delivery' : 'deliveries'} in 30 days
          {partner.collectsCash ? '' : ' · no cash'}
        </span>
        <ChevronRight size={14} className="shrink-0 text-ink-4 transition-move group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

/* ── Rider row ─────────────────────────────────────────────────────── */

const STATUS_COPY = { 'on-road': 'On the road', available: 'Available', off: 'Off duty' } as const;
const STATUS_DOT = { 'on-road': 'bg-mint', available: 'bg-ink-4', off: 'bg-ink-4/40' } as const;

function RiderRow({ rider, max, currency, delay }: { rider: RiderListing; max: number; currency: string; delay: number }) {
  const { balance, open, partnerName, runs30 } = rider;
  const status = riderStatus(rider, open);
  return (
    <li style={{ animationDelay: `${delay}ms` }} className="animate-rise border-b border-hairline last:border-0">
      <Link
        to={`/admin/delivery/riders/${rider.id}`}
        className={cx(
          'group grid items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-surface-2/40 sm:px-5',
          'grid-cols-[auto_minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_120px_minmax(0,1.1fr)_16px]',
          !rider.isActive && 'opacity-60',
        )}
      >
        <span className="flex min-w-0 items-center gap-3 max-md:contents">
          <Monogram name={rider.name} size="sm" />
          <span className="min-w-0 max-md:col-start-2">
            <span className="block truncate text-[14.5px] font-semibold">{rider.name}</span>
            <span className="block truncate text-[12.5px] text-ink-4 tnum">{[rider.phone, rider.vehicle].filter(Boolean).join(' · ') || 'No phone yet'}</span>
          </span>
        </span>

        <span className="hidden min-w-0 md:block">
          <span className="block truncate text-[13.5px] text-ink-2">{partnerName ?? RIDER_KIND_LABEL[rider.kind]}</span>
          <span className="block truncate text-[12px] text-ink-4">
            {runs30} {runs30 === 1 ? 'delivery' : 'deliveries'} in 30 days
          </span>
        </span>

        <span className="flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2 max-md:order-last max-md:col-span-2 max-md:col-start-2">
          <span aria-hidden className={cx('size-2 rounded-full', STATUS_DOT[status], status === 'on-road' && 'motion-safe:animate-breathe-slow')} />
          <span className="whitespace-nowrap">{STATUS_COPY[status]}</span>
          {open > 1 && <span className="text-ink-4 tnum">· {open} orders</span>}
          {!balance && partnerName && <span className="min-w-0 truncate text-ink-4 md:hidden">· settles via {partnerName}</span>}
        </span>

        <span className="min-w-0 max-md:col-start-3 max-md:row-start-1">
          {balance ? (
            <span className="grid gap-2 md:justify-items-end">
              <BalanceFigure balance={balance} currency={currency} align="right" />
              <span className="hidden w-full max-w-[200px] md:block">
                <LedgerLine net={balance.net} max={max} compact delay={delay + 200} />
              </span>
            </span>
          ) : (
            <span className="block text-right text-[12.5px] leading-snug text-ink-4 max-md:hidden">Settles through {partnerName}</span>
          )}
        </span>

        {balance && (
          <span className="col-span-3 md:hidden">
            <LedgerLine net={balance.net} max={max} compact delay={delay + 200} />
          </span>
        )}

        <ChevronRight size={14} className="hidden text-ink-4 transition-move group-hover:translate-x-0.5 md:block" />
      </Link>
    </li>
  );
}

/* ── First run ─────────────────────────────────────────────────────── */

function FirstRun({ onRider, onPartner }: { onRider?: () => void; onPartner?: () => void }) {
  return (
    <div className="mt-2 grid gap-6 rounded-2xl bg-surface p-6 ring-1 ring-hairline ring-inset sm:p-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
      <div>
        <h2 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-balance">Know who has your food, and who has your money.</h2>
        <p className="mt-3 max-w-[48ch] text-[14px] leading-relaxed text-ink-3">
          Add the riders who deliver for this branch, and any delivery partners you work with. Each one becomes an account: the fee they have earned, and the cash they collect at the door, tracked until you settle.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {onRider && (
            <button type="button" className={ADMIN_PRIMARY} onClick={onRider}>
              <Bike size={16} /> Add a rider
            </button>
          )}
          {onPartner && (
            <button type="button" className={ADMIN_GHOST} onClick={onPartner}>
              <Handshake size={16} /> Add a partner
            </button>
          )}
          {!onRider && <p className="text-[13px] text-ink-3">Ask a manager to add the first rider.</p>}
        </div>
      </div>
      <ol className="grid gap-4 text-[13.5px] leading-snug text-ink-2">
        {[
          ['Send an order out', 'Choose who takes it from the delivery ticket. Their fee fills in from their terms.'],
          ['Mark it delivered', 'Record the cash that came back. Short cash is kept, not hidden.'],
          ['Settle up', 'Open them here, see the statement, and zero the balance in one step.'],
        ].map(([title, body]) => (
          <li key={title} className="border-t border-hairline pt-3">
            <span className="block font-semibold text-ink">{title}</span>
            <span className="mt-0.5 block text-ink-3">{body}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ── Add sheets ────────────────────────────────────────────────────── */

function AddRiderSheet({ branchId, currency, partners, onClose }: { branchId: string; currency: string; partners: DeliveryPartner[]; onClose: () => void }) {
  const navigate = useNavigate();
  const { pending, busy, run } = useCommand();
  const [draft, setDraft] = useState<RiderDraft>(emptyRiderDraft);
  const name = draft.name.trim();
  return (
    <Sheet label="Add a rider" onClose={onClose}>
      {(close) => (
        <>
          <SheetHeader title="New rider" intro="Someone who carries orders out for this branch: your own staff, a freelancer, or a partner's rider." onClose={() => close()} />
          <form
            className="grid flex-1 grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-y-auto px-5 pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.length < 2) return;
              void run('add', async () => {
                const created = await saveRider(branchId, draft);
                close();
                navigate(`/admin/delivery/riders/${created.id}`);
              }, `${name} added`);
            }}
          >
            <RiderFields draft={draft} onChange={setDraft} currency={currency} partners={partners} />
            <Outcome>
              {name || 'This rider'} {draft.partnerId ? 'will ride under a partner, whose account takes their cash and fees.' : draft.payModel === 'PER_DELIVERY' ? 'earns a fee on every delivery and hands over the cash they collect.' : 'is salaried, so they only ever hand over cash.'}
            </Outcome>
            <div className={SHEET_FOOT}>
              <button type="submit" disabled={busy || name.length < 2} className={FOOT_PRIMARY}>
                {pending === 'add' ? 'Adding…' : 'Add rider'}
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

function AddPartnerSheet({ branchId, currency, onClose }: { branchId: string; currency: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { pending, busy, run } = useCommand();
  const [draft, setDraft] = useState<PartnerDraft>(emptyPartnerDraft);
  const name = draft.name.trim();
  return (
    <Sheet label="Add a partner" onClose={onClose}>
      {(close) => (
        <>
          <SheetHeader title="New partner" intro="A delivery company you hand orders to. They may bring their own riders and settle with you in bulk." onClose={() => close()} />
          <form
            className="grid flex-1 grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-y-auto px-5 pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.length < 2) return;
              void run('add', async () => {
                const created = await savePartner(branchId, draft);
                close();
                navigate(`/admin/delivery/partners/${created.id}`);
              }, `${name} added`);
            }}
          >
            <PartnerFields draft={draft} onChange={setDraft} currency={currency} />
            <div className={SHEET_FOOT}>
              <button type="submit" disabled={busy || name.length < 2} className={FOOT_PRIMARY}>
                {pending === 'add' ? 'Adding…' : 'Add partner'}
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
