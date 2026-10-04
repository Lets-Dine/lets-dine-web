import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../api/store';
import { clearPlatformKey } from '../../api/platform';
import { countTenantViews, listPlans, listTenantRows } from '../../api/platformConsole';
import type { TenantListRow, TenantSort, TenantView } from '../../api/platformConsole';
import { useAsync } from '../../state/useAsync';
import { ADMIN_GHOST, ADMIN_PRIMARY, Change, Empty, INPUT_BOX, PageTitle, Panel, Select } from '../../components/admin/kit';
import { Download, Search } from '../../components/icons';
import { useToast } from '../../state/ToastContext';
import { usePageTitle } from '../../state/usePageTitle';
import { cx } from '../../components/ui';
import { Avatar, FilterPills, Meter, SkeletonRows, StatusBadge, TD, TH, WeekBars, relTime, rupees } from './kit';

const PAGE_SIZE = 25;
const VIEWS: TenantView[] = ['all', 'active', 'trial', 'attention', 'closed'];
const SORTS: TenantSort[] = ['active', 'newest', 'name', 'revenue'];

const isBilling = (t: TenantListRow) => t.status === 'ACTIVE' || t.status === 'PAST_DUE' || t.status === 'RESTRICTED';

/** Every restaurant on the service, cut the way an operator asks about them: who is paying, who is on trial, who needs me. Filtering, sorting and paging all happen on the server. */
export function PlatformRestaurants() {
  usePageTitle('Restaurants · Platform admin');
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const rawView = params.get('status') as TenantView | null;
  const view: TenantView = rawView && VIEWS.includes(rawView) ? rawView : 'all';
  const plan = params.get('plan') ?? 'all';
  const rawSort = params.get('sort') as TenantSort | null;
  const sort: TenantSort = rawSort && SORTS.includes(rawSort) ? rawSort : 'active';
  const keyword = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  // Typing updates the box at once; the URL (and so the request) follows once the typing pauses.
  const [typed, setTyped] = useState(keyword);
  useEffect(() => setTyped(keyword), [keyword]);

  const setParam = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (typed === keyword) return;
    const id = window.setTimeout(() => setParam('q', typed, ''), 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  const list = useAsync(
    () => listTenantRows({ view, planKey: plan === 'all' ? undefined : plan, keyword, sort, page, pageSize: PAGE_SIZE }),
    [view, plan, keyword, sort, page],
  );
  const viewCounts = useAsync(countTenantViews, []);
  const plans = useAsync(listPlans, []);

  const rows = list.data?.rows ?? [];
  const total = list.data?.count ?? 0;
  const counts = viewCounts.data;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // A shrinking list can leave the URL pointing past the last page.
  useEffect(() => {
    if (list.data && page > lastPage) setParam('page', String(lastPage), '1');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, lastPage]);

  if (list.error instanceof ApiError && list.error.status === 401) {
    clearPlatformKey();
    return <Navigate to="/platform/signin" replace />;
  }

  const filtersOn = view !== 'all' || plan !== 'all' || keyword !== '' || typed !== '';

  return (
    <>
      <PageTitle
        title="Restaurants"
        subtitle={counts ? `${counts.all} on the platform · ${counts.active} paying · ${counts.trial} on trial` : 'Loading…'}
        action={
          <>
            <button type="button" className={ADMIN_GHOST} onClick={() => toast(`Exported ${total} restaurants to CSV.`, <Download size={16} />)}>
              <Download size={15} /> Export
            </button>
          </>
        }
      />

      <div className="mb-4 grid gap-3">
        <FilterPills
          label="Show"
          value={view}
          onChange={(v) => setParam('status', v, 'all')}
          options={[
            { value: 'all', label: 'All', count: counts?.all },
            { value: 'active', label: 'Paying', count: counts?.active },
            { value: 'trial', label: 'On trial', count: counts?.trial },
            { value: 'attention', label: 'Needs attention', count: counts?.attention },
            { value: 'closed', label: 'Closed', count: counts?.closed },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative block min-w-[200px] flex-1 sm:max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
            <input className={cx(INPUT_BOX, 'h-9 py-0 pl-8 text-[13.5px]')} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Filter this list" aria-label="Filter restaurants" />
          </label>
          <div className="w-36">
            <Select
              value={plan}
              onChange={(v) => setParam('plan', v, 'all')}
              options={[
                { value: 'all', label: 'Every plan' },
                ...(plans.data?.plans ?? []).map((p) => ({ value: p.key, label: p.name })),
              ]}
            />
          </div>
          <div className="w-44">
            <Select<TenantSort>
              value={sort}
              onChange={(v) => setParam('sort', v, 'active')}
              options={[
                { value: 'active', label: 'Recently active' },
                { value: 'newest', label: 'Newest first' },
                { value: 'revenue', label: 'Highest revenue' },
                { value: 'name', label: 'Name A–Z' },
              ]}
            />
          </div>
          {filtersOn && (
            <button type="button" className="h-9 px-2 text-[13px] font-semibold text-ink-3 hover:text-ink" onClick={() => { setTyped(''); setParams({}, { replace: true }); }}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      <Panel bare>
        {list.loading && !list.data ? (
          <SkeletonRows />
        ) : rows.length === 0 ? (
          <Empty
            emoji="🔎"
            title={!filtersOn ? 'No restaurants yet' : 'No restaurant matches'}
            message={!filtersOn ? 'Add the first restaurant and its owner. They get a sign-in and a printed QR in minutes.' : 'Try a different filter, or clear them all to see every restaurant.'}
            action={
              !filtersOn ? (
                <Link to="/platform/restaurants/new" className={ADMIN_PRIMARY}>
                  Add restaurant
                </Link>
              ) : (
                <button type="button" className={ADMIN_GHOST} onClick={() => { setTyped(''); setParams({}, { replace: true }); }}>
                  Clear filters
                </button>
              )
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] border-collapse text-[13.5px]">
                <thead>
                  <tr className="border-b border-hairline">
                    <th className={TH}>Restaurant</th>
                    <th className={TH}>Status</th>
                    <th className={TH}>Plan</th>
                    <th className={TH}>Seats and branches</th>
                    <th className={TH}>Orders, 8 weeks</th>
                    <th className={cx(TH, 'text-right')}>Revenue</th>
                    <th className={cx(TH, 'text-right')}>Last active</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <TenantRow key={t.id} t={t} onOpen={() => navigate(`/platform/restaurants/${t.id}`)} />
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden">
              {rows.map((t) => (
                <li key={t.id}>
                  <Link to={`/platform/restaurants/${t.id}`} className="flex items-start gap-3 border-b border-hairline px-4 py-3.5 last:border-0 active:bg-surface-2/60">
                    <Avatar name={t.name} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[14.5px] font-semibold">{t.name}</span>
                        <StatusBadge status={t.status} />
                      </span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">
                        {t.owner?.name ?? 'No owner'} · {t.planName} · active {relTime(t.lastActiveAt)}
                      </span>
                      <span className="mt-1 block text-[12.5px] text-ink-3 tnum">
                        {t.ordersThisMonth.toLocaleString()} orders · {isBilling(t) ? `${rupees(t.mrr)} / mo` : 'not billing'}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3 text-[13px] text-ink-3">
              <span className="tnum">
                {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + rows.length} of {total}
              </span>
              <span className="flex items-center gap-2">
                <button type="button" className={ADMIN_GHOST} disabled={page <= 1} onClick={() => setParam('page', String(page - 1), '1')}>
                  Previous
                </button>
                <button type="button" className={ADMIN_GHOST} disabled={page >= lastPage} onClick={() => setParam('page', String(page + 1), '1')}>
                  Next
                </button>
              </span>
            </div>
          </>
        )}
      </Panel>
    </>
  );
}

function TenantRow({ t, onOpen }: { t: TenantListRow; onOpen: () => void }) {
  const change = t.ordersLastMonth > 0 ? t.ordersThisMonth / t.ordersLastMonth - 1 : null;
  const closed = t.status === 'SUSPENDED' || t.status === 'CANCELLED';
  return (
    <tr onClick={onOpen} className="cursor-pointer border-b border-hairline transition-colors duration-150 last:border-0 hover:bg-surface-2/50">
      <td className={TD}>
        <div className="flex items-center gap-3">
          <Avatar name={t.name} />
          <div className="min-w-0">
            <Link to={`/platform/restaurants/${t.id}`} onClick={(e) => e.stopPropagation()} className="block truncate text-[14px] font-semibold hover:underline">
              {t.name}
            </Link>
            <div className="truncate text-[12.5px] text-ink-3">
              {t.owner?.name ?? 'No owner'}
            </div>
          </div>
        </div>
      </td>
      <td className={TD}>
        <StatusBadge status={t.status} />
      </td>
      <td className={TD}>
        <div className="font-semibold">{t.planName}</div>
        <div className="text-[12px] text-ink-4">{t.interval === 'ANNUAL' ? 'Yearly' : 'Monthly'}</div>
      </td>
      <td className={cx(TD, 'w-[190px]')}>
        <div className="grid gap-1.5">
          <Meter compactLabel label="Staff seats" used={t.seats} limit={t.seatLimit} />
          <div className="text-[12px] text-ink-4 tnum">
            {t.seats} seats · {t.branches} {t.branches === 1 ? 'branch' : 'branches'}
          </div>
        </div>
      </td>
      <td className={TD}>
        <div className="flex items-end gap-3">
          <WeekBars data={t.weekly} />
          <div>
            <div className="font-semibold tnum">{t.ordersThisMonth.toLocaleString()}</div>
            {change !== null && !closed && (
              <div className="text-[12px]">
                <Change value={change} />
              </div>
            )}
          </div>
        </div>
      </td>
      <td className={cx(TD, 'whitespace-nowrap text-right tnum')}>{isBilling(t) ? <span className="font-semibold">{rupees(t.mrr)}</span> : <span className="text-ink-4">—</span>}</td>
      <td className={cx(TD, 'whitespace-nowrap text-right text-ink-3 tnum')}>{relTime(t.lastActiveAt)}</td>
    </tr>
  );
}
