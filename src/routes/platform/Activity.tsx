import { useMemo, useState } from 'react';
import { listEvents } from '../../api/platformConsole';
import type { EventKind } from '../../api/platformConsole';
import { useAsync } from '../../state/useAsync';
import { Empty, INPUT_BOX, PageTitle, Panel } from '../../components/admin/kit';
import { Search } from '../../components/icons';
import { usePageTitle } from '../../state/usePageTitle';
import { cx } from '../../components/ui';
import { FilterPills, SkeletonRows } from './kit';
import { EventList, KIND_LABEL } from './EventList';

type Kind = EventKind | 'all';

/** The platform's own audit trail: everything an operator or the system did, newest first. */
export function PlatformActivity() {
  usePageTitle('Activity · Platform admin');
  const list = useAsync(listEvents, []);
  const [kind, setKind] = useState<Kind>('all');
  const [keyword, setKeyword] = useState('');

  const all = useMemo(() => list.data ?? [], [list.data]);
  const rows = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    return all.filter((e) => (kind === 'all' || e.kind === kind) && (!needle || [e.action, e.tenantName ?? '', e.detail ?? '', e.actor].some((v) => v.toLowerCase().includes(needle))));
  }, [all, kind, keyword]);

  const count = (k: Kind) => (k === 'all' ? all.length : all.filter((e) => e.kind === k).length);

  return (
    <>
      <PageTitle title="Activity" subtitle="Every change made on the platform, by whom, and when." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterPills<Kind>
          label="Type of activity"
          value={kind}
          onChange={setKind}
          options={[{ value: 'all', label: 'Everything', count: count('all') }, ...(Object.keys(KIND_LABEL) as EventKind[]).map((k) => ({ value: k, label: KIND_LABEL[k], count: count(k) }))]}
        />
        <label className="relative block w-full sm:w-64">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
          <input className={cx(INPUT_BOX, 'h-9 py-0 pl-8 text-[13.5px]')} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Search activity" aria-label="Search activity" />
        </label>
      </div>

      <Panel bare>
        {list.loading && !list.data ? <SkeletonRows /> : rows.length === 0 ? <Empty emoji="🗒️" title="Nothing matches" message="Try another type, or clear the search." /> : <EventList events={rows} />}
      </Panel>
    </>
  );
}
