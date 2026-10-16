import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../../api/store';
import { branchKeyOf, fetchCourierDetail, fetchCourierStatement, savePartner, saveRider, setCourierActive } from '../../api/delivery';
import type { PartnerDraft, RiderDraft } from '../../api/delivery';
import { formatMoney } from '../../domain/money';
import { partnerTerms, riderTerms, feesToPay } from '../../domain/delivery';
import type { Account, DeliveryAssignment, DeliveryPartner, Rider, RiderListing, StatementLine, StatementPage } from '../../domain/delivery';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useToast } from '../../state/ToastContext';
import { useDiscardBack } from '../../components/admin/useDiscardBack';
import { useAsync } from '../../state/useAsync';
import { ADMIN_GHOST, ADMIN_PRIMARY, Empty, Loading, PANEL, Panel, dayLabel, groupByDay, useCommand } from '../../components/admin/kit';
import { clockTime } from '../../components/time';
import {
  Chip,
  Monogram,
  PartnerFields,
  RiderFields,
  SettleSheet,
  partnerDraftOf,
  riderDraftOf,
} from '../../components/admin/delivery';
import { Bike, Cash, ChevronLeft, ChevronRight, Contact, Handshake, Receipt, Sliders, X } from '../../components/icons';
import { hueOf } from '../../components/admin/CustomerSheet';
import { Block, FloatingBar, Num, TiltCard, useAway, useCountUp } from '../../components/admin/profile';
import { DISPLAY, cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

/**
 * One courier — a partner or a rider — as an account: what they hold of the branch's cash, what the
 * branch owes them, the terms they work on, and a statement that adds up to the balance line by line.
 *
 * The header (terms, balance, who is out) and the statement are two requests: the statement is read a
 * page at a time, so a courier with years of runs costs no more to open than one with a week.
 */
export function CourierDetail({ kind }: { kind: 'partner' | 'rider' }) {
  const { id = '' } = useParams();
  // Partner and rider routes share this element: remount per courier so tab, edit and settle state never leak across.
  return <CourierPage key={`${kind}:${id}`} kind={kind} id={id} />;
}

function CourierPage({ kind, id }: { kind: 'partner' | 'rider'; id: string }) {
  const staff = useStaff();
  const { allows } = useAuth();
  const { menu } = useDashboard();
  const currency = menu.restaurant.currency;
  const branchId = branchKeyOf(staff);
  const canManage = allows('ledger:manage');
  const accountOf = kind === 'partner' ? 'PARTNER' : 'RIDER';
  const detail = useAsync(() => fetchCourierDetail(branchId, accountOf, id), [branchId, accountOf, id]);
  const statement = useStatement(branchId, accountOf, id);
  const [settling, setSettling] = useState(false);
  const duty = useCommand();
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('statement');

  const reload = () => {
    detail.reload();
    statement.reload();
  };

  const data = detail.data;
  const partner = data?.partner ?? null;
  const rider = data?.rider ?? null;
  const subject = partner ?? rider;
  const parent = data?.parent ?? null;
  /** A partner's rider has no account of their own; the partner's takes their cash and fees. */
  const account: Account | null = partner ? { kind: 'PARTNER', id: partner.id } : rider && !rider.partnerId ? { kind: 'RIDER', id: rider.id } : null;
  const balance = partner?.balance ?? rider?.balance ?? null;

  const toggleDuty = () =>
    void duty
      .run('active', () => setCourierActive(partner ? { kind: 'PARTNER', id: partner.id } : { kind: 'RIDER', id: rider!.id }, !subject!.isActive), subject!.isActive ? `${subject!.name} paused` : `${subject!.name} is back on`)
      .then((ok) => ok && reload());

  const back = (
    <Link to="/admin/delivery" className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-ink">
      <ChevronLeft size={15} /> Delivery
    </Link>
  );

  const hue = hueOf(subject?.name ?? '');
  const heroRef = useRef<HTMLElement>(null);
  const away = useAway(heroRef);
  const netShown = useCountUp(balance && account ? Math.abs(balance.net) : 0, 1300);
  const heldShown = useCountUp(balance && account ? Math.max(balance.cashHeld, 0) : 0);
  const feesShown = useCountUp(balance && account ? Math.max(balance.feesOwed, 0) : 0);

  if (!data || !subject)
    return (
      <>
        {back}
        {detail.error && !detail.loading ? (
          detail.error instanceof ApiError && detail.error.status === 404 ? (
            <Empty title={`That ${kind} is not on the books`} message="They may have been removed, or belong to another branch." action={<Link to="/admin/delivery" className={ADMIN_PRIMARY}>Back to delivery</Link>} />
          ) : (
            <p role="alert" className="rounded-2xl bg-berry/10 px-4 py-3 text-[14px] text-berry-ink ring-1 ring-berry/25 ring-inset">
              {detail.error.message}{' '}
              <button type="button" className="font-semibold underline underline-offset-2" onClick={detail.reload}>
                Try again
              </button>
            </p>
          )
        ) : (
          <Loading />
        )}
      </>
    );

  const money = (m: number) => formatMoney(m, currency);
  const open = data.openRuns;
  const owed = balance && account ? feesToPay(balance) : null;
  const role = partner ? 'Delivery partner' : 'Rider';
  const phone = (partner ?? rider!).phone;
  const tabs = [
    { key: 'statement', label: account ? 'Statement' : 'Deliveries' },
    { key: 'road', label: `On the road${open.length ? ` (${open.length})` : ''}` },
    ...(partner && data.riders.length > 0 ? [{ key: 'riders', label: `Riders (${data.riders.length})` }] : []),
  ];
  const active = tabs.some((t) => t.key === tab) ? tab : 'statement';
  const netLabel = !balance || !account ? '' : balance.net < 0 ? 'You owe them' : balance.net > 0 ? 'They owe you' : 'All square';
  const status = !subject.isActive ? (rider ? 'Off duty' : 'Paused') : open.length > 0 ? `${open.length} on the road` : rider ? 'Available' : 'Active';
  const facts: [string, ReactNode][] = partner
    ? [['Charges', partnerTerms(partner, money)], ['Phone', partner.phone], ['Contact', partner.contactPerson], ['Cash', partner.collectsCash ? 'Collects' : 'Does not collect'], ['Added', new Date(partner.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })]]
    : [
        ['Pay', rider!.partnerId ? 'Via partner' : riderTerms(rider!, money)],
        ['Phone', rider!.phone],
        ['Vehicle', rider!.vehicle],
        ['Rides for', rider!.partnerId ? (parent ? <Link to={`/admin/delivery/partners/${parent.id}`} className="underline underline-offset-2">{parent.name}</Link> : 'A partner') : 'The branch'],
        ['Added', new Date(rider!.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })],
      ];
  const note = partner ? partner.note : rider!.note;
  const dutyLabel = subject.isActive ? (partner ? 'Pause' : 'Off duty') : partner ? 'Resume' : 'On duty';

  return (
    <div className="mx-auto max-w-6xl">
      <FloatingBar show={away}>
        <span className="truncate text-[14px] font-semibold">{subject.name}</span>
        <span className="shrink-0 text-[12.5px] text-ink-3">{status}</span>
        {canManage && owed !== null ? (
          <button type="button" tabIndex={away ? 0 : -1} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-flame px-3.5 text-[13px] font-semibold text-white" onClick={() => setSettling(true)}>
            <Receipt size={14} /> Pay {money(owed)}
          </button>
        ) : (
          <a href={`tel:${phone.replace(/\s/g, '')}`} tabIndex={away ? 0 : -1} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-flame px-3.5 text-[13px] font-semibold text-white">
            <Contact size={14} /> Call
          </a>
        )}
      </FloatingBar>

      {back}

      {/* Identity: a card you can pick up, and who they are in plain, high-contrast type beside it. */}
      <section ref={heroRef} className="grid items-center gap-8 lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-14">
        <TiltCard hue={hue}>
          <span aria-hidden className="absolute -bottom-10 -right-2 select-none font-display text-[200px] font-black leading-none opacity-[0.14]">
            {subject.name[0]}
          </span>
          <div className="relative flex h-full flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <span className="text-[12px] font-bold uppercase tracking-[0.16em] opacity-70">{role}</span>
              <span className="text-[12px] font-bold uppercase tracking-[0.06em] opacity-80">{status}</span>
            </div>
            {balance && account ? (
              <div>
                <p className={cx(DISPLAY, 'text-[clamp(40px,12vw,52px)] leading-none tracking-[-0.03em] tnum')}>{money(netShown)}</p>
                <p className="mt-1 text-[12px] font-bold uppercase tracking-[0.16em] opacity-70">{netLabel}</p>
              </div>
            ) : (
              <p className="text-[15px] font-semibold opacity-80">{rider?.partnerId ? `Rides for ${parent?.name ?? 'a partner'}` : 'Delivers for the branch'}</p>
            )}
            <div>
              <p className={cx(DISPLAY, 'truncate text-[22px] leading-none')}>{subject.name}</p>
              <p className="mt-2 flex items-center justify-between gap-3 text-[13px] font-semibold tnum opacity-80">
                <span className="truncate">{phone}</span>
                <span className="shrink-0">{partner ? partnerTerms(partner, money) : rider!.partnerId ? 'Via partner' : riderTerms(rider!, money)}</span>
              </p>
            </div>
          </div>
        </TiltCard>

        <div className="min-w-0">
          <h1 className={cx(DISPLAY, 'animate-rise wrap-break-word text-[clamp(38px,6.4vw,70px)] leading-[0.98] tracking-[-0.03em]')}>{subject.name}</h1>
          <p className="mt-5 max-w-[32ch] animate-rise text-[clamp(20px,2.6vw,28px)] font-medium leading-[1.3] text-ink-2 [animation-delay:80ms] sm:max-w-[38ch]">
            {balance && account ? (
              <>
                Holds <Num>{money(heldShown)}</Num> of your cash and is owed <Num>{money(feesShown)}</Num> in fees
                {open.length > 0 ? <>, with <Num>{open.length}</Num> on the road now</> : null}.
              </>
            ) : (
              <>{rider?.partnerId ? `Rides for ${parent?.name ?? 'a partner'}; their cash and fees settle on the partner's account.` : 'No account of their own yet.'}{open.length > 0 ? <> <Num>{open.length}</Num> on the road now.</> : null}</>
            )}
          </p>
          {note && <p className="mt-3 max-w-[48ch] animate-rise text-[14.5px] text-ink-3 [animation-delay:120ms]">{note}</p>}
          <div className="mt-6 flex animate-rise flex-wrap gap-2.5 [animation-delay:160ms]">
            {canManage && owed !== null && balance && (
              <button type="button" className={cx(ADMIN_PRIMARY, 'h-11 px-5 text-[14.5px]')} onClick={() => setSettling(true)}>
                <Receipt size={16} /> Pay {money(owed)}
              </button>
            )}
            <a href={`tel:${phone.replace(/\s/g, '')}`} className={cx(ADMIN_GHOST, 'h-11 px-5 text-[14.5px]')}>
              <Contact size={16} /> Call
            </a>
            {canManage && (
              <>
                <button type="button" className={cx(ADMIN_GHOST, 'h-11 px-5 text-[14.5px]')} disabled={duty.busy} onClick={toggleDuty}>
                  {dutyLabel}
                </button>
                <button type="button" className={cx(ADMIN_GHOST, 'h-11 px-5 text-[14.5px]')} onClick={() => setEditing(true)}>
                  <Sliders size={16} /> Edit
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {open.length > 0 && (
        <section aria-label="On the road" className="mt-10 animate-rise rounded-[28px] bg-flame-2/12 p-5 ring-1 ring-flame-2/40 ring-inset [animation-delay:200ms] sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-flame-1">
              <span className="size-2 rounded-full bg-flame-2 motion-safe:animate-pulse" /> {open.length} on the road right now
            </p>
            <button type="button" className={cx(ADMIN_GHOST, 'h-9')} onClick={() => setTab('road')}>
              See them
            </button>
          </div>
          <ul className="mt-3 grid gap-1.5 text-[15px] text-ink-2 sm:grid-cols-2">
            {open.slice(0, 4).map((run, i) => (
              <li key={run.id} className="animate-rise flex items-baseline justify-between gap-3" style={{ animationDelay: `${220 + Math.min(i, 4) * 40}ms` }}>
                <span className="truncate">
                  <span className="font-semibold text-ink tnum">{run.orderRef}</span> · {run.customerName}
                </span>
                <span className="shrink-0 text-[12.5px] text-ink-3 tnum">sent {clockTime(run.assignedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <EditModal branchId={branchId} currency={currency} partner={partner} rider={rider} partners={data.partners} onClose={() => setEditing(false)} onSaved={reload} />
      )}

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6 lg:col-start-2 lg:row-start-1">
          {balance && account && (
            <Block title="Balance" hint={netLabel} delay={260}>
              <dl className="grid gap-3">
                <BalanceRow icon={<Handshake size={16} />} label="Cash held" value={money(Math.max(balance.cashHeld, 0))} tint="bg-gold/15 text-gold-ink" />
                <BalanceRow icon={<Receipt size={16} />} label="Fees owed" value={money(Math.max(balance.feesOwed, 0))} tint="bg-mint/15 text-mint-ink" />
                <BalanceRow icon={<Cash size={16} />} label={netLabel} value={money(Math.abs(balance.net))} tint="bg-berry/10 text-berry-ink" strong />
              </dl>
            </Block>
          )}
          <Block title="Details" delay={320}>
            <dl className="grid gap-2.5 text-[14px]">
              {facts.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="min-w-0 truncate text-right font-medium">{v || '—'}</dd>
                </div>
              ))}
            </dl>
          </Block>
        </div>

        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <div role="tablist" className="mb-3 animate-rise inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-surface-2 p-1 ring-1 ring-hairline ring-inset [animation-delay:280ms]">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active === t.key}
                onClick={() => setTab(t.key)}
                className={cx('shrink-0 rounded-full px-4 py-1.5 text-[13.5px] font-semibold transition-colors', active === t.key ? 'bg-flame text-white' : 'text-ink-3 hover:text-ink')}
              >
                {t.label}
              </button>
            ))}
          </div>

          {active === 'statement' && <Statement account={account} statement={statement} viaPartner={!account} money={money} />}
          {active === 'road' &&
            (open.length > 0 ? <OnTheRoad runs={open} money={money} /> : <Panel><Empty title="Nothing on the road" message="Orders you send out with them show up here until they are delivered." /></Panel>)}
          {active === 'riders' && partner && <PartnerRiders riders={data.riders} />}
        </div>
      </div>

      {settling && account && balance && (
        <SettleSheet branchId={branchId} account={account} name={subject.name} balance={balance} currency={currency} onClose={() => setSettling(false)} onDone={reload} />
      )}
    </div>
  );
}

function BalanceRow({ icon, label, value, tint, strong }: { icon: ReactNode; label: string; value: string; tint: string; strong?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className={cx('grid size-9 shrink-0 place-items-center rounded-xl', tint)}>
        {icon}
      </span>
      <dt className="flex-1 text-[14px] text-ink-3">{label}</dt>
      <dd className={cx('tnum', strong ? 'font-display text-[22px] font-semibold' : 'text-[16px] font-semibold')}>{value}</dd>
    </div>
  );
}

/** A courier's statement, a page at a time. `reload` starts over from the newest. */
function useStatement(branchId: string, kind: Account['kind'], id: string) {
  const first = useAsync(() => fetchCourierStatement(branchId, kind, id), [branchId, kind, id]);
  // Older pages hang off the first page they were read after: a fresh first page (a settlement, another courier) orphans them.
  const [paged, setPaged] = useState<{ after: StatementPage | null; lines: StatementLine[]; cursor: string | null }>({ after: null, lines: [], cursor: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<Error | null>(null);

  const older = paged.after === first.data && first.data ? paged : null;
  const cursor = older ? older.cursor : (first.data?.nextCursor ?? null);
  const loadMore = () => {
    const head = first.data;
    if (!head || !cursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    fetchCourierStatement(branchId, kind, id, cursor)
      .then((page) => setPaged({ after: head, lines: [...(older?.lines ?? []), ...page.entries], cursor: page.nextCursor }))
      .catch((e: unknown) => setMoreError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoadingMore(false));
  };

  return {
    lines: [...(first.data?.entries ?? []), ...(older?.lines ?? [])],
    loading: first.loading && !first.data,
    error: first.error ?? moreError,
    hasMore: cursor !== null,
    loadingMore,
    loadMore,
    reload: first.reload,
  };
}

type StatementState = ReturnType<typeof useStatement>;

/* ── On the road ───────────────────────────────────────────────────── */

function OnTheRoad({ runs, money }: { runs: DeliveryAssignment[]; money: (m: number) => string }) {
  return (
    <Panel bare title="On the road" hint="Counted in the balance once they are marked delivered">
      <ul>
        {runs.map((run, i) => (
          <li key={run.id} className="animate-rise flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-0 sm:px-5" style={{ animationDelay: `${320 + Math.min(i, 10) * 40}ms` }}>
            <span className="size-2 shrink-0 rounded-full bg-mint motion-safe:animate-breathe-slow" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold">
                <span className="tnum">{run.orderRef}</span> · {run.customerName}
              </span>
              <span className="block truncate text-[12.5px] text-ink-4 tnum">
                Sent {clockTime(run.assignedAt)}
                {run.riderName && run.partnerName ? ` · ${run.riderName}` : ''}
              </span>
            </span>
            <span className="shrink-0 text-right text-[12.5px] text-ink-3">
              {run.cashToCollect > 0 ? (
                <>
                  <span className="block font-semibold text-gold-ink tnum">{money(run.cashToCollect)}</span>to collect
                </>
              ) : (
                'Prepaid'
              )}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ── Statement ─────────────────────────────────────────────────────── */

function Statement({ account, statement, viaPartner, money }: { account: Account | null; statement: StatementState; viaPartner: boolean; money: (m: number) => string }) {
  const days = groupByDay(statement.lines, (l) => l.at);

  return (
    <Panel bare title={viaPartner ? 'Deliveries' : 'Statement'} hint={account ? 'Each line moves the balance' : 'Runs this rider has completed'}>
      {statement.loading ? (
        <Loading />
      ) : statement.error && days.length === 0 ? (
        <p role="alert" className="px-4 py-6 text-[13.5px] text-berry-ink sm:px-5">
          {statement.error.message}{' '}
          <button type="button" className="font-semibold underline underline-offset-2" onClick={statement.reload}>
            Try again
          </button>
        </p>
      ) : days.length === 0 ? (
        <Empty title="Nothing here yet" message={account ? 'Once an order is delivered, or you record a settlement, it shows up here with the balance after it.' : 'Completed runs appear here.'} />
      ) : (
        <div>
          {days.map((day, g) => (
            <div key={dayLabel(day[0].at)} className="animate-rise" style={{ animationDelay: `${320 + Math.min(g, 4) * 70}ms` }}>
              <div className="flex items-baseline justify-between gap-3 border-b border-hairline bg-surface-2/40 px-4 py-2 sm:px-5">
                <h3 className="text-[12.5px] font-semibold text-ink-2">{dayLabel(day[0].at)}</h3>
                <span className="text-[12px] text-ink-4 tnum">
                  {day.length} {day.length === 1 ? 'entry' : 'entries'}
                </span>
              </div>
              <ul>
                {day.map((line, n) => (
                  <StatementRow key={`${line.type}:${line.id}`} line={line} money={money} delay={380 + Math.min(g, 4) * 70 + Math.min(n, 10) * 40} />
                ))}
              </ul>
            </div>
          ))}
          {(statement.hasMore || statement.error) && (
            <div className="grid justify-items-center gap-2 px-4 py-4 sm:px-5">
              {statement.error && (
                <p role="alert" className="text-[12.5px] text-berry-ink">
                  {statement.error.message}
                </p>
              )}
              <button type="button" className={ADMIN_GHOST} onClick={statement.loadMore} disabled={statement.loadingMore}>
                {statement.loadingMore ? 'Loading…' : 'Show older'}
              </button>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function Signed({ delta, money, className }: { delta: number; money: (m: number) => string; className?: string }) {
  if (delta === 0) return <span className={cx('tnum text-ink-3', className)}>{money(0)}</span>;
  return <span className={cx('tnum', delta > 0 ? 'text-gold-ink' : 'text-pass', className)}>{delta > 0 ? '+' : '−'}{money(Math.abs(delta))}</span>;
}

function StatementRow({ line, money, delay }: { line: StatementLine; money: (m: number) => string; delay: number }) {
  if (line.type === 'SETTLEMENT') {
    const s = line.settlement;
    return (
      <li className="animate-rise grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-hairline px-4 py-3 last:border-0 sm:px-5" style={{ animationDelay: `${delay}ms` }}>
        <span aria-hidden className="grid size-8 place-items-center rounded-full bg-mint/12 text-mint-ink">
          <Handshake size={15} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold">{s.direction === 'COLLECT' ? 'Handed over cash' : 'You paid them'}</span>
          <span className="block truncate text-[12.5px] text-ink-4 tnum">
            {clockTime(s.at)} · {s.method === 'CASH' ? 'Cash' : 'Bank or wallet'}
            {(s.offset ?? 0) > 0 ? ` · netted off ${money(s.offset ?? 0)} in ${s.direction === 'COLLECT' ? 'fees' : 'cash'}` : ''}
            {s.note ? ` · ${s.note}` : ''}
          </span>
        </span>
        <span className="block text-right">
          <span className="block text-[14px] font-semibold text-ink-2 tnum">{line.delta === 0 ? money(0) : `${line.delta > 0 ? '+' : '−'}${money(Math.abs(line.delta))}`}</span>
          <span className="block text-[12px] text-ink-4 tnum">balance {money(line.balanceAfter)}</span>
        </span>
      </li>
    );
  }

  const a = line.assignment;
  const short = (a.cashToCollect ?? 0) - (a.cashCollected ?? 0);
  const delta = 'delta' in line ? line.delta : null;
  return (
    <li className="animate-rise grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-hairline px-4 py-3 last:border-0 sm:px-5" style={{ animationDelay: `${delay}ms` }}>
      <span aria-hidden className="grid size-8 place-items-center rounded-full bg-surface-2 text-ink-3 ring-1 ring-hairline ring-inset">
        <Bike size={15} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-semibold">
          <span className="tnum">{a.orderRef}</span> · {a.customerName}
        </span>
        <span className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-ink-4 tnum">
          <span>{clockTime(a.deliveredAt ?? a.assignedAt)}</span>
          <span aria-hidden>·</span>
          <span>{a.cashToCollect > 0 ? `Cash ${money(a.cashCollected ?? 0)}` : 'Prepaid'}</span>
          {a.courierFee > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>Fee {money(a.courierFee)}</span>
            </>
          )}
          {a.riderName && a.partnerName && a.accountKind === 'PARTNER' && (
            <>
              <span aria-hidden>·</span>
              <span>{a.riderName}</span>
            </>
          )}
          {short > 0 && <Chip tone="warn">{money(short)} short</Chip>}
        </span>
      </span>
      {delta !== null ? (
        <span className="block text-right">
          <Signed delta={delta} money={money} className="block text-[14px] font-semibold" />
          {'balanceAfter' in line && <span className="block text-[12px] text-ink-4 tnum">balance {money(line.balanceAfter)}</span>}
        </span>
      ) : (
        <span />
      )}
    </li>
  );
}

/** The edit form in a centered modal. A native `<dialog>` gives the focus trap, Escape and the inert page behind. Mounted only while editing, so every edit starts from what is saved. */
function EditModal({
  branchId,
  currency,
  partner,
  rider,
  partners,
  onClose,
  onSaved,
}: {
  branchId: string;
  currency: string;
  partner: DeliveryPartner | null;
  rider: Rider | null;
  partners: DeliveryPartner[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useDiscardBack();
  const downOnBackdrop = useRef(false); // a drag that starts in a field and ends on the backdrop is not a dismiss
  const push = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = saving;
  const [initial] = useState(() => (partner ? partnerDraftOf(partner) : riderDraftOf(rider!)));
  const [draft, setDraft] = useState<PartnerDraft | RiderDraft>(initial);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const valid = draft.name.trim().length >= 2;

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  // Errors show inside the modal: a toast would sit under the dialog's backdrop.
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await (partner ? savePartner(branchId, draft as PartnerDraft, partner.id) : saveRider(branchId, draft as RiderDraft, rider!.id));
      push('Saved');
      onSaved();
      ref.current?.close();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not go through. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => busy && e.preventDefault()}
      onPointerDown={(e) => (downOnBackdrop.current = e.target === ref.current)}
      onClick={(e) => e.target === ref.current && downOnBackdrop.current && !busy && ref.current?.close()}
      aria-labelledby="edit-courier-title"
      className={cx(PANEL, 'm-auto flex max-h-[calc(100dvh-1.5rem)] w-[min(34rem,calc(100vw-1.5rem))] flex-col overflow-hidden p-0 shadow-2xl shadow-black/40 backdrop:bg-black/60 backdrop:backdrop-blur-sm')}
    >
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && valid) void save();
        }}
      >
        <header className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
          <h2 id="edit-courier-title" className="text-[18px] font-semibold tracking-tight">
            Edit {partner ? 'partner' : 'rider'}
          </h2>
          <button type="button" onClick={() => ref.current?.close()} disabled={busy} aria-label="Close" className="grid size-9 place-items-center rounded-full text-ink-3 ring-1 ring-hairline ring-inset hover:text-ink">
            <X size={16} />
          </button>
        </header>
        <fieldset disabled={busy} className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-y-auto overscroll-contain px-5 py-5">
          {partner ? <PartnerFields draft={draft as PartnerDraft} onChange={setDraft} currency={currency} /> : <RiderFields draft={draft as RiderDraft} onChange={setDraft} currency={currency} partners={partners} />}
        </fieldset>
        {error && (
          <p role="alert" className="border-t border-hairline bg-berry/10 px-5 py-3 text-[13.5px] text-berry-ink">
            {error}
          </p>
        )}
        <footer className="flex gap-2 border-t border-hairline px-5 py-4">
          <button type="button" className={cx(ADMIN_GHOST, 'flex-1')} disabled={busy} onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button type="submit" className={cx(ADMIN_PRIMARY, 'flex-1')} disabled={busy || !dirty || !valid}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

/* ── A partner's riders ────────────────────────────────────────────── */

function PartnerRiders({ riders }: { riders: RiderListing[] }) {
  if (riders.length === 0) return null;
  return (
    <Panel bare title="Their riders" hint="Their runs add to this account">
      <ul>
        {riders.map((r, i) => (
          <li key={r.id} className="animate-rise border-b border-hairline last:border-0" style={{ animationDelay: `${340 + Math.min(i, 10) * 40}ms` }}>
            <Link to={`/admin/delivery/riders/${r.id}`} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/40 sm:px-5">
              <Monogram name={r.name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{r.name}</span>
                <span className="block truncate text-[12.5px] text-ink-4 tnum">{r.open > 0 ? `On the road · ${r.open}` : r.isActive ? 'Available' : 'Off duty'}</span>
              </span>
              <ChevronRight size={14} className="text-ink-4 transition-move group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
