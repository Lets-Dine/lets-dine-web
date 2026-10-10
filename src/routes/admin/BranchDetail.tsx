import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { INVENTORY_ENABLED } from '../../api/inventory';
import { AutoConsumeChoice, AutoConsumeLockedNote } from '../../components/admin/AutoConsumeChoice';
import { planAllowsAutoStock } from '../../domain/subscription';
import { useSubscription } from '../../state/SubscriptionContext';
import { copyBranchMenu, fetchBranch, listBranches, setBranchHours, updateBranch } from '../../api/staff';
import type { Branch, BranchHours } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import {
  ADMIN_GHOST,
  ADMIN_PRIMARY,
  ADMIN_TINY,
  Field,
  INPUT_BOX,
  Loading,
  PageTitle,
  Panel,
  PercentInput,
  Select,
  TextInput,
  Toggle,
  useCommand,
} from '../../components/admin/kit';
import { ChevronLeft } from '../../components/icons';
import { cx } from '../../components/ui';

/** One branch: its details and fee overrides, its weekly hours, and a way into its own menu. */
export function BranchDetail() {
  const { branchId = '' } = useParams();
  const staff = useStaff();
  const { allows } = useAuth();
  const branch = useAsync(() => fetchBranch(branchId), [branchId, staff]);

  const canEdit = allows('settings:edit');

  return (
    <>
      <Link to="/admin/branches" className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-ink">
        <ChevronLeft size={15} /> Branches
      </Link>

      {!branch.data ? (
        branch.error ? (
          <p className="rounded-2xl bg-berry/10 px-4 py-3 text-[14px] text-berry ring-1 ring-berry/25 ring-inset">{branch.error.message}</p>
        ) : (
          <Loading />
        )
      ) : (
        <>
          <PageTitle title={branch.data.name} subtitle={branch.data.isDefault ? 'The main branch' : branch.data.address || undefined} />
          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr] lg:items-start">
            <div className="grid gap-4">
              <DetailsPanel key={`${branch.data.id}:${branch.data.hours?.length}`} branch={branch.data} canEdit={canEdit} onSaved={branch.reload} />
              <HoursPanel branch={branch.data} canEdit={canEdit} onSaved={branch.reload} />
            </div>
            <MenuPanel branch={branch.data} canEdit={canEdit} />
          </div>
        </>
      )}
    </>
  );
}

/* ── Details & fee overrides ──────────────────────────────────────── */

const toPercent = (rate: number | null) => (rate === null ? '' : (rate * 100).toFixed(1));
const fromPercent = (text: string) => (text.trim() === '' ? null : Number(text) / 100);
const toMajor = (minor: number | null) => (minor === null ? '' : (minor / 100).toFixed(2));
const fromMajor = (text: string) => (text.trim() === '' ? null : Math.round(Number(text) * 100));

function DetailsPanel({ branch, canEdit, onSaved }: { branch: Branch; canEdit: boolean; onSaved: () => void }) {
  const { refreshBranches } = useAuth();
  const { pending, busy, run } = useCommand();
  const [name, setName] = useState(branch.name);
  const [address, setAddress] = useState(branch.address);
  const [phone, setPhone] = useState(branch.phone ?? '');
  const [timezone, setTimezone] = useState(branch.timezone);
  const [service, setService] = useState(toPercent(branch.serviceChargeRate));
  const [tax, setTax] = useState(toPercent(branch.taxRate));
  const [delivery, setDelivery] = useState(toMajor(branch.deliveryFeeAmount));
  const [autoConsume, setAutoConsume] = useState<boolean | null>(branch.autoConsumeStock ?? null);
  const planAllowsStockUse = planAllowsAutoStock(useSubscription().subscription);
  const [active, setActive] = useState(branch.isActive);

  const save = () =>
    void run(
      'details',
      () =>
        updateBranch(branch.id, {
          name,
          address,
          phone,
          timezone,
          serviceChargeRate: fromPercent(service),
          taxRate: fromPercent(tax),
          deliveryFeeAmount: fromMajor(delivery),
          ...(INVENTORY_ENABLED && planAllowsStockUse && { autoConsumeStock: autoConsume }),
          ...(branch.isDefault ? {} : { isActive: active }),
        }),
      'Branch saved',
    ).then((ok) => {
      if (!ok) return;
      onSaved();
      // A rename or a disable changes what the switcher offers.
      void refreshBranches();
    });

  return (
    <Panel title="Details" hint={canEdit ? undefined : 'Only an owner can change these'}>
      <fieldset disabled={!canEdit} className="grid gap-4 disabled:opacity-60">
        <Field label="Name">
          <TextInput value={name} onChange={setName} maxLength={60} />
        </Field>
        <Field label="Address">
          <TextInput value={address} onChange={setAddress} maxLength={200} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <TextInput value={phone} onChange={setPhone} maxLength={30} />
          </Field>
          <Field label="Timezone" hint="Opening hours are read in this zone.">
            <TextInput value={timezone} onChange={setTimezone} maxLength={60} />
          </Field>
        </div>
        <div>
          <p className="mb-2 text-[12.5px] leading-snug text-ink-3">
            Fees here replace the restaurant's for this branch only. Leave one empty to use the restaurant's own.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Service charge">
              <PercentInput value={service} onChange={setService} />
            </Field>
            <Field label="Tax">
              <PercentInput value={tax} onChange={setTax} />
            </Field>
            <Field label="Delivery fee">
              <TextInput value={delivery} onChange={(next) => setDelivery(next.replace(/[^0-9.]/g, ''))} placeholder="Restaurant's" />
            </Field>
          </div>
        </div>
        {INVENTORY_ENABLED && (
          <div>
            <p className="mb-2 text-[12.5px] leading-snug text-ink-3">
              Whether starting a dish takes its recipe off this branch's stock. A dish can still override it.
            </p>
            {planAllowsStockUse ? <AutoConsumeChoice value={autoConsume} onChange={setAutoConsume} inheritLabel="Restaurant setting" /> : <AutoConsumeLockedNote />}
          </div>
        )}
        <Toggle
          checked={active}
          onChange={setActive}
          disabled={branch.isDefault}
          label="Taking orders"
          hint={branch.isDefault ? 'The main branch cannot be disabled.' : 'Switch off to close this branch to diners and staff.'}
        />
        <button type="button" className={ADMIN_PRIMARY} disabled={busy || name.trim().length < 2} onClick={save}>
          {pending === 'details' ? 'Saving…' : 'Save changes'}
        </button>
      </fieldset>
    </Panel>
  );
}

/* ── Weekly hours ─────────────────────────────────────────────────── */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAX_RANGES = 3;
const MIDNIGHT = '24:00';

interface Range {
  opensAt: string;
  closesAt: string;
}

function toRanges(hours: BranchHours[] | undefined): Range[][] {
  const days: Range[][] = DAYS.map(() => []);
  for (const row of hours ?? []) if (!row.isClosed) days[row.dayOfWeek].push({ opensAt: row.opensAt, closesAt: row.closesAt });
  return days;
}

function HoursPanel({ branch, canEdit, onSaved }: { branch: Branch; canEdit: boolean; onSaved: () => void }) {
  const { pending, busy, run } = useCommand();
  const [days, setDays] = useState<Range[][]>(() => toRanges(branch.hours));
  const [error, setError] = useState('');

  const edit = (day: number, next: Range[]) => setDays((prev) => prev.map((ranges, index) => (index === day ? next : ranges)));
  const scheduled = days.some((ranges) => ranges.length > 0);

  const save = () => {
    const bad = days.some((ranges) => ranges.some((range) => !range.opensAt || !range.closesAt || range.opensAt >= range.closesAt));
    if (bad) {
      setError('Every range needs an opening time before its closing time. A range past midnight is two: until midnight, then from 00:00.');
      return;
    }
    setError('');
    const hours: BranchHours[] = days.flatMap((ranges, dayOfWeek) => ranges.map((range) => ({ dayOfWeek, ...range, isClosed: false })));
    void run('hours', () => setBranchHours(branch.id, hours), 'Hours saved').then((ok) => ok && onSaved());
  };

  return (
    <Panel title="Opening hours" hint="Outside these hours the branch takes no orders. Leave every day empty to be open at all times.">
      <fieldset disabled={!canEdit} className="grid gap-3 disabled:opacity-60">
        {DAYS.map((label, day) => (
          <div key={label} className="grid gap-2 sm:grid-cols-[96px_1fr] sm:items-start">
            <span className="pt-2 text-[13.5px] font-semibold">{label}</span>
            <div className="grid gap-2">
              {days[day].length === 0 && <span className="pt-2 text-[13px] text-ink-4">{scheduled ? 'Closed' : 'Open all day'}</span>}
              {days[day].map((range, index) => {
                const untilMidnight = range.closesAt === MIDNIGHT;
                return (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <input
                      type="time"
                      aria-label={`${label} opens`}
                      className={cx(INPUT_BOX, 'w-[116px] tnum')}
                      value={range.opensAt}
                      onChange={(e) => edit(day, days[day].map((r, i) => (i === index ? { ...r, opensAt: e.target.value } : r)))}
                    />
                    <span className="text-ink-4">to</span>
                    {untilMidnight ? (
                      <span className="w-[116px] px-3.5 text-[14px] text-ink-3">Midnight</span>
                    ) : (
                      <input
                        type="time"
                        aria-label={`${label} closes`}
                        className={cx(INPUT_BOX, 'w-[116px] tnum')}
                        value={range.closesAt}
                        onChange={(e) => edit(day, days[day].map((r, i) => (i === index ? { ...r, closesAt: e.target.value } : r)))}
                      />
                    )}
                    <label className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
                      <input
                        type="checkbox"
                        checked={untilMidnight}
                        onChange={(e) => edit(day, days[day].map((r, i) => (i === index ? { ...r, closesAt: e.target.checked ? MIDNIGHT : '' } : r)))}
                      />
                      Until midnight
                    </label>
                    <button type="button" className={cx(ADMIN_TINY, 'text-ink-3 hover:text-ink')} onClick={() => edit(day, days[day].filter((_, i) => i !== index))}>
                      Remove
                    </button>
                  </div>
                );
              })}
              {days[day].length < MAX_RANGES && (
                <button
                  type="button"
                  className={cx(ADMIN_TINY, 'w-fit bg-surface-2 text-ink-3 ring-1 ring-hairline ring-inset')}
                  onClick={() => edit(day, [...days[day], { opensAt: '10:00', closesAt: '22:00' }])}
                >
                  {days[day].length === 0 ? 'Add hours' : 'Add a range'}
                </button>
              )}
            </div>
          </div>
        ))}
        {error && (
          <p role="alert" className="rounded-xl bg-berry/10 px-3.5 py-2.5 text-[13px] text-berry ring-1 ring-berry/25 ring-inset">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={ADMIN_PRIMARY} disabled={busy} onClick={save}>
            {pending === 'hours' ? 'Saving…' : 'Save hours'}
          </button>
          <button type="button" className={ADMIN_GHOST} disabled={busy || !scheduled} onClick={() => setDays(DAYS.map(() => []))}>
            Open at all times
          </button>
        </div>
      </fieldset>
    </Panel>
  );
}

/* ── Menu ─────────────────────────────────────────────────────────── */

/**
 * Every branch has its own menu — its dishes, sections, add-ons and prices — so there is nothing to
 * "override" here. The menu is edited from the Menu page while working in the branch; this panel points
 * there, and offers the one thing that does belong on the branch itself: starting an empty menu as a copy.
 */
function MenuPanel({ branch, canEdit }: { branch: Branch; canEdit: boolean }) {
  const { staff, switchBranch } = useAuth();
  const navigate = useNavigate();
  const { pending, busy, run } = useCommand();
  const others = useAsync(() => listBranches(), [staff]);
  const [copyFrom, setCopyFrom] = useState('');

  const sources = (others.data ?? []).filter((candidate) => candidate.id !== branch.id);
  const here = staff?.branchId === branch.id;
  const reachable = (staff?.branches ?? []).some((candidate) => candidate.id === branch.id);

  return (
    <Panel title="Menu" hint="This branch has its own menu. Changes here never affect another branch.">
      <div className="grid gap-4">
        {here ? (
          <Link to="/admin/menu" className={ADMIN_PRIMARY}>
            Edit this branch's menu
          </Link>
        ) : reachable ? (
          <button
            type="button"
            className={ADMIN_PRIMARY}
            disabled={busy}
            onClick={() => void run('switch', async () => { await switchBranch(branch.id); navigate('/admin/menu'); })}
          >
            {pending === 'switch' ? 'Switching…' : `Switch to ${branch.name} and edit its menu`}
          </button>
        ) : null}

        {canEdit && sources.length > 0 && (
          <div className="grid gap-3 border-t border-hairline pt-4">
            <Field label="Copy a menu into this branch" hint="Only works while this branch's menu is empty. It is a one-off copy of the sections, dishes, variants and add-ons.">
              <Select
                value={copyFrom}
                onChange={setCopyFrom}
                options={[{ value: '', label: 'Choose a branch…' }, ...sources.map((candidate) => ({ value: candidate.id, label: candidate.name }))]}
              />
            </Field>
            <button
              type="button"
              className={ADMIN_GHOST}
              disabled={busy || !copyFrom}
              onClick={() =>
                void run('copy', async () => {
                  const result = await copyBranchMenu(branch.id, copyFrom);
                  setCopyFrom('');
                  return result;
                }, 'Menu copied')
              }
            >
              {pending === 'copy' ? 'Copying…' : 'Copy menu'}
            </button>
          </div>
        )}
      </div>
    </Panel>
  );
}
