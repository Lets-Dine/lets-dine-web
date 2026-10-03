import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listAudit } from '../../api/staff';
import type { AuditAction, AuditEntry } from '../../domain/types';
import { useStaff } from '../../state/AuthContext';
import { relativeTime } from '../../components/time';
import {
  DOCKET_CARD,
  DocketDaySection,
  DocketEmpty,
  INPUT_BOX,
  LedgerStat,
  Loading,
  PageTitle,
  Segmented,
} from '../../components/admin/kit';
import { cx } from '../../components/ui';
import { History, Search } from '../../components/icons';

/**
 * §51 — the audit trail, read as the same kind of docket roll the Payments
 * ledger is: newest first, grouped by day, 20 entries at a time as the roll
 * scrolls rather than the fixed 400-row cap this page used to ask for in one
 * shot (§51 in api/admin.ts still caps what the restaurant keeps at all —
 * this just stops asking for the whole trail up front).
 */

type Category = 'all' | 'menu' | 'tables' | 'orders' | 'settings';

const AUDIT_PER_PAGE = 100;

const CATEGORY_OF: Record<AuditAction, Exclude<Category, 'all'>> = {
  price_changed: 'menu',
  availability_changed: 'menu',
  dish_created: 'menu',
  dish_updated: 'menu',
  dish_archived: 'menu',
  dish_restored: 'menu',
  dish_featured: 'menu',
  dish_reordered: 'menu',
  dish_add_ons_updated: 'menu',
  dish_variant_created: 'menu',
  dish_variant_updated: 'menu',
  dish_variant_archived: 'menu',
  dish_variant_restored: 'menu',
  addon_created: 'menu',
  addon_updated: 'menu',
  addon_archived: 'menu',
  addon_restored: 'menu',
  category_created: 'menu',
  category_renamed: 'menu',
  category_deleted: 'menu',
  category_reordered: 'menu',
  table_created: 'tables',
  table_renamed: 'tables',
  table_disabled: 'tables',
  table_enabled: 'tables',
  table_session_started: 'tables',
  table_session_ended: 'tables',
  qr_regenerated: 'tables',
  floor_created: 'tables',
  floor_renamed: 'tables',
  floor_disabled: 'tables',
  floor_enabled: 'tables',
  branch_created: 'settings',
  branch_updated: 'settings',
  branch_disabled: 'settings',
  branch_enabled: 'settings',
  branch_hours_updated: 'settings',
  order_status_changed: 'orders',
  order_cancelled: 'orders',
  order_item_added: 'orders',
  order_item_removed: 'orders',
  order_item_cancelled: 'orders',
  table_settled: 'orders',
  payment_completed: 'orders',
  settings_updated: 'settings',
  staff_invited: 'settings',
  staff_role_changed: 'settings',
  staff_deactivated: 'settings',
  staff_branches_changed: 'settings',
};

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'menu', label: 'Menu' },
  { value: 'tables', label: 'Tables' },
  { value: 'orders', label: 'Orders' },
  { value: 'settings', label: 'Settings & staff' },
];

/** Same vocabulary as the old panel in Settings, extended to every action so nothing falls back to grey by accident. */
const ACTION_TONE: Record<AuditAction, string> = {
  price_changed: 'text-gold',
  availability_changed: 'text-flame-1',
  dish_created: 'text-mint',
  dish_updated: 'text-ink-3',
  dish_archived: 'text-berry',
  dish_restored: 'text-mint',
  dish_featured: 'text-gold',
  dish_reordered: 'text-ink-3',
  dish_add_ons_updated: 'text-ink-3',
  dish_variant_created: 'text-mint',
  dish_variant_updated: 'text-ink-3',
  dish_variant_archived: 'text-berry',
  dish_variant_restored: 'text-mint',
  addon_created: 'text-mint',
  addon_updated: 'text-ink-3',
  addon_archived: 'text-berry',
  addon_restored: 'text-mint',
  category_created: 'text-mint',
  category_renamed: 'text-ink-3',
  category_deleted: 'text-berry',
  category_reordered: 'text-ink-3',
  table_created: 'text-mint',
  table_renamed: 'text-ink-3',
  table_disabled: 'text-berry',
  table_enabled: 'text-mint',
  table_session_started: 'text-mint',
  table_session_ended: 'text-ink-3',
  qr_regenerated: 'text-berry',
  floor_created: 'text-mint',
  floor_renamed: 'text-ink-3',
  floor_disabled: 'text-berry',
  floor_enabled: 'text-mint',
  branch_created: 'text-mint',
  branch_updated: 'text-ink-3',
  branch_disabled: 'text-berry',
  branch_enabled: 'text-mint',
  branch_hours_updated: 'text-ink-3',
  order_status_changed: 'text-pass',
  order_cancelled: 'text-berry',
  order_item_added: 'text-ink-3',
  order_item_removed: 'text-ink-3',
  order_item_cancelled: 'text-berry',
  table_settled: 'text-mint',
  payment_completed: 'text-mint',
  settings_updated: 'text-flame-1',
  staff_invited: 'text-mint',
  staff_role_changed: 'text-gold',
  staff_deactivated: 'text-berry',
  staff_branches_changed: 'text-ink-3',
};

function matchesQuery(entry: AuditEntry, q: string): boolean {
  if (!q) return true;
  return `${entry.subject} ${entry.detail} ${entry.actorName} ${entry.action}`.toLowerCase().includes(q);
}

function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

function dayLabel(iso: string): string {
  const at = new Date(iso);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return at.toLocaleDateString('en-US', { weekday: 'long' });
  return at.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: at.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function AuditLog() {
  const staff = useStaff();

  const [category, setCategory] = useState<Category>('all');
  const [actor, setActor] = useState('all');
  const [query, setQuery] = useState('');

  const [allEntries, setAllEntries] = useState<AuditEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelObserverRef = useRef<IntersectionObserver | null>(null);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  // Bumped every time the reset effect below runs — including React StrictMode's
  // dev double-invoke of it, which would otherwise re-clear `loadingRef` out from
  // under a fetch that's still in flight and let a second, redundant request land
  // on top of the first and double-advance `offsetRef`. A fetch that resolves
  // under a stale generation is a no-op. See Payments.tsx, which hit this for real.
  const generationRef = useRef(0);

  const loadMoreEntries = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    const generation = generationRef.current;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const { rows: nextEntries, count } = await listAudit(staff, AUDIT_PER_PAGE, offsetRef.current);
      if (generation !== generationRef.current) return;
      offsetRef.current += nextEntries.length;
      setTotalCount(count);
      setHasMore(nextEntries.length > 0 && offsetRef.current < count);
      setAllEntries((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...nextEntries.filter((e) => !seen.has(e.id))];
      });
    } finally {
      if (generation === generationRef.current) {
        loadingRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [staff, hasMore]);

  // A callback ref, not a plain ref + effect: the sentinel <div> only enters the DOM
  // once the first page has loaded, so an effect keyed on `loadMoreEntries` can miss
  // that mount entirely if `hasMore` (and so the callback's identity) never changes
  // again — leaving the observer permanently attached to nothing. A callback ref fires
  // exactly when the node mounts or unmounts, so it can't miss that moment.
  const attachSentinel = useCallback(
    (node: HTMLDivElement | null) => {
      sentinelObserverRef.current?.disconnect();
      sentinelObserverRef.current = null;
      if (!node) return;

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting && !loadingRef.current) {
            void loadMoreEntries();
          }
        },
        { threshold: 0.1 },
      );
      observer.observe(node);
      sentinelObserverRef.current = observer;
    },
    [loadMoreEntries],
  );

  useEffect(() => {
    generationRef.current += 1;
    offsetRef.current = 0;
    setAllEntries([]);
    setHasMore(true);
    loadingRef.current = false;
  }, [staff]);

  useEffect(() => {
    if (allEntries.length === 0) {
      void loadMoreEntries();
    }
  }, [staff]);

  const entries = allEntries;

  const actors = useMemo(() => {
    const byId = new Map<string, string>();
    for (const e of entries) byId.set(e.actorId, e.actorName);
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [entries]);

  const byActorAndQuery = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => (actor === 'all' || e.actorId === actor) && matchesQuery(e, q));
  }, [entries, actor, query]);

  const categoryCounts = useMemo(() => {
    const counts: Record<Category, number> = { all: byActorAndQuery.length, menu: 0, tables: 0, orders: 0, settings: 0 };
    for (const e of byActorAndQuery) counts[CATEGORY_OF[e.action]] += 1;
    return counts;
  }, [byActorAndQuery]);

  const filtered = useMemo(
    () => (category === 'all' ? byActorAndQuery : byActorAndQuery.filter((e) => CATEGORY_OF[e.action] === category)),
    [byActorAndQuery, category],
  );

  const groups = useMemo(() => {
    const map = new Map<string, AuditEntry[]>();
    for (const e of filtered) {
      const key = dayKey(e.at);
      const bucket = map.get(key);
      if (bucket) bucket.push(e);
      else map.set(key, [e]);
    }
    return [...map.values()];
  }, [filtered]);

  const today = useMemo(() => entries.filter((e) => dayKey(e.at) === dayKey(new Date().toISOString())).length, [entries]);
  const flagged = useMemo(() => entries.filter((e) => ACTION_TONE[e.action] === 'text-berry').length, [entries]);
  const busiest = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const e of entries) {
      const row = counts.get(e.actorId) ?? { name: e.actorName, count: 0 };
      row.count += 1;
      counts.set(e.actorId, row);
    }
    let best: { name: string; count: number } | null = null;
    for (const row of counts.values()) if (!best || row.count > best.count) best = row;
    return best;
  }, [entries]);

  const filtering = category !== 'all' || actor !== 'all' || query.trim().length > 0;

  return (
    <>
      <PageTitle
        title="Audit log"
        subtitle={
          staff.branches && staff.branches.length > 1
            ? `Management actions at ${staff.branches.find((b) => b.id === staff.branchId)?.name ?? 'this branch'}, kept with who did it and what changed`
            : 'Every management action, kept with who did it and what changed'
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="overflow-x-auto no-scrollbar">
          <Segmented
            label="Category"
            value={category}
            onChange={setCategory}
            options={CATEGORY_OPTIONS.map((o) => ({
              value: o.value,
              label: `${o.label}${categoryCounts[o.value] ? ` (${categoryCounts[o.value]})` : ''}`,
            }))}
          />
        </div>

        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Search the audit log</span>
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-4">
            <Search size={16} />
          </span>
          <input
            className={cx(INPUT_BOX, 'pl-10')}
            value={query}
            placeholder="Search by dish, table, order or person"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <select
          className={cx(INPUT_BOX, 'w-auto appearance-none py-2')}
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          aria-label="Filter by staff member"
        >
          <option value="all">Everyone</option>
          {actors.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {entries.length > 0 && (
        <div className={cx('mb-4', DOCKET_CARD)}>
          {/* ── The roll's own header — the same document a reprint would show. ── */}
          <div className="px-6 pt-7 pb-5 text-center">
            <p className="text-[10.5px] font-bold tracking-[0.24em] text-docket-inksoft uppercase">Restaurant dashboard</p>
            <h2 className="font-display mt-1 text-[26px] font-black tracking-tight">Audit ledger</h2>
            <p className="mt-1 text-[12px] text-docket-inksoft">
              {filtering
                ? `${filtered.length} of ${entries.length} action${entries.length === 1 ? '' : 's'} shown`
                : `${entries.length} of ${totalCount.toLocaleString()} action${totalCount === 1 ? '' : 's'} loaded`}
            </p>
          </div>

          <div className="mx-6 border-t border-dashed border-docket-line" />
          <div className="grid grid-cols-2 divide-x divide-dashed divide-docket-line sm:grid-cols-4">
            <LedgerStat label="Today" value={today.toLocaleString()} sub={today ? 'so far' : 'nothing yet'} />
            <LedgerStat
              label="Most active"
              value={busiest?.name ?? '—'}
              sub={busiest ? `${busiest.count} action${busiest.count === 1 ? '' : 's'}` : undefined}
            />
            <LedgerStat label="Worth a look" value={flagged.toLocaleString()} sub="cancellations, deletions, disables" />
            <LedgerStat label="Logged" value={totalCount.toLocaleString()} sub="on record" />
          </div>
        </div>
      )}

      {/* ── The roll itself — every action, grouped one box per day. ── */}
      {entries.length === 0 && loadingMore ? (
        <div className={DOCKET_CARD}>
          <Loading label="Loading the audit trail…" />
        </div>
      ) : entries.length === 0 ? (
        <DocketEmpty
          icon={<History size={28} className="text-docket-inksoft/70" />}
          title="Nothing logged yet"
          message="Every management action from here on is recorded with who did it and what changed."
        />
      ) : filtered.length === 0 ? (
        <DocketEmpty
          icon={<History size={28} className="text-docket-inksoft/70" />}
          title="No matches"
          message="Try a different search, category or person."
        />
      ) : (
        <>
          <div className="grid gap-4">
            {groups.map((group) => (
              <DocketDaySection key={group[0].id} label={dayLabel(group[0].at)} count={group.length} itemLabel="action">
                {group.map((entry) => (
                  <AuditStub key={entry.id} entry={entry} />
                ))}
              </DocketDaySection>
            ))}
          </div>

          {loadingMore && <div className="mt-4 flex justify-center"><Loading label="Loading more actions…" /></div>}

          <div ref={attachSentinel} className="mt-8 h-4" />
        </>
      )}
    </>
  );
}

function AuditStub({ entry }: { entry: AuditEntry }) {
  const tone = ACTION_TONE[entry.action];
  return (
    <div className="flex items-start gap-3.5 border-t border-dashed border-docket-line px-6 py-4 first:border-t-0">
      <span className={cx('mt-1.5 size-2.5 shrink-0 rounded-full', tone.replace('text-', 'bg-'))} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={cx('text-[10.5px] font-bold uppercase tracking-[0.08em]', tone)}>{entry.action.replace(/_/g, ' ')}</span>
          <b className="text-[13.5px] font-bold">{entry.subject}</b>
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-docket-inksoft">{entry.detail}</span>
      </span>
      <span className="shrink-0 text-right">
        <div className="text-[12.5px] font-bold">{entry.actorName}</div>
        <div className="mt-0.5 text-[10.5px] text-docket-inksoft tnum" title={new Date(entry.at).toLocaleString()}>
          {relativeTime(entry.at)}
        </div>
      </span>
    </div>
  );
}
