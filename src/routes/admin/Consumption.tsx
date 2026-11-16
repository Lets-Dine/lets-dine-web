import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchConsumption, fetchIngredients, formatQty, wasteLabel } from '../../api/inventory';
import type { ConsumptionEntry, ConsumptionSource } from '../../api/inventory';
import { formatMoney } from '../../domain/money';
import { useAsync } from '../../state/useAsync';
import { ADMIN_GHOST, DOCKET_CARD, DocketDaySection, DocketEmpty, Loading, PageTitle, Select } from '../../components/admin/kit';
import { DateRangePicker } from '../../components/admin/DateRangePicker';
import { ChevronLeft, ChevronRight, History } from '../../components/icons';
import { CHIP, CHIP_OFF, CHIP_ON, cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
] as const;
type Period = (typeof PERIODS)[number]['value'];
const DEFAULT_PERIOD: Period = '7';
const SIZES = ['20', '50'] as const;

const SOURCES: { value: ConsumptionSource | 'all'; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'order', label: 'Orders' },
  { value: 'manual', label: 'Manual use' },
  { value: 'waste', label: 'Waste' },
];
const DOT: Record<ConsumptionSource, string> = { order: 'bg-docket-mint', manual: 'bg-gold', waste: 'bg-docket-berry' };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fromIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/**
 * What left the stockroom, newest first: dishes the kitchen started, uses someone recorded, and waste. Filters live in the URL
 * (period, source, ingredient, page), so a filtered view can be shared or reloaded.
 */
export function Consumption() {
  const { menu } = useDashboard();
  const [params, setParams] = useSearchParams();
  const ingredients = useAsync(() => fetchIngredients(), []);

  const period = (PERIODS.find((p) => p.value === params.get('period'))?.value ?? DEFAULT_PERIOD) as Period;
  const source = (SOURCES.find((s) => s.value === params.get('source'))?.value ?? 'all') as ConsumptionSource | 'all';
  const ingredientId = params.get('ingredient') ?? '';
  const customFrom = params.get('from') ?? '';
  const customTo = params.get('to') ?? '';
  const size = Number(SIZES.find((s) => s === params.get('size')) ?? SIZES[0]);
  const page = Math.max(1, Number(params.get('page')) || 1);

  // Changing any filter returns to the first page; `page` is only kept when it is the thing being changed.
  const set = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        if (!('page' in patch)) next.delete('page');
        return next;
      },
      { replace: true },
    );

  const today = startOfDay(new Date());
  const range: { from?: Date; to?: Date } =
    period === 'today'
      ? { from: today }
      : period === '7'
        ? { from: addDays(today, -6) }
        : period === '30'
          ? { from: addDays(today, -29) }
          : period === 'custom'
            ? { from: customFrom ? fromIso(customFrom) : undefined, to: customTo ? addDays(fromIso(customTo), 1) : undefined }
            : {};

  const key = [period, customFrom, customTo, source, ingredientId, size, page].join('|');
  const feed = useAsync(
    () => fetchConsumption({ page, pageSize: size, source: source === 'all' ? undefined : source, ingredientId: ingredientId || undefined, ...range }),
    [key],
  );

  const data = feed.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = period !== DEFAULT_PERIOD || source !== 'all' || ingredientId !== '';
  const everything = data ? data.counts.order + data.counts.manual + data.counts.waste : 0;

  // A page past the end (a filter shrank the list, or a stale link) steps back to the last real one.
  const overshoot = !!data && page > pages;
  useEffect(() => {
    if (overshoot) set({ page: pages > 1 ? String(pages) : null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overshoot, pages]);

  const groups: { label: string; entries: ConsumptionEntry[] }[] = [];
  for (const entry of data?.items ?? []) {
    const label = dayLabel.format(new Date(entry.at));
    const last = groups[groups.length - 1];
    if (last?.label === label) last.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }

  const first = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = data ? Math.min(data.total, data.page * data.pageSize) : 0;

  return (
    <>
      <div className="animate-rise">
        <PageTitle title="Consumption" subtitle="Everything that left stock at this branch: dishes the kitchen started, uses someone recorded, and waste." />
      </div>

      <div className="animate-rise grid max-w-5xl gap-3 [animation-delay:80ms]">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p.value} type="button" aria-pressed={period === p.value} onClick={() => set({ period: p.value === DEFAULT_PERIOD ? null : p.value })} className={cx(CHIP, period === p.value ? CHIP_ON : CHIP_OFF)}>
              {p.label}
            </button>
          ))}
          {period === 'custom' && (
            <DateRangePicker className="w-60" from={customFrom} to={customTo} onChange={(f, t) => set({ from: f || null, to: t || null })} compact aria-label="Custom dates" />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Source">
          {SOURCES.map((s) => {
            const n = data ? (s.value === 'all' ? everything : data.counts[s.value]) : null;
            return (
              <button key={s.value} type="button" aria-pressed={source === s.value} onClick={() => set({ source: s.value === 'all' ? null : s.value })} className={cx(CHIP, source === s.value ? CHIP_ON : CHIP_OFF)}>
                {s.label}
                {n !== null && <span className="tnum opacity-70">{n}</span>}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={ingredientId}
            onChange={(v) => set({ ingredient: v || null })}
            options={[{ value: '', label: 'All ingredients' }, ...(ingredients.data ?? []).map((i) => ({ value: i.id, label: i.name }))]}
            aria-label="Ingredient"
            className="w-56"
          />
          {filtered && (
            <button type="button" className="text-[13px] font-semibold text-ink-3 underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-flame" onClick={() => setParams({}, { replace: true })}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className={cx('mt-7 max-w-5xl transition-opacity duration-200', feed.loading && data && 'opacity-60')}>
        {!data ? (
          feed.error ? (
            <p className="rounded-2xl bg-berry/10 px-4 py-3 text-[14px] text-berry ring-1 ring-berry/25 ring-inset">{feed.error.message}</p>
          ) : (
            <Loading />
          )
        ) : data.total === 0 ? (
          <DocketEmpty
            icon={<History size={26} className="text-docket-inksoft" />}
            title={filtered ? 'Nothing matches these filters' : 'No stock has been used yet'}
            message={filtered ? 'Try a longer period, or clear the filters.' : 'Stock used by orders, recorded by hand, or thrown away shows up here.'}
          />
        ) : (
          <>
            <div className="grid gap-4">
              {groups.map((group) => (
                <DocketDaySection key={group.label + group.entries[0].id} label={group.label} count={group.entries.length} itemLabel="entry">
                  {group.entries.map((entry) => (
                    <Row key={entry.id} entry={entry} currency={menu.restaurant.currency} />
                  ))}
                </DocketDaySection>
              ))}
            </div>

            <nav aria-label="Pages" className={cx(DOCKET_CARD, 'mt-4 flex flex-wrap items-center justify-between gap-3 px-5 py-3.5')}>
              <p className="text-[13px] text-docket-inksoft tnum">
                <span className="font-semibold text-docket-ink">
                  {first}–{last}
                </span>{' '}
                of {data.total}
              </p>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-[12.5px] text-docket-inksoft">
                  Per page
                  <Select value={String(size)} onChange={(v) => set({ size: v === SIZES[0] ? null : v })} options={SIZES.map((s) => ({ value: s, label: s }))} aria-label="Entries per page" className="w-20" />
                </label>
                <button type="button" className={cx(ADMIN_GHOST, 'h-9 px-3')} disabled={page <= 1} onClick={() => set({ page: page > 2 ? String(page - 1) : null })} aria-label="Previous page">
                  <ChevronLeft size={16} />
                </button>
                <span className="min-w-20 text-center text-[13px] font-semibold tnum">
                  {page} / {pages}
                </span>
                <button type="button" className={cx(ADMIN_GHOST, 'h-9 px-3')} disabled={page >= pages} onClick={() => set({ page: String(page + 1) })} aria-label="Next page">
                  <ChevronRight size={16} />
                </button>
              </div>
            </nav>
          </>
        )}
      </div>
    </>
  );
}

function Row({ entry, currency }: { entry: ConsumptionEntry; currency: string }) {
  const context =
    entry.source === 'order'
      ? `${entry.dishName ?? 'A dish'}${entry.portions ? ` × ${entry.portions}` : ''}`
      : entry.source === 'manual'
        ? [entry.dishName, entry.note].filter(Boolean).join(' · ') || 'No dish or note'
        : [`Thrown away (${wasteLabel(entry.wasteReason ?? 'OTHER').toLowerCase()})`, entry.note].filter(Boolean).join(' · ');

  return (
    <div className="flex items-start gap-3.5 border-t border-dashed border-docket-line px-6 py-4 first:border-t-0">
      <span className={cx('mt-2 size-2.5 shrink-0 rounded-full', DOT[entry.source])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-[14.5px]">
          <b className="font-semibold">{entry.ingredientName}</b>
          <span className={cx('text-[12px] font-semibold', TAG_TONE[entry.source])}>{SOURCE_WORD[entry.source]}</span>
        </p>
        <p className="mt-0.5 text-[13px] leading-snug text-docket-inksoft">{context}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[14.5px] font-semibold tnum">−{formatQty(entry.quantity, entry.unit)}</p>
        {entry.source === 'waste' && entry.wasteCost !== null && <p className="text-[12px] text-docket-berry tnum">{formatMoney(entry.wasteCost, currency)}</p>}
        <p className="mt-0.5 text-[11.5px] text-docket-inksoft tnum" title={new Date(entry.at).toLocaleString()}>
          {clock.format(new Date(entry.at))}
          {entry.byName && ` · ${entry.byName}`}
        </p>
      </div>
    </div>
  );
}

const SOURCE_WORD: Record<ConsumptionSource, string> = { order: 'Order', manual: 'Manual', waste: 'Waste' };
const TAG_TONE: Record<ConsumptionSource, string> = { order: 'text-docket-mint', manual: 'text-gold-ink', waste: 'text-docket-berry' };
