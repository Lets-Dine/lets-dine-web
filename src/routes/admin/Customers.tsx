import { useCallback, useEffect, useRef, useState } from 'react';
import { CUSTOMER_WRITES, createCustomer, listCustomers } from '../../api/customers';
import type { CustomerSort } from '../../api/customers';
import { SAMPLE_DETAIL, getCustomer, removeCustomer, since, updateCustomerNotes } from '../../data/customers';
import type { NewCustomer } from '../../data/customers';
import type { CustomerListItem, CustomerSegment } from '../../domain/types';
import { formatMoney } from '../../domain/money';
import { useAuth } from '../../state/AuthContext';
import { useToast } from '../../state/ToastContext';
import { ADMIN_GHOST, ADMIN_PRIMARY, Empty, Loading, PANEL, PageTitle, Select } from '../../components/admin/kit';
import { Avatar, CustomerSheet, SegmentPill, Tally } from '../../components/admin/CustomerSheet';
import { Plus, Search } from '../../components/icons';
import { CHIP, CHIP_OFF, CHIP_ON, cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

type Filter = 'all' | Exclude<CustomerSegment, 'occasional'>;

const PAGE = 20;

const SORTS: { value: CustomerSort; label: string }[] = [
  { value: 'lastVisit', label: 'Seen most recently' },
  { value: 'visits', label: 'Most visits' },
  { value: 'spend', label: 'Highest spend' },
  { value: 'name', label: 'Name, A–Z' },
];

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'regular', label: 'Regulars' },
  { value: 'new', label: 'New' },
  { value: 'lapsed', label: 'Lapsed' },
];

/**
 * The regulars book: everyone who has given the restaurant a phone number. Search, filter, sort
 * and paging all happen on the server; this screen only holds the pages it has fetched so far.
 */
export function Customers() {
  const { allows } = useAuth();
  const { menu } = useDashboard();
  const push = useToast();
  const canAdd = allows('customers:edit');
  const canEdit = canAdd && CUSTOMER_WRITES;
  const currency = menu.restaurant.currency;

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<CustomerSort>('lastVisit');
  const [rows, setRows] = useState<CustomerListItem[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ mode: 'add' } | { mode: 'view'; id: string } | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  /** Bumped whenever the first page must be re-read. */
  const [nonce, setNonce] = useState(0);
  /** A fetch that resolves under an older value than this is dropped — a newer search has replaced it. */
  const generation = useRef(0);

  // Typing shouldn't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(id);
  }, [query]);

  const fetchPage = useCallback(
    (offset: number) => listCustomers({ q: debounced, segment: filter === 'all' ? undefined : filter, sortBy: sort, offset, limit: PAGE }),
    [debounced, filter, sort],
  );

  // A new search, filter or sort — or a customer just added — starts again from the first page.
  useEffect(() => {
    const mine = ++generation.current;
    setLoading(true);
    fetchPage(0)
      .then((page) => {
        if (mine !== generation.current) return;
        setRows(page.rows);
        setCount(page.count);
        setError(null);
      })
      .catch((e: Error) => mine === generation.current && setError(e.message))
      .finally(() => mine === generation.current && setLoading(false));
  }, [fetchPage, nonce]);

  const loadMore = () => {
    const mine = generation.current;
    setLoadingMore(true);
    fetchPage(rows.length)
      .then((page) => {
        if (mine !== generation.current) return;
        setRows((prev) => [...prev, ...page.rows]);
        setCount(page.count);
      })
      .catch((e: Error) => push(e.message, '⚠️'))
      .finally(() => setLoadingMore(false));
  };

  const open = sheet?.mode === 'view' ? rows.find((r) => r.id === sheet.id) : undefined;

  const add = (input: NewCustomer) => {
    // Design preview: the live backend has no create endpoint yet, so nothing is saved.
    if (!CUSTOMER_WRITES) {
      push(`Preview only — ${input.name.trim()} wasn't saved. Adding customers isn't connected yet.`);
      return;
    }
    const created = createCustomer(input);
    setFilter('all');
    setQuery('');
    setDebounced('');
    setSort('lastVisit');
    setFresh(created.id);
    setNonce((n) => n + 1);
    push(`${created.name} added to your customers`);
  };

  const filtering = debounced.trim() !== '' || filter !== 'all';

  return (
    <>
      <PageTitle
        title="Customers"
        subtitle="The people who keep coming back — and the ones who've gone quiet."
        action={
          canAdd && (
            <button type="button" className={ADMIN_PRIMARY} onClick={() => setSheet({ mode: 'add' })}>
              <Plus size={16} /> Add customer
            </button>
          )
        }
      />

      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filter customers">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)} className={cx(CHIP, filter === f.value ? CHIP_ON : CHIP_OFF)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <label className="relative block min-w-0 flex-1 lg:w-64 lg:flex-none">
            <span className="sr-only">Search customers</span>
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name or phone"
              className="w-full rounded-xl bg-surface-2 py-2.5 pl-10 pr-3.5 text-[14.5px] text-ink outline-none ring-1 ring-hairline ring-inset placeholder:text-ink-4 focus:ring-[1.5px] focus:ring-flame-2/40"
            />
          </label>
          <div className="w-44 shrink-0">
            <Select value={sort} onChange={setSort} options={SORTS} />
          </div>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {loading ? 'Loading customers' : `${count} customers`}
      </p>

      <section className={cx(PANEL, 'overflow-hidden')}>
        {error && rows.length === 0 ? (
          <Empty
            emoji="⚠️"
            title="Couldn't load customers"
            message={error}
            action={
              <button type="button" className={ADMIN_GHOST} onClick={() => setNonce((n) => n + 1)}>
                Try again
              </button>
            }
          />
        ) : loading && rows.length === 0 ? (
          <Loading label="Loading customers…" />
        ) : rows.length === 0 ? (
          filtering ? (
            <Empty emoji="🔍" title="Nobody matches that" message="Try a different spelling, or clear the filter to see everyone." />
          ) : (
            <Empty
              emoji="📒"
              title="No customers yet"
              message="Customers appear here once they give a phone number when ordering."
              action={canAdd && <button type="button" className={ADMIN_PRIMARY} onClick={() => setSheet({ mode: 'add' })}>Add a customer</button>}
            />
          )
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,2.2fr)_1.2fr_.7fr_1fr_1fr] gap-4 border-b border-hairline px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-4 lg:grid">
              <span>Customer</span>
              <span>Last ten weeks</span>
              <span className="text-right">Visits</span>
              <span className="text-right">Last seen</span>
              <span className="text-right">Spent</span>
            </div>
            <ul className={cx('transition-opacity duration-150', loading && 'opacity-60')}>
              {rows.map((c) => (
                <li key={c.id} className={cx('border-b border-hairline last:border-0', fresh === c.id && 'animate-rise bg-flame-2/8')}>
                  <button
                    type="button"
                    onClick={() => setSheet({ mode: 'view', id: c.id })}
                    className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3.5 gap-y-2 px-4 py-3.5 text-left transition-colors duration-150 hover:bg-surface-2/50 focus-visible:bg-surface-2/50 focus-visible:outline-none sm:px-5 lg:grid-cols-[minmax(0,2.2fr)_1.2fr_.7fr_1fr_1fr] lg:gap-4"
                  >
                    <span className="flex min-w-0 items-center gap-3.5">
                      <Avatar name={c.name} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[15px] font-semibold tracking-tight">{c.name}</span>
                          <SegmentPill segment={c.segment} />
                        </span>
                        <span className="block truncate text-[12.5px] text-ink-3 tnum">{c.phone}</span>
                      </span>
                    </span>
                    <span className="hidden lg:block">
                      <Tally weeks={c.visitWeeks} />
                    </span>
                    <span className="hidden text-right text-[14px] font-semibold tnum lg:block">{c.visits}</span>
                    <span className="hidden text-right text-[13.5px] text-ink-2 lg:block">{since(c.lastVisitAt)}</span>
                    <span className="col-start-2 row-start-1 text-right text-[14.5px] font-semibold tnum lg:col-start-auto lg:row-start-auto">{formatMoney(c.spend, currency)}</span>
                    <span className="col-span-2 flex items-center justify-between gap-3 text-[12.5px] text-ink-3 lg:hidden">
                      <Tally weeks={c.visitWeeks} />
                      <span className="tnum">
                        {c.visits} {c.visits === 1 ? 'visit' : 'visits'} · {since(c.lastVisitAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3 text-[12.5px] text-ink-3 sm:px-5">
              <span className="tnum">
                Showing {rows.length} of {count}
              </span>
              {rows.length < count && (
                <button type="button" className={cx(ADMIN_GHOST, 'h-9')} disabled={loadingMore} onClick={loadMore}>
                  {loadingMore ? 'Loading…' : 'Show more'}
                </button>
              )}
            </div>
          </>
        )}
      </section>
      {CUSTOMER_WRITES && <p className="mt-3 text-[12px] text-ink-4">Sample customers for now — nothing here is saved to a server yet.</p>}

      {sheet && (
        <CustomerSheet
          key={sheet.mode === 'view' ? sheet.id : 'add'}
          mode={sheet.mode}
          item={open}
          detail={open ? (getCustomer(open.id) ?? SAMPLE_DETAIL) : undefined}
          sample={open ? !getCustomer(open.id) : false}
          currency={currency}
          canEdit={canEdit}
          onClose={() => setSheet(null)}
          onAdd={add}
          onNotes={(id, notes) => {
            updateCustomerNotes(id, notes);
            push('Note saved');
          }}
          onRemove={(id) => {
            removeCustomer(id);
            setNonce((n) => n + 1);
            push('Customer removed');
          }}
        />
      )}
    </>
  );
}
