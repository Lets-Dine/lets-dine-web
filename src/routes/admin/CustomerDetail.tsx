import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { completeOrderPayment } from '../../api/staff';
import { listPayments } from '../../api/live-admin';
import { fetchCustomer, fetchCustomerLoyalty, fetchCustomerProfile, fetchPendingOrder, updateCustomerProfile } from '../../api/customers';
import { DIETARY_TAGS, getCustomer, profileOf, removeCustomer, settleTab, since, tabBalance, updateCustomer } from '../../data/customers';
import type { Customer, NewCustomer, PendingOrder } from '../../data/customers';
import type { CustomerProfile } from '../../api/customers';
import type { CustomerListItem, Payment } from '../../domain/types';
import { formatMoney } from '../../domain/money';
import { IS_LIVE_API } from '../../api/http';
import { floorBillSubject } from '../../domain/orderStatus';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useNow } from '../../state/useNow';
import { useAsync } from '../../state/useAsync';
import { useToast } from '../../state/ToastContext';
import { ADMIN_GHOST, ADMIN_PRIMARY, Confirm, Empty, Loading, TextArea, TextInput, Toggle, Field, useCommand } from '../../components/admin/kit';
import { SegmentPill, hueOf } from '../../components/admin/CustomerSheet';
import { SaleActions, StatusChip, owedOn } from '../../components/admin/SaleSettle';
import { LoyaltyPanel } from '../../components/admin/Loyalty';
import { useOrderSheet } from '../../components/admin/OrderSheet';
import { PaymentSheet } from '../../components/admin/PaymentSheet';
import { Alert, Check, ChevronLeft, Contact, Copy, Plate, Send, Sliders } from '../../components/icons';
import { Block, FloatingBar, Num, TiltCard, reduced, useAway, useCountUp } from '../../components/admin/profile';
import { CHIP, CHIP_OFF, CHIP_ON, DISPLAY, cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

/** Tags the kitchen must hear about before the order is fired, not just nice-to-know. */
const KITCHEN_FLAGS = ['Nut allergy', 'No onion/garlic'];
const WEEK = 7 * 86_400_000;

/** On the live backend the page shows only what the server holds — never the sample profile. */
const liveProfile = (p: CustomerProfile): Customer => ({ ...p, visitDaysAgo: [], spend: 0, joinedDaysAgo: 0, tab: [], pending: null });

/** Credit sales this customer still owes on, oldest first — a sale left on credit, or part-paid, stays here until it is cleared. */
async function fetchOwed(customerId: string): Promise<Payment[]> {
  const pages = await Promise.all((['UNPAID', 'PARTIALLY_PAID'] as const).map((paymentStatus) => listPayments(0, 50, { customerId, paymentStatus })));
  return pages.flatMap((p) => p.rows).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function CustomerDetail() {
  const { id = '' } = useParams();
  const found = useAsync(() => fetchCustomer(id), [id]);
  const prof = useAsync(() => (IS_LIVE_API ? fetchCustomerProfile(id) : Promise.resolve(null)), [id]);

  if (found.error && !found.loading) return <Empty emoji="⚠️" title="Couldn't load this customer" message={found.error.message} action={<button type="button" className={ADMIN_GHOST} onClick={found.reload}>Try again</button>} />;
  if ((found.loading && found.data?.id !== id) || (IS_LIVE_API && prof.loading && prof.data?.id !== id)) return <Loading label="Opening their file…" />;
  if (!found.data) return <Empty emoji="🔍" title="Customer not found" message="They may have been removed, or the link is out of date." action={<Link to="/admin/customers" className={ADMIN_GHOST}>Back to customers</Link>} />;
  if (IS_LIVE_API && !prof.data) return <Empty emoji="⚠️" title="Couldn't load this customer" message={prof.error?.message ?? ''} action={<button type="button" className={ADMIN_GHOST} onClick={prof.reload}>Try again</button>} />;
  return <Page key={found.data.id} item={found.data} profile={prof.data} reloadProfile={prof.reload} />;
}

function Page({ item: base, profile, reloadProfile }: { item: CustomerListItem; profile: CustomerProfile | null; reloadProfile: () => void }) {
  const { allows } = useAuth();
  const { menu, orders, reloadOrders, applyOrder } = useDashboard();
  const staff = useStaff();
  const push = useToast();
  const navigate = useNavigate();
  const currency = menu.restaurant.currency;
  const canEdit = allows('customers:edit');
  const stored = IS_LIVE_API ? undefined : getCustomer(base.id);
  const detail = profile ? liveProfile(profile) : (stored ?? profileOf(base.id));
  const pendingState = useAsync(() => (IS_LIVE_API ? fetchPendingOrder(base.id) : Promise.resolve(null)), [base.id]);
  const pendingOrder = pendingState.data;
  const dues = useAsync(() => (IS_LIVE_API ? fetchOwed(base.id) : Promise.resolve([] as Payment[])), [base.id]);

  // Manage the order here, on the same page: the sheet and the payment step are the ones the Orders screen uses.
  const now = useNow(15_000);
  const { pending: payBusy, run: payRun } = useCommand();
  const [payingId, setPayingId] = useState<string | null>(null);
  const payingOrder = orders.find((o) => o.id === payingId) ?? null;
  const menuDishes = useMemo(() => menu.dishes.filter((d) => !d.isArchived && d.isAvailable), [menu.dishes]);
  const refreshAfter = () => {
    reloadOrders();
    pendingState.reload();
    dues.reload();
  };
  const orderSheet = useOrderSheet({
    orders,
    now,
    onApply: (o) => {
      applyOrder(o);
      pendingState.reload();
    },
    onResync: refreshAfter,
    onTakePayment: (o) => setPayingId(o.id),
  });
  // Edits live in the profile; the list row (live API) only supplies what the profile hasn't overridden.
  const item: CustomerListItem = { ...base, name: detail.name || base.name, phone: detail.phone || base.phone };
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(detail.notes);
  const [saved, setSaved] = useState(detail.notes);
  const dirty = notes !== saved;
  const [, rerender] = useState(0);
  const owed = IS_LIVE_API ? (dues.data ?? []).reduce((sum, p) => sum + owedOn(p), 0) : tabBalance(detail);

  const hue = hueOf(item.name);
  const first = item.name.split(/\s+/)[0];
  const flags = detail.tags.filter((t) => KITCHEN_FLAGS.includes(t));
  const otherTags = detail.tags.filter((t) => !KITCHEN_FLAGS.includes(t));
  const weeksActive = item.visitWeeks.filter(Boolean).length;
  const gap = [...item.visitWeeks].reverse().findIndex((on) => !on);
  const run = gap === -1 ? item.visitWeeks.length : gap;
  const perVisit = item.visits ? Math.round(item.spend / item.visits) : 0;
  const digits = item.phone.replace(/\D/g, '');

  // Points are live-backend only; offline (or while loading / on error) the card simply carries none.
  const loyalty = useAsync(() => fetchCustomerLoyalty(item.id), [item.id]).data;
  const visits = useCountUp(item.visits);
  const spend = useCountUp(item.spend);

  // The compact bar slides in once the identity block has scrolled away.
  const heroRef = useRef<HTMLElement>(null);
  const away = useAway(heroRef);

  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(item.phone).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  const move = nextMove(item.segment, first, since(item.lastVisitAt));
  const wa = `https://wa.me/${digits.length === 10 ? '977' + digits : digits}?text=${encodeURIComponent(`Hi ${first}, `)}`;

  return (
    <div className="mx-auto max-w-6xl">
      <FloatingBar show={away}>
        <span className="truncate text-[14px] font-semibold">{item.name}</span>
        <SegmentPill segment={item.segment} />
        <a href={`tel:${digits}`} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-flame px-3.5 text-[13px] font-semibold text-white">
          <Contact size={14} /> Call
        </a>
      </FloatingBar>

      <Link to="/admin/customers" className="mb-4 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-ink">
        <ChevronLeft size={15} /> Customers
      </Link>

      {/* Identity: a card you can pick up, and the person beside it in plain, high-contrast type. */}
      <section ref={heroRef} className="grid items-center gap-8 lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-14">
        <MemberCard item={item} hue={hue} points={loyalty?.balance ?? null} />

        <div className="min-w-0">
          <h1 className={cx(DISPLAY, 'animate-rise wrap-break-word text-[clamp(40px,7vw,76px)] leading-[0.98] tracking-[-0.03em]')}>{item.name}</h1>

          <p className="mt-5 max-w-[30ch] animate-rise text-[clamp(20px,2.6vw,28px)] font-medium leading-[1.3] text-ink-2 [animation-delay:80ms] sm:max-w-[36ch]">
            {item.visits === 0 ? (
              <>{first} hasn't paid a bill here yet.</>
            ) : (
              <>
                {first} has dined <Num>{visits}×</Num> and spent <Num>{formatMoney(spend, currency)}</Num>
                {perVisit > 0 && <>, about {formatMoney(perVisit, currency)} a visit</>}. Last here <span className="text-ink">{since(item.lastVisitAt).toLowerCase()}</span>.
              </>
            )}
          </p>

          <div className="mt-6 flex animate-rise flex-wrap gap-2.5 [animation-delay:160ms]">
            <a href={`tel:${digits}`} className={cx(ADMIN_PRIMARY, 'h-11 px-5 text-[14.5px]')}>
              <Contact size={16} /> Call {first}
            </a>
            <a href={wa} target="_blank" rel="noreferrer" className={cx(ADMIN_GHOST, 'h-11 px-5 text-[14.5px]')}>
              <Send size={16} /> WhatsApp
            </a>
            {owed > 0 && (
              <a href="#tab" onClick={(e) => { e.preventDefault(); document.getElementById('tab')?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); }} className="inline-flex h-11 items-center gap-2 rounded-full bg-berry/16 px-5 text-[14.5px] font-semibold text-berry-ink ring-1 ring-berry/40 ring-inset transition-move active:scale-[0.965]">
                Owes <span className="tnum">{formatMoney(owed, currency)}</span>
              </a>
            )}
            {canEdit && (
              <button type="button" className={cx(ADMIN_GHOST, 'h-11 px-4 text-[14.5px]')} onClick={() => { setEditing(true); document.getElementById('details')?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }); }}>
                <Sliders size={16} /> Edit details
              </button>
            )}
            <button type="button" onClick={copy} className={cx(ADMIN_GHOST, 'h-11 px-4 text-[14.5px] tnum')} aria-live="polite">
              {copied ? (
                <>
                  <Check size={16} /> Copied
                </>
              ) : (
                <>
                  <Copy size={16} /> {item.phone}
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {(pendingOrder ?? detail.pending) && <PendingBanner order={(pendingOrder ?? detail.pending)!} currency={currency} onOpen={IS_LIVE_API && orders.some((o) => o.id === pendingOrder?.id) ? () => orderSheet.open(orders.find((o) => o.id === pendingOrder?.id)!) : undefined} />}

      {/* At the table: what a waiter needs in the three seconds before they walk over. */}
      <section aria-label={`At the table with ${first}`} className="mt-12 animate-rise overflow-hidden rounded-[28px] bg-surface-2 ring-1 ring-hairline-strong ring-inset [animation-delay:240ms]">
        <div className="grid divide-y divide-hairline md:grid-cols-3 md:divide-x md:divide-y-0">
          <Cell title="Before you order" alert={flags.length > 0}>
            {flags.length ? (
              <p className="flex items-start gap-2.5 text-[19px] font-semibold leading-snug text-berry-ink">
                <Alert size={22} className="mt-0.5 shrink-0" /> {flags.join(' · ')}
              </p>
            ) : (
              <p className="text-[17px] text-ink-2">No allergies or restrictions noted.</p>
            )}
          </Cell>
          <Cell title="Offer their usual">
            <p className={cx(DISPLAY, 'flex items-start gap-2.5 text-[24px]')}>
              <Plate size={24} className="mt-1 shrink-0 text-flame-2" /> {detail.favourites[0] ?? '—'}
            </p>
            {detail.favourites.length > 1 && <p className="mt-1.5 text-[14px] text-ink-3">then {detail.favourites.slice(1).join(', ')}</p>}
          </Cell>
          <Cell title="Worth knowing">
            <p className="line-clamp-4 text-[16px] leading-relaxed text-ink-2">{detail.notes || 'Nothing noted yet.'}</p>
          </Cell>
        </div>
      </section>

      {!IS_LIVE_API && <p className="mt-10 rounded-xl bg-surface-2/60 px-4 py-3 text-[13px] leading-relaxed text-ink-3 ring-1 ring-hairline ring-inset">
        Favourites, notes, tags and contact details will appear here once customer profiles are connected.
      </p>}

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          {IS_LIVE_API ? (
            <LiveTab sales={dues.data} loading={dues.loading} error={dues.error?.message} currency={currency} onChanged={dues.reload} />
          ) : (
            <TabBlock customer={detail} sample={!stored} currency={currency} canSettle={allows('customers:edit')} onSettled={() => rerender((n) => n + 1)} />
          )}

          <Rhythm weeks={item.visitWeeks} active={weeksActive} run={run} />

          {detail.favourites.length > 0 && (
            <Block title="Their usual" delay={380}>
              <ol>
                {detail.favourites.map((dish, i) => (
                  <li key={dish} className="group flex items-baseline gap-4 border-b border-hairline py-3.5 first:pt-0 last:border-0 last:pb-0">
                    <span className={cx(DISPLAY, 'w-9 text-[34px] text-flame-2/60 transition-[color,translate] duration-300 ease-out-quart group-hover:-translate-y-0.5 group-hover:text-flame-2 tnum')}>{i + 1}</span>
                    <span className={cx(DISPLAY, 'transition-[translate] duration-300 ease-out-quart group-hover:translate-x-1', i === 0 ? 'text-[26px]' : 'text-[20px] font-semibold text-ink-2')}>{dish}</span>
                  </li>
                ))}
              </ol>
            </Block>
          )}

          {IS_LIVE_API && (
            <Block title="Points" delay={440}>
              <LoyaltyPanel customerId={item.id} />
            </Block>
          )}
        </div>

        <div className="grid content-start gap-6">
          <section className="animate-rise rounded-3xl bg-flame-2/12 p-5 ring-1 ring-flame-2/35 ring-inset [animation-delay:320ms] sm:p-6">
            <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
              <span className="size-2 rounded-full bg-flame-2 motion-safe:animate-pulse" /> Next move
            </h2>
            <p className={cx(DISPLAY, 'mt-3 text-[22px] font-semibold leading-snug')}>{move.headline}</p>
            <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{move.body}</p>
          </section>

          <Block title="Notes" delay={400}>
            {canEdit ? (
              <>
                <TextArea aria-label="Notes" value={notes} onChange={setNotes} rows={5} maxLength={500} placeholder="Seat they like, allergies, anything a new waiter should hear." />
                {dirty && (
                  <button
                    type="button"
                    className={cx(ADMIN_PRIMARY, 'mt-2 h-9')}
                    onClick={() => {
                      const done = () => {
                        setSaved(notes);
                        push('Note saved');
                      };
                      if (!profile) {
                        updateCustomer(detail.id, { notes });
                        done();
                        return;
                      }
                      updateCustomerProfile(detail.id, { notes })
                        .then(() => {
                          reloadProfile();
                          done();
                        })
                        .catch((e: Error) => push(e.message));
                    }}
                  >
                    Save note
                  </button>
                )}
              </>
            ) : (
              <p className="text-[14.5px] leading-relaxed text-ink-2">{detail.notes || 'Nothing noted yet.'}</p>
            )}
          </Block>

          <Block title="Details" delay={460} id="details" action={canEdit && !editing && <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[13px] font-semibold text-ink ring-1 ring-hairline ring-inset transition-move hover:bg-surface-3 active:scale-95" onClick={() => setEditing(true)}><Sliders size={14} /> Edit</button>}>
            {editing ? (
              <EditForm
                key="edit"
                detail={{ ...detail, name: item.name, phone: item.phone }}
                lockIdentity={!!profile}
                onCancel={() => setEditing(false)}
                onSave={(patch) => {
                  const done = () => {
                    setEditing(false);
                    push('Details saved');
                  };
                  if (!profile) {
                    updateCustomer(item.id, patch);
                    rerender((n) => n + 1);
                    done();
                    return;
                  }
                  updateCustomerProfile(item.id, { email: patch.email, birthday: patch.birthday, tags: patch.tags, offersOk: patch.offersOk })
                    .then(() => {
                      reloadProfile();
                      done();
                    })
                    .catch((e: Error) => push(e.message));
                }}
              />
            ) : (
              <>
                {otherTags.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {otherTags.map((tag) => (
                      <span key={tag} className="inline-flex h-8 items-center rounded-full bg-flame-2/15 px-3.5 text-[13px] font-semibold text-flame-1 ring-1 ring-flame-2/35 ring-inset">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <dl className="grid gap-2.5 text-[14px]">
                  <Line k="Phone" v={item.phone} />
                  <Line k="Email" v={detail.email || '—'} />
                  <Line k="Birthday" v={detail.birthday ? new Date(detail.birthday + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : '—'} />
                  <Line k="Offers" v={detail.offersOk ? 'Okay to send' : 'Do not send'} />
                </dl>
              </>
            )}
          </Block>

          {canEdit && stored && (
            <div className="flex items-center justify-between px-1">
              <span className="text-[12px] text-ink-4">Added {since(item.joinedAt)}</span>
              <Confirm
                label="Remove customer"
                question="Remove for good?"
                confirmLabel="Remove"
                onConfirm={() => {
                  removeCustomer(item.id);
                  push('Customer removed');
                  navigate('/admin/customers', { replace: true });
                }}
              />
            </div>
          )}
        </div>
      </div>

      {orderSheet.sheet}

      <PaymentSheet
        table={payingOrder ? floorBillSubject(payingOrder) : null}
        orders={payingOrder ? [payingOrder] : []}
        dishes={menuDishes}
        restaurantName={menu.restaurant.name}
        legalName={menu.restaurant.legalName}
        vatPanNumber={menu.restaurant.vatPanNumber}
        serviceChargeRate={menu.restaurant.serviceChargeRate}
        taxRate={menu.restaurant.taxRate}
        pending={payBusy}
        onClose={() => setPayingId(null)}
        onSettle={(changes) => {
          if (!payingOrder) return Promise.resolve(false);
          const order = payingOrder;
          return payRun(
            order.id,
            () => completeOrderPayment(staff, order, changes.items, changes.method, changes.discount, changes.redeemPoints, changes.customerId, changes.credit, changes.paidNow, changes.dueInDays),
            `${order.reference} paid up`,
          ).then((ok) => {
            if (ok) refreshAfter();
            return ok;
          });
        }}
        onEndSession={() => setPayingId(null)}
        onShowQr={() => setPayingId(null)}
      />
    </div>
  );
}

function nextMove(segment: CustomerListItem['segment'], first: string, last: string) {
  switch (segment) {
    case 'lapsed':
      return { headline: `${first} has gone quiet.`, body: `Last seen ${last.toLowerCase()}. A short call or message asking how they are is the cheapest way to bring them back.` };
    case 'new':
      return { headline: `Make ${first}'s second visit count.`, body: 'People who come back within a month usually stay. Greet them by name and suggest what other diners rate highest.' };
    case 'regular':
      return { headline: `${first} is one of your regulars.`, body: 'Greet them by name and know their usual. Being recognised is why they keep coming.' };
    default:
      return { headline: `${first} drops in now and then.`, body: 'A warm hello and a dish they have not tried yet can turn an occasional visit into a habit.' };
  }
}

/** A membership card for the person, with their points big if they have any. */
function MemberCard({ item, hue, points }: { item: CustomerListItem; hue: number; points: number | null }) {
  const shown = useCountUp(points ?? 0, 1400);
  return (
    <TiltCard hue={hue}>
      <span aria-hidden className="absolute -bottom-10 -right-2 select-none font-display text-[200px] font-black leading-none opacity-[0.14]">
        {item.name[0]}
      </span>
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <span className="text-[12px] font-bold uppercase tracking-[0.16em] opacity-70">FeastoX regular</span>
          <SegmentPill segment={item.segment} />
        </div>
        {points !== null && (
          <div>
            <p className={cx(DISPLAY, 'text-[clamp(44px,13vw,56px)] leading-none tracking-[-0.03em] tnum')}>{shown.toLocaleString('en-IN')}</p>
            <p className="mt-1 text-[12px] font-bold uppercase tracking-[0.16em] opacity-70">points collected</p>
          </div>
        )}
        <div>
          <p className={cx(DISPLAY, points !== null ? 'text-[20px]' : 'text-[28px]', 'leading-none')}>{item.name}</p>
          <p className="mt-2 flex items-center justify-between text-[13px] font-semibold tnum opacity-80">
            <span>{item.phone}</span>
            <span>Since {new Date(item.joinedAt).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}</span>
          </p>
        </div>
      </div>
    </TiltCard>
  );
}

/** Ten weeks as tall columns; hovering or focusing one reads out its week below. */
function Rhythm({ weeks, active, run }: { weeks: boolean[]; active: number; run: number }) {
  const [pick, setPick] = useState<number | null>(null);
  const label = (i: number) => {
    const ago = weeks.length - 1 - i;
    const start = new Date(Date.now() - ago * WEEK).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `${ago === 0 ? 'This week' : `Week of ${start}`} — ${weeks[i] ? 'came in' : 'no visit'}`;
  };
  return (
    <Block title="Rhythm" hint={`Came in ${active} of the last ${weeks.length} weeks`} delay={300}>
      <div className="flex items-end gap-1.5 sm:gap-2.5" onPointerLeave={() => setPick(null)}>
        {weeks.map((on, i) => (
          <button
            key={i}
            type="button"
            aria-label={label(i)}
            onPointerEnter={() => setPick(i)}
            onFocus={() => setPick(i)}
            onBlur={() => setPick(null)}
            className="group flex flex-1 flex-col items-center gap-1.5 outline-none"
          >
            <span
              className={cx(
                'block h-24 w-full origin-bottom rounded-xl transition-[translate,background-color,filter] duration-200 ease-out-quart group-hover:-translate-y-1.5 group-focus-visible:-translate-y-1.5 group-focus-visible:ring-2 group-focus-visible:ring-flame-2',
                on ? 'animate-grow-y bg-flame-2 group-hover:brightness-110' : 'bg-ink/8 group-hover:bg-ink/14',
              )}
              style={on ? { animationDelay: `${300 + i * 60}ms` } : undefined}
            />
            <span className={cx('text-[10.5px] transition-colors tnum', pick === i ? 'text-ink' : 'text-ink-4')}>{weeks.length - 1 - i === 0 ? 'now' : `${weeks.length - 1 - i}w`}</span>
          </button>
        ))}
      </div>
      <p className="mt-4 min-h-5 text-[13.5px] text-ink-3">{pick !== null ? label(pick) : run >= 2 ? `${run} weeks in a row — on a streak.` : 'Hover a week to see when they came in.'}</p>
    </Block>
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

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-3">{k}</dt>
      <dd className="truncate text-right font-medium tnum">{v}</dd>
    </div>
  );
}

const STEPS: { status: PendingOrder['status']; label: string }[] = [
  { status: 'PENDING', label: 'Placed' },
  { status: 'ACCEPTED', label: 'Accepted' },
  { status: 'PREPARING', label: 'Preparing' },
  { status: 'READY', label: 'Ready' },
];

/** An order of theirs is in the kitchen right now — the first thing staff should see. */
function PendingBanner({ order, currency, onOpen }: { order: PendingOrder; currency: string; onOpen?: () => void }) {
  const at = Math.max(0, STEPS.findIndex((x) => x.status === order.status));
  return (
    <section aria-label="Order in progress" className="mt-8 animate-rise rounded-[28px] bg-flame-2/12 p-5 ring-1 ring-flame-2/40 ring-inset [animation-delay:200ms] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-flame-1">
            <span className="size-2 rounded-full bg-flame-2 motion-safe:animate-pulse" /> Order in progress · placed {order.minsAgo} min ago
          </p>
          <h2 className={cx(DISPLAY, 'mt-1.5 text-[clamp(24px,3.4vw,32px)]')}>
            {order.table} <span className="text-ink-3">·</span> {STEPS[at].label}
          </h2>
          <p className="mt-1.5 text-[15px] text-ink-2">{order.items.join(' · ')}</p>
        </div>
        <div className="flex items-center gap-4">
          <span className={cx(DISPLAY, 'text-[26px] tnum')}>{formatMoney(order.total, currency)}</span>
          {onOpen ? (
            <button type="button" className={cx(ADMIN_GHOST, 'h-10')} onClick={onOpen}>
              Manage order
            </button>
          ) : (
            <Link to="/admin/orders" className={cx(ADMIN_GHOST, 'h-10')}>
              Open orders
            </Link>
          )}
        </div>
      </div>
      <ol className="mt-5 grid grid-cols-4 gap-2" aria-label={`Status: ${STEPS[at].label}`}>
        {STEPS.map((step, i) => (
          <li key={step.status}>
            <span className={cx('block h-1.5 rounded-full', i <= at ? 'bg-flame-2' : 'bg-ink/12', i === at && 'motion-safe:animate-pulse')} />
            <span className={cx('mt-1.5 block text-[12px] font-semibold', i === at ? 'text-ink' : 'text-ink-4')}>{step.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** What they owe, sale by sale: every bill left on credit that is not yet cleared, each with its own way to take money against it. */
function LiveTab({ sales, loading, error, currency, onChanged }: { sales: Payment[] | null; loading: boolean; error?: string; currency: string; onChanged: () => void }) {
  const balance = (sales ?? []).reduce((sum, p) => sum + owedOn(p), 0);
  const shown = useCountUp(balance, 900);
  return (
    <Block title="On account" delay={280} id="tab">
      {error && !sales ? (
        <p className="text-[14px] text-berry-ink" role="alert">Couldn't load their account: {error}</p>
      ) : !sales && loading ? (
        <p className="text-[14px] text-ink-3">Loading their account…</p>
      ) : (
        <>
          <p className={cx(DISPLAY, 'text-[clamp(36px,5vw,52px)] leading-none tnum', balance > 0 ? 'text-berry-ink' : 'text-mint-ink')}>{balance > 0 ? formatMoney(shown, currency) : 'Settled up'}</p>
          <p className="mt-2 text-[13.5px] text-ink-3">{balance > 0 ? `Across ${sales?.length} unpaid bill${sales?.length === 1 ? '' : 's'}` : 'Nothing owed right now.'}</p>
          {sales && sales.length > 0 && (
            <ul className="mt-5 border-t border-hairline">
              {sales.map((p) => (
                <li key={p.id} className="border-b border-hairline py-3.5 last:border-0">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="min-w-0">
                      <span className="block truncate text-[14.5px] font-medium">{p.items.map((i) => `${i.dishNameSnapshot} ×${i.quantity}`).join(', ') || 'Bill'}</span>
                      <span className="text-[12.5px] text-ink-3">{new Date(p.createdAt).toLocaleDateString()} · bill {formatMoney(p.total, currency)} · paid {formatMoney(p.paidAmount, currency)}{p.dueDate ? ` · due ${new Date(p.dueDate).toLocaleDateString()}` : ''}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2.5">
                      <StatusChip status={p.paymentStatus} />
                      <span className="text-[15px] font-semibold text-berry-ink tnum">{formatMoney(owedOn(p), currency)}</span>
                    </span>
                  </div>
                  <details className="group mt-2">
                    <summary className="cursor-pointer text-[13px] font-semibold text-flame-1 marker:content-none">Record payment</summary>
                    <div className="mt-3 rounded-2xl bg-surface-2 p-4 ring-1 ring-hairline ring-inset">
                      <SaleActions payment={p} onChanged={onChanged} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Block>
  );
}

const dayLabel = (n: number) => (n === 0 ? 'Today' : n === 1 ? 'Yesterday' : `${n} days ago`);

/** What they owe, how it got there, and a way to take a payment against it — inline, no dialog. */
function TabBlock({ customer, sample, currency, canSettle, onSettled }: { customer: Customer; sample: boolean; currency: string; canSettle: boolean; onSettled: () => void }) {
  const push = useToast();
  const balance = tabBalance(customer);
  const shown = useCountUp(balance, 900);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'Cash' | 'Card'>('Cash');
  const [note, setNote] = useState('');
  const [all, setAll] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const balanceRef = useRef<HTMLParagraphElement>(null);

  const minor = Math.round(Number(amount) * 100);
  const valid = amount !== '' && Number.isFinite(minor) && minor > 0 && minor <= balance;
  const over = amount !== '' && minor > balance;
  const entries = [...customer.tab].reverse();
  const rows = all ? entries : entries.slice(0, 5);
  const toggle = () => {
    setOpen((o) => !o);
    setAmount(String(balance / 100));
    setNote('');
    setMethod('Cash');
  };

  const submit = () => {
    if (!valid || !settleTab(customer.id, minor, method, note)) return;
    setFresh(tabBalance(profileOf(customer.id)) === 0 ? 'done' : 'part');
    push(`Recorded ${formatMoney(minor, currency)} from ${customer.name.split(/\s+/)[0]}`);
    setOpen(false);
    setNote('');
    onSettled();
    balanceRef.current?.focus();
  };

  return (
    <Block title="On account" hint={sample ? 'Sample data' : undefined} delay={280} id="tab">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p ref={balanceRef} tabIndex={-1} className={cx(DISPLAY, 'text-[clamp(36px,5vw,52px)] leading-none outline-none tnum', balance > 0 ? 'text-berry-ink' : 'text-mint-ink')}>
            {balance > 0 ? formatMoney(shown, currency) : 'Settled up'}
          </p>
          <p className="mt-2 text-[13.5px] text-ink-3">{balance > 0 ? 'Unpaid bills on their tab' : customer.tab.length ? 'Nothing owed right now.' : 'No credit given yet.'}</p>
        </div>
        {canSettle && balance > 0 && (
          <button type="button" className={cx(open ? ADMIN_GHOST : ADMIN_PRIMARY, 'h-11 px-5')} aria-expanded={open} aria-controls="settle-panel" onClick={toggle}>
            {open ? 'Cancel' : 'Settle up'}
          </button>
        )}
      </div>

      <div id="settle-panel" className={cx('grid transition-[grid-template-rows] duration-300 ease-out-quart', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')} inert={!open}>
        <div className="overflow-hidden">
          <form
            className="mt-5 grid gap-4 rounded-2xl bg-surface-2 p-4 ring-1 ring-hairline ring-inset"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-ink-3">Amount received ({currency})</span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setAmount(e.target.value)}
                aria-invalid={over}
                aria-describedby="settle-hint"
                className="w-full rounded-xl bg-surface px-3.5 py-3 text-[24px] font-semibold tracking-tight text-ink outline-none ring-1 ring-hairline ring-inset tnum focus:ring-[1.5px] focus:ring-flame-2/50 aria-[invalid=true]:ring-berry/60"
              />
            </label>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
              <button type="button" className={cx(CHIP, CHIP_OFF)} onClick={() => setAmount(String(balance / 100))}>
                Everything
              </button>
              {balance >= 200 && (
                <button type="button" className={cx(CHIP, CHIP_OFF)} onClick={() => setAmount(String(Math.floor(balance / 2) / 100))}>
                  Half
                </button>
              )}
              <span className="mx-1 w-px self-stretch bg-hairline" />
              {(['Cash', 'Card'] as const).map((m) => (
                <button key={m} type="button" aria-pressed={method === m} className={cx(CHIP, method === m ? CHIP_ON : CHIP_OFF)} onClick={() => setMethod(m)}>
                  {m}
                </button>
              ))}
            </div>
            <TextInput value={note} onChange={setNote} maxLength={80} placeholder="Note (optional)" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p id="settle-hint" className={cx('text-[13.5px]', over ? 'text-berry-ink' : 'text-ink-3')} role={over ? 'alert' : undefined}>
                {over ? `That's more than the ${formatMoney(balance, currency)} owed.` : valid ? (minor === balance ? 'Clears their tab.' : `Leaves ${formatMoney(balance - minor, currency)} on account.`) : 'Enter what they handed over.'}
              </p>
              <button type="submit" className={cx(ADMIN_PRIMARY, 'h-11 px-6')} disabled={!valid}>
                Record payment
              </button>
            </div>
          </form>
        </div>
      </div>

      {customer.tab.length > 0 && (
        <ul className="mt-5 border-t border-hairline pt-1">
          {rows.map((e, i) => (
            <li key={e.id} className={cx('flex items-baseline justify-between gap-4 border-b border-hairline py-3 last:border-0', i === 0 && fresh && e.kind === 'PAYMENT' && e.daysAgo === 0 && 'animate-flash')}>
              <span className="min-w-0">
                <span className="block truncate text-[14.5px] font-medium">{e.note}</span>
                <span className="text-[12.5px] text-ink-3">{dayLabel(e.daysAgo)}</span>
              </span>
              <span className={cx('shrink-0 text-[15px] font-semibold tnum', e.kind === 'PAYMENT' ? 'text-mint-ink' : 'text-ink-2')}>
                {e.kind === 'PAYMENT' ? '−' : '+'}
                {formatMoney(e.amount, currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {entries.length > 5 && (
        <button type="button" className="mt-2 text-[13px] font-semibold text-ink-3 hover:text-ink" onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${entries.length}`}
        </button>
      )}
    </Block>
  );
}

const dateInput = 'w-full rounded-xl bg-surface-2 px-3.5 py-2.5 text-[14.5px] text-ink outline-none ring-1 ring-hairline ring-inset focus:ring-[1.5px] focus:ring-flame-2/40 [color-scheme:dark] tnum';

/** Edits everything about the person that isn't visit history. Inline, so the page stays in view while you change it. */
function EditForm({ detail, lockIdentity, onSave, onCancel }: { detail: Customer; lockIdentity: boolean; onSave: (patch: Partial<NewCustomer>) => void; onCancel: () => void }) {
  const [name, setName] = useState(detail.name);
  const [phone, setPhone] = useState(detail.phone);
  const [email, setEmail] = useState(detail.email);
  const [birthday, setBirthday] = useState(detail.birthday);
  const [tags, setTags] = useState(detail.tags);
  const [offersOk, setOffersOk] = useState(detail.offersOk);
  const ok = name.trim().length >= 2 && phone.replace(/\D/g, '').length >= 9;
  const toggle = (tag: string) => setTags((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]));

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSave({ name: name.trim(), phone: phone.trim(), email: email.trim(), birthday, tags, offersOk });
      }}
    >
      {!lockIdentity && (
        <>
          <Field label="Name">
            <TextInput value={name} onChange={setName} maxLength={120} autoFocus />
          </Field>
          <Field label="Phone">
            <TextInput value={phone} onChange={(v) => setPhone(v.replace(/[^\d\s+]/g, ''))} maxLength={16} className="tnum" />
          </Field>
        </>
      )}
      <Field label="Email">
        <TextInput value={email} onChange={setEmail} type="email" maxLength={180} placeholder="Optional" />
      </Field>
      <Field label="Birthday">
        <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className={dateInput} />
      </Field>
      <fieldset>
        <legend className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-4">Good to know</legend>
        <div className="flex flex-wrap gap-2">
          {DIETARY_TAGS.map((tag) => (
            <button key={tag} type="button" aria-pressed={tags.includes(tag)} onClick={() => toggle(tag)} className={cx(CHIP, tags.includes(tag) ? CHIP_ON : CHIP_OFF)}>
              {tag}
            </button>
          ))}
        </div>
      </fieldset>
      <Toggle checked={offersOk} onChange={setOffersOk} label="Okay to send offers" hint="They agreed to hear about new dishes and events." />
      <div className="flex gap-2">
        <button type="submit" className={cx(ADMIN_PRIMARY, 'flex-1')} disabled={!ok}>
          Save changes
        </button>
        <button type="button" className={ADMIN_GHOST} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
