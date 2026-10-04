import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { listPlans, savePlans } from '../../api/platformConsole';
import type { Plan } from '../../domain/subscription';
import { monthsFree } from '../../domain/subscription';
import { symbolFor } from '../../domain/money';
import type { Minor } from '../../domain/types';
import { useAsync } from '../../state/useAsync';
import { ADMIN_GHOST, ADMIN_PRIMARY, INPUT_BOX, Loading, PageTitle, Panel, useCommand } from '../../components/admin/kit';
import { usePageTitle } from '../../state/usePageTitle';
import { cx } from '../../components/ui';

/**
 * The plan catalogue as one comparison table, edited in place. Plans are
 * compared far more than they are read one at a time, so the columns are the
 * plans and each row is one decision: a price, a limit, a feature.
 */
export function PlatformPlans() {
  usePageTitle('Plans · Platform admin');
  const data = useAsync(listPlans, []);
  const { busy, run } = useCommand();
  const [draft, setDraft] = useState<Plan[] | null>(null);

  useEffect(() => {
    if (data.data) setDraft(structuredClone(data.data.plans));
  }, [data.data]);

  const dirty = useMemo(() => !!draft && !!data.data && JSON.stringify(draft) !== JSON.stringify(data.data.plans), [draft, data.data]);

  if (!draft || !data.data) return <Loading label="Loading plans…" />;
  const counts = data.data.counts;

  const patch = (index: number, change: (p: Plan) => Plan) => setDraft((d) => d && d.map((p, i) => (i === index ? change(structuredClone(p)) : p)));

  const priceChanges = draft
    .map((p, i) => ({ p, before: data.data!.plans[i] }))
    .filter(({ p, before }) => p.monthlyPrice !== before.monthlyPrice || p.annualPrice !== before.annualPrice)
    .map(({ p }) => `${p.name} (${counts[p.key] ?? 0})`);

  return (
    <>
      <PageTitle title="Plans" subtitle="What each plan costs and includes. Leave a limit empty for unlimited." />

      <Panel bare>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[13.5px]">
            <thead>
              <tr className="border-b border-hairline">
                <th className="w-[210px] px-5 py-3.5 text-left" scope="col">
                  <span className="sr-only">Setting</span>
                </th>
                {draft.map((p, i) => (
                  <th key={p.key} scope="col" className="px-3 py-3.5 text-left align-bottom">
                    <input
                      aria-label={`Name of the ${p.key} plan`}
                      className="w-full bg-transparent font-display text-[20px] font-bold tracking-tight outline-none focus:underline focus:decoration-flame-2/60 focus:underline-offset-4"
                      value={p.name}
                      maxLength={24}
                      onChange={(e) => patch(i, (x) => ({ ...x, name: e.target.value }))}
                    />
                    <div className="mt-0.5 text-[12px] font-normal text-ink-3">
                      {counts[p.key] ?? 0} {(counts[p.key] ?? 0) === 1 ? 'restaurant' : 'restaurants'}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Group label="Price" />
              <Line plans={draft} label="Monthly" hint="Per restaurant">
                {(p, i) => <PriceCell value={p.monthlyPrice} onChange={(v) => patch(i, (x) => ({ ...x, monthlyPrice: v }))} />}
              </Line>
              <Line plans={draft} label="Yearly" hint="Billed once a year">
                {(p, i) => (
                  <div>
                    <PriceCell value={p.annualPrice} onChange={(v) => patch(i, (x) => ({ ...x, annualPrice: v }))} />
                    {monthsFree(p) > 0 && <div className="mt-1 text-[11.5px] font-semibold text-mint-ink">{monthsFree(p)} months free</div>}
                  </div>
                )}
              </Line>
              <Line plans={draft} label="Extra branch" hint="Per month. Empty means not offered">
                {(p, i) => <PriceCell value={p.extraBranchPrice} onChange={(v) => patch(i, (x) => ({ ...x, extraBranchPrice: v }))} />}
              </Line>
              <Line plans={draft} label="Extra staff seat" hint="Per month. Empty means not offered">
                {(p, i) => <PriceCell value={p.extraSeatPrice} onChange={(v) => patch(i, (x) => ({ ...x, extraSeatPrice: v }))} />}
              </Line>

              <Group label="Limits" />
              <Line plans={draft} label="Branches">{(p, i) => <LimitCell value={p.limits.branches} onChange={(v) => patch(i, (x) => ({ ...x, limits: { ...x.limits, branches: v } }))} />}</Line>
              <Line plans={draft} label="Staff seats">{(p, i) => <LimitCell value={p.limits.staffSeats} onChange={(v) => patch(i, (x) => ({ ...x, limits: { ...x.limits, staffSeats: v } }))} />}</Line>
              <Line plans={draft} label="Orders a month" hint="Never blocks service">
                {(p, i) => <LimitCell value={p.limits.ordersPerMonth} onChange={(v) => patch(i, (x) => ({ ...x, limits: { ...x.limits, ordersPerMonth: v } }))} />}
              </Line>

              <Group label="Features" />
              <Line plans={draft} label="Analytics">
                {(p, i) => (
                  <select
                    aria-label={`Analytics for ${p.name}`}
                    className={cx(INPUT_BOX, 'h-9 cursor-pointer py-0 text-[13.5px]')}
                    value={p.features.analyticsTier}
                    onChange={(e) => patch(i, (x) => ({ ...x, features: { ...x.features, analyticsTier: e.target.value as 'basic' | 'full' } }))}
                  >
                    <option value="basic">Basic</option>
                    <option value="full">Full</option>
                  </select>
                )}
              </Line>
              <Line plans={draft} label="Data exports">
                {(p, i) => (
                  <label className="inline-flex cursor-pointer items-center gap-2.5">
                    <input type="checkbox" className="size-4 accent-[var(--color-flame-2)]" checked={p.features.exports} onChange={(e) => patch(i, (x) => ({ ...x, features: { ...x.features, exports: e.target.checked } }))} />
                    <span className="text-ink-2">{p.features.exports ? 'Included' : 'Not included'}</span>
                  </label>
                )}
              </Line>
              <Line plans={draft} label="Audit history" hint="Days kept. Empty keeps all">
                {(p, i) => <LimitCell unit="days" value={p.features.auditRetentionDays} onChange={(v) => patch(i, (x) => ({ ...x, features: { ...x.features, auditRetentionDays: v } }))} />}
              </Line>
            </tbody>
          </table>
        </div>
      </Panel>

      <p className="mt-3 max-w-[70ch] px-1 text-[12.5px] leading-relaxed text-ink-4">
        New prices apply when a restaurant next renews. Anyone mid-period keeps what they signed up at, and a limit you lower never switches anything off — restaurants over a limit are flagged to you instead.
      </p>

      {dirty && (
        <div className="sticky bottom-4 z-30 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3 shadow-deep ring-1 ring-hairline-strong ring-inset" role="region" aria-label="Unsaved plan changes">
          <p className="text-[13.5px]">
            <span className="font-semibold">Unsaved changes.</span>{' '}
            <span className="text-ink-3">{priceChanges.length > 0 ? `Price change reaches ${priceChanges.join(', ')} at renewal.` : 'Limits and features apply immediately.'}</span>
          </p>
          <div className="flex gap-2">
            <button type="button" className={ADMIN_GHOST} disabled={busy} onClick={() => setDraft(structuredClone(data.data!.plans))}>
              Discard
            </button>
            <button type="button" className={ADMIN_PRIMARY} disabled={busy} onClick={() => void run('save', () => savePlans(draft), 'Plans saved.').then((ok) => ok && data.reload())}>
              {busy ? 'Saving…' : 'Save plans'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Group({ label }: { label: string }) {
  return (
    <tr>
      <th colSpan={4} scope="colgroup" className="bg-surface-2/40 px-5 py-2 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-ink-4">
        {label}
      </th>
    </tr>
  );
}

function Line({ plans, label, hint, children }: { plans: Plan[]; label: string; hint?: string; children: (plan: Plan, index: number) => ReactNode }) {
  return (
    <tr className="border-b border-hairline last:border-0">
      <th scope="row" className="px-5 py-3 text-left align-middle font-semibold">
        {label}
        {hint && <span className="mt-0.5 block text-[12px] font-normal text-ink-4">{hint}</span>}
      </th>
      {plans.map((p, i) => (
        <td key={p.key} className="px-3 py-3 align-middle">
          {children(p, i)}
        </td>
      ))}
    </tr>
  );
}

function PriceCell({ value, onChange }: { value: Minor | null; onChange: (v: Minor | null) => void }) {
  const [text, setText] = useState(value === null ? '' : String(value / 100));
  useEffect(() => setText(value === null ? '' : String(value / 100)), [value]);
  return (
    <span className="relative block max-w-[150px]">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13px] font-semibold text-ink-4">{symbolFor('NPR')}</span>
      <input
        aria-label="Price"
        className={cx(INPUT_BOX, 'h-9 py-0 pl-11 text-[13.5px] tnum')}
        inputMode="numeric"
        value={text}
        placeholder="Not offered"
        onChange={(e) => {
          const next = e.target.value.replace(/[^0-9]/g, '');
          setText(next);
          onChange(next === '' ? null : Number(next) * 100);
        }}
      />
    </span>
  );
}

function LimitCell({ value, onChange, unit }: { value: number | undefined; onChange: (v: number | undefined) => void; unit?: string }) {
  return (
    <span className="relative block max-w-[150px]">
      <input
        aria-label="Limit"
        className={cx(INPUT_BOX, 'h-9 py-0 text-[13.5px] tnum', unit && 'pr-12')}
        inputMode="numeric"
        value={value === undefined ? '' : String(value)}
        placeholder="Unlimited"
        onChange={(e) => {
          const next = e.target.value.replace(/[^0-9]/g, '');
          onChange(next === '' ? undefined : Number(next));
        }}
      />
      {unit && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] text-ink-4">{unit}</span>}
    </span>
  );
}
