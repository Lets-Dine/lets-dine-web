import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { INVENTORY_ENABLED } from '../../api/inventory';
import { AutoConsumeChoice, AutoConsumeLockedNote } from '../../components/admin/AutoConsumeChoice';
import { feeSummary } from '../../domain/branchFees';
import { planAllowsAutoStock } from '../../domain/subscription';
import { useSubscription } from '../../state/SubscriptionContext';
import { copyBranchMenu, fetchBranch, listBranches, setBranchHours, updateBranch } from '../../api/staff';
import type { Branch, BranchHours, KitchenStation } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import {
  ADMIN_GHOST,
  ADMIN_PRIMARY,
  ADMIN_TINY,
  Field,
  INPUT_BOX,
  Loading,
  PercentInput,
  Select,
  TextInput,
  Toggle,
  useCommand,
} from '../../components/admin/kit';
import { BranchAddressMap } from '../../components/admin/BranchAddressMap';
import { Check, ChevronLeft } from '../../components/icons';
import { reduced } from '../../components/admin/profile';
import { FOOT_PRIMARY, SHEET_FOOT, Sheet } from '../../components/admin/Sheet';
import { SheetHeader } from '../../components/admin/delivery';
import { DISPLAY, cx } from '../../components/ui';

/** One branch: its details and fee overrides, its weekly hours, and a way into its own menu. */
export function BranchDetail() {
  const { branchId = '' } = useParams();
  const staff = useStaff();
  const { allows } = useAuth();
  const branch = useAsync(() => fetchBranch(branchId), [branchId, staff]);

  return (
    <>
      {!branch.data ? (
        branch.error ? (
          <p className="rounded-2xl bg-berry/10 px-4 py-3 text-[14px] text-berry ring-1 ring-berry/25 ring-inset">{branch.error.message}</p>
        ) : (
          <Loading />
        )
      ) : (
        <BranchEditor key={`${branch.data.id}:${branch.data.hours?.length}`} branch={branch.data} canEdit={allows('settings:edit')} onSaved={branch.reload} />
      )}
    </>
  );
}

/** Flat section, as on the dish page: a heading, a hairline above, no card. */
function Section({ id, title, hint, action, children }: { id: string; title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} data-section className="scroll-mt-24 border-t border-hairline py-10 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className={cx(DISPLAY, 'text-[26px]')}>{title}</h2>
          {hint && <p className="mt-1.5 max-w-[56ch] text-[14px] leading-relaxed text-ink-3">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="mt-7">{children}</div>
    </section>
  );
}

/* ── Details & fee overrides ──────────────────────────────────────── */

const toPercent = (rate: number | null) => (rate === null ? '' : (rate * 100).toFixed(1));
const fromPercent = (text: string) => (text.trim() === '' ? null : Number(text) / 100);
const toMajor = (minor: number | null) => (minor === null ? '' : (minor / 100).toFixed(2));
const fromMajor = (text: string) => (text.trim() === '' ? null : Math.round(Number(text) * 100));

const initialOf = (branch: Branch) => ({
  name: branch.name,
  address: branch.address,
  latitude: branch.latitude,
  longitude: branch.longitude,
  phone: branch.phone ?? '',
  timezone: branch.timezone,
  service: toPercent(branch.serviceChargeRate),
  tax: toPercent(branch.taxRate),
  delivery: toMajor(branch.deliveryFeeAmount),
  autoConsume: (branch.autoConsumeStock ?? null) as boolean | null,
  active: branch.isActive,
  ack: (branch.ackStations ?? []) as KitchenStation[],
});
const norm = (form: ReturnType<typeof initialOf>) => JSON.stringify({ ...form, ack: [...form.ack].sort() });

/**
 * The whole page, laid out like the dish editor: the branch's name editable in a masthead, a rail that
 * follows you down the sections, and one floating save bar for everything except the hours (their own call).
 */
function BranchEditor({ branch, canEdit, onSaved }: { branch: Branch; canEdit: boolean; onSaved: () => void }) {
  const { staff, refreshBranches } = useAuth();
  const { busy, run } = useCommand();
  const [form, setForm] = useState(() => initialOf(branch));
  const [justSaved, setJustSaved] = useState(false);
  const [active, setActive] = useState('basics');
  const saveRef = useRef<() => void>(() => {});
  const planAllowsStockUse = planAllowsAutoStock(useSubscription().subscription);
  const set = <K extends keyof typeof form>(key: K) => (value: (typeof form)[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const toggleStation = (station: KitchenStation, on: boolean) =>
    setForm((prev) => ({ ...prev, ack: on ? [...prev.ack.filter((x) => x !== station), station] : prev.ack.filter((x) => x !== station) }));

  const sections = [
    { id: 'basics', label: 'Basics' },
    { id: 'fees', label: 'Fees' },
    { id: 'kitchen', label: 'Kitchen' },
    { id: 'hours', label: 'Hours' },
    { id: 'menu', label: 'Menu' },
  ];

  // Scroll-spy: the rail highlights whichever section is crossing the upper third of the screen.
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>('[data-section]')];
    if (els.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: '-25% 0px -65% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // ⌘S / Ctrl+S saves, as in any editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const dirty = norm(form) !== norm(initialOf(branch));
  const canSave = canEdit && dirty && form.name.trim().length >= 2 && !busy;

  const save = () => {
    if (!canSave) return;
    void run('details', () =>
      updateBranch(branch.id, {
        name: form.name,
        address: form.address,
        latitude: form.latitude,
        longitude: form.longitude,
        phone: form.phone,
        timezone: form.timezone,
        serviceChargeRate: fromPercent(form.service),
        taxRate: fromPercent(form.tax),
        deliveryFeeAmount: fromMajor(form.delivery),
        ackStations: form.ack,
        ...(INVENTORY_ENABLED && planAllowsStockUse && { autoConsumeStock: form.autoConsume }),
        ...(branch.isDefault ? {} : { isActive: form.active }),
      }),
    ).then((ok) => {
      if (!ok) return;
      onSaved();
      // A rename or a disable changes what the switcher offers.
      void refreshBranches();
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 1800);
    });
  };
  saveRef.current = save;

  const goTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  const here = staff?.branchId === branch.id;
  const state = !branch.isActive ? 'Closed to orders' : 'Taking orders';
  const hue = [...(form.name || '?')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 40);

  return (
    <div className="w-full pb-28">
      <Link to="/admin/branches" className="mb-6 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 transition-colors hover:text-ink">
        <ChevronLeft size={15} /> Branches
      </Link>

      {/* ── Masthead: the branch as it reads in the switcher, name editable in place ── */}
      <header className="mb-10 flex animate-rise items-center gap-5 sm:gap-7">
        <div
          aria-hidden
          className="grid size-20 shrink-0 place-items-center rounded-3xl font-display text-4xl font-bold sm:size-28 sm:text-5xl"
          style={{
            background: `linear-gradient(145deg, oklch(0.9 0.085 ${hue}), oklch(0.8 0.12 ${(hue + 28) % 360}))`,
            color: `oklch(0.32 0.08 ${hue})`,
          }}
        >
          {(form.name.trim()[0] ?? '?').toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="branch-name">
            Branch name
          </label>
          <input
            id="branch-name"
            value={form.name}
            maxLength={60}
            disabled={!canEdit}
            placeholder="Name this branch"
            onChange={(e) => set('name')(e.target.value)}
            className={cx(
              DISPLAY,
              'w-full border-b border-transparent bg-transparent pb-1 text-[clamp(28px,5vw,46px)] tracking-[-0.02em] outline-none transition-colors duration-200 placeholder:text-ink-4 enabled:hover:border-hairline-strong enabled:focus:border-flame-2',
            )}
          />
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-ink-3">
            <span className="inline-flex items-center gap-2">
              <span className={cx('size-2 rounded-full', branch.isActive ? 'bg-mint' : 'bg-ink-4')} aria-hidden />
              {state}
            </span>
            {branch.isDefault && <span>Main branch</span>}
            {here && <span className="font-semibold text-flame-2">Working here</span>}
            <span>{feeSummary(branch)}</span>
          </p>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-14 lg:grid-cols-[9.5rem_minmax(0,1fr)]">
        {/* ── Rail: where you are, and a way to jump ── */}
        <nav aria-label="Sections" className="min-w-0 -mx-4 mb-6 px-4 sm:-mx-6 sm:px-6 lg:sticky lg:top-24 lg:z-20 lg:mx-0 lg:mb-0 lg:self-start lg:p-0">
          <ul className="no-scrollbar flex gap-1 overflow-x-auto py-2 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:py-0">
            {sections.map((x) => (
              <li key={x.id} className="shrink-0">
                <button
                  type="button"
                  aria-current={active === x.id ? 'true' : undefined}
                  onClick={() => goTo(x.id)}
                  className={cx(
                    'relative flex h-9 w-full items-center whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-semibold transition-colors duration-200 lg:rounded-xl lg:pl-4',
                    active === x.id ? 'bg-surface-2 text-ink' : 'text-ink-3 hover:text-ink',
                  )}
                >
                  <span
                    aria-hidden
                    className={cx(
                      'absolute left-0 hidden h-4 w-0.5 rounded-full bg-flame transition-[opacity,scale] duration-300 ease-spring lg:block',
                      active === x.id ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0',
                    )}
                  />
                  {x.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          <fieldset disabled={!canEdit} className="contents">
            <Section id="basics" title="Basics" hint={canEdit ? 'Where this location is and whether it is taking orders.' : 'Only an owner can change these.'}>
              <div className="grid gap-6">
                <Field label="Address">
                  <TextInput value={form.address} onChange={set('address')} maxLength={200} />
                </Field>
                <BranchAddressMap
                  pin={form.latitude != null && form.longitude != null ? { lat: form.latitude, lng: form.longitude } : null}
                  onPick={({ lat, lng }) => setForm((prev) => ({ ...prev, latitude: lat, longitude: lng }))}
                  onAddress={set('address')}
                />
                <div className="grid gap-6 sm:grid-cols-2">
                  <Field label="Phone">
                    <TextInput value={form.phone} onChange={set('phone')} maxLength={30} />
                  </Field>
                  <Field label="Timezone" hint="Opening hours are read in this zone.">
                    <TextInput value={form.timezone} onChange={set('timezone')} maxLength={60} />
                  </Field>
                </div>
                <Toggle
                  checked={form.active}
                  onChange={set('active')}
                  disabled={branch.isDefault}
                  label="Taking orders"
                  hint={branch.isDefault ? 'The main branch cannot be disabled.' : 'Switch off to close this branch to diners and staff.'}
                />
              </div>
            </Section>

            <Section id="fees" title="Fees" hint="Fees here replace the restaurant's for this branch only. Leave one empty to use the restaurant's own.">
              <div className="grid gap-6 sm:grid-cols-3">
                <Field label="Service charge">
                  <PercentInput value={form.service} onChange={set('service')} />
                </Field>
                <Field label="Tax">
                  <PercentInput value={form.tax} onChange={set('tax')} />
                </Field>
                <Field label="Delivery fee">
                  <TextInput value={form.delivery} onChange={(next) => set('delivery')(next.replace(/[^0-9.]/g, ''))} placeholder="Restaurant's" />
                </Field>
              </div>
            </Section>

            <Section id="kitchen" title="Kitchen" hint="How tickets reach the kitchen, and whether dishes draw down this branch's stock.">
              <div className="grid gap-8">
                {INVENTORY_ENABLED && (
                  <div>
                    <p className="mb-3 text-[13.5px] leading-snug text-ink-3">Whether starting a dish takes its recipe off this branch's stock. A dish can still override it.</p>
                    {planAllowsStockUse ? (
                      <AutoConsumeChoice value={form.autoConsume} onChange={set('autoConsume')} inheritLabel="Restaurant setting" />
                    ) : (
                      <AutoConsumeLockedNote />
                    )}
                  </div>
                )}
                <div>
                  <p className="mb-2 max-w-[60ch] text-[13.5px] leading-snug text-ink-3">
                    Turn on a station once it has a kitchen screen. A ticket nobody there acknowledges within a minute then warns the front of house. A station with an active printer is covered automatically.
                  </p>
                  <Toggle checked={form.ack.includes('KITCHEN')} onChange={(on) => toggleStation('KITCHEN', on)} label="Kitchen has a screen" />
                  <Toggle checked={form.ack.includes('BAR')} onChange={(on) => toggleStation('BAR', on)} label="Bar has a screen" />
                </div>
              </div>
            </Section>
          </fieldset>

          <HoursPanel branch={branch} canEdit={canEdit} onSaved={onSaved} />
          <MenuPanel branch={branch} canEdit={canEdit} />
        </div>
      </div>

      {/* ── Save bar: only exists while there is something to save ── */}
      {canEdit && (
        <div
          className={cx(
            'fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 transition-[transform,opacity] duration-500 ease-spring',
            dirty || justSaved || busy ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-8 opacity-0',
          )}
        >
          <div className="flex w-full max-w-lg items-center gap-3 rounded-full bg-surface-2/90 py-2 pr-2 pl-5 shadow-deep ring-1 ring-hairline-strong ring-inset backdrop-blur-xl">
            <span className="flex min-w-0 flex-1 items-center gap-2.5 truncate text-[13.5px] text-ink-2">
              <span aria-hidden className={cx('size-2 shrink-0 rounded-full', justSaved ? 'bg-mint' : 'animate-breathe bg-gold')} />
              {justSaved ? 'Saved' : 'Unsaved changes'}
            </span>
            <button type="button" className={cx(ADMIN_GHOST, 'h-9 px-3.5')} disabled={busy || !dirty} onClick={() => setForm(initialOf(branch))}>
              Discard
            </button>
            <button type="button" className={cx(ADMIN_PRIMARY, 'relative h-9 overflow-hidden px-4')} disabled={!canSave && !justSaved} onClick={save}>
              <span aria-hidden className={cx('absolute inset-0 origin-left bg-mint transition-transform duration-500 ease-out-quart', justSaved ? 'scale-x-100' : 'scale-x-0')} />
              <span className="relative inline-flex items-center gap-1.5">
                {justSaved ? (
                  <>
                    <Check size={15} /> Saved
                  </>
                ) : busy ? (
                  'Saving…'
                ) : (
                  'Save'
                )}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
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

const minutesOf = (time: string) => {
  if (time === MIDNIGHT) return 1440;
  const [h, m] = time.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

/** A day drawn as a 24-hour line: the open spans glow, so the week reads at a glance and updates as you edit. */
function DayTrack({ ranges, open }: { ranges: Range[]; open: boolean }) {
  return (
    <div aria-hidden className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
      {open && ranges.length === 0 && <span className="absolute inset-0 bg-flame/25" />}
      {ranges.map((range, i) => {
        const from = minutesOf(range.opensAt);
        const to = minutesOf(range.closesAt);
        if (from === null || to === null || to <= from) return null;
        return <span key={i} className="absolute inset-y-0 rounded-full bg-flame" style={{ left: `${(from / 1440) * 100}%`, width: `${((to - from) / 1440) * 100}%` }} />;
      })}
    </div>
  );
}

const SHORT = DAYS.map((d) => d.slice(0, 3));
const clock = (t: string) => (t === MIDNIGHT ? 'midnight' : t);

/** Consecutive days with identical hours collapse to one line: "Sun – Thu  10:00 – 22:00". */
function summarize(days: Range[][]): { label: string; times: string; today: boolean }[] {
  const sig = (day: number) => days[day].map((r) => `${clock(r.opensAt)} – ${clock(r.closesAt)}`).join(' · ') || 'Closed';
  const out: { from: number; to: number; times: string }[] = [];
  for (let day = 0; day < 7; day++) {
    const last = out[out.length - 1];
    if (last && last.times === sig(day)) last.to = day;
    else out.push({ from: day, to: day, times: sig(day) });
  }
  const today = new Date().getDay();
  return out.map(({ from, to, times }) => ({
    label: from === to ? SHORT[from] : `${SHORT[from]} – ${SHORT[to]}`,
    times,
    today: today >= from && today <= to,
  }));
}

function HoursPanel({ branch, canEdit, onSaved }: { branch: Branch; canEdit: boolean; onSaved: () => void }) {
  const [days, setDays] = useState<Range[][]>(() => toRanges(branch.hours));
  const [editing, setEditing] = useState(false);
  const scheduled = days.some((ranges) => ranges.length > 0);

  return (
    <Section
      id="hours"
      title="Opening hours"
      action={
        canEdit && (
          <button type="button" className={cx(ADMIN_GHOST, 'h-9 px-4 text-[13.5px]')} onClick={() => setEditing(true)}>
            Edit hours
          </button>
        )
      }
    >
      {scheduled ? (
        <ul className="max-w-md">
          {summarize(days).map(({ label, times, today }) => (
            <li key={label} className="flex items-baseline gap-4 border-t border-dashed border-hairline py-2.5 text-[14.5px] first:border-t-0 first:pt-0">
              <span className="w-24 shrink-0 font-semibold">{label}</span>
              <span className={cx('tnum', times === 'Closed' ? 'text-ink-4' : 'text-ink-2')}>{times}</span>
              {today && <span className="ml-auto rounded-full bg-flame/12 px-2 py-0.5 text-[11px] font-semibold text-flame-2">Today</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14.5px] text-ink-3">Open at all times. No hours are set, so this branch takes orders around the clock.</p>
      )}
      {editing && (
        <HoursSheet
          branchId={branch.id}
          initial={days}
          onClose={() => setEditing(false)}
          onSaved={(next) => {
            setDays(next);
            onSaved();
          }}
        />
      )}
    </Section>
  );
}

/** The weekly editor, in a sheet so the page itself stays a calm read. Nothing changes on the page until Save. */
function HoursSheet({ branchId, initial, onClose, onSaved }: { branchId: string; initial: Range[][]; onClose: () => void; onSaved: (days: Range[][]) => void }) {
  const { pending, busy, run } = useCommand();
  const [days, setDays] = useState<Range[][]>(initial);
  const [error, setError] = useState('');
  const today = new Date().getDay();

  const edit = (day: number, next: Range[]) => setDays((prev) => prev.map((ranges, index) => (index === day ? next : ranges)));
  const scheduled = days.some((ranges) => ranges.length > 0);

  const save = (close: () => void) => {
    const bad = days.some((ranges) => ranges.some((range) => !range.opensAt || !range.closesAt || range.opensAt >= range.closesAt));
    if (bad) {
      setError('Every range needs an opening time before its closing time. A range past midnight is two: until midnight, then from 00:00.');
      return;
    }
    setError('');
    const hours: BranchHours[] = days.flatMap((ranges, dayOfWeek) => ranges.map((range) => ({ dayOfWeek, ...range, isClosed: false })));
    void run('hours', () => setBranchHours(branchId, hours), 'Hours saved').then((ok) => {
      if (!ok) return;
      onSaved(days);
      close();
    });
  };

  return (
    <Sheet label="Edit opening hours" onClose={onClose} wide>
      {(close) => (
        <>
          <SheetHeader
            title="Opening hours"
            intro="Outside these hours the branch takes no orders. Leave every day empty to be open at all times."
            onClose={() => close()}
          />
          <div className="flex-1 overflow-y-auto px-5 pt-3">
            {DAYS.map((label, day) => (
              <div key={label} className="grid gap-2 border-t border-dashed border-hairline py-3 first:border-t-0 sm:grid-cols-[110px_1fr] sm:items-start">
                <span className="flex items-center gap-2 pt-2 text-[14px] font-semibold">
                  {label}
                  {day === today && <span className="rounded-full bg-flame/12 px-2 py-0.5 text-[11px] font-semibold text-flame-2">Today</span>}
                </span>
                <div className="grid gap-2">
                  {days[day].length === 0 && <span className="pt-2 text-[13.5px] text-ink-3">{scheduled ? 'Closed' : 'Open all day'}</span>}
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
                  <DayTrack ranges={days[day]} open={!scheduled} />
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
              <p role="alert" className="mt-3 rounded-xl bg-berry/10 px-3.5 py-2.5 text-[13px] text-berry ring-1 ring-berry/25 ring-inset">
                {error}
              </p>
            )}
            <div className={SHEET_FOOT}>
              <button type="button" className={FOOT_PRIMARY} disabled={busy} onClick={() => save(close)}>
                {pending === 'hours' ? 'Saving…' : 'Save hours'}
              </button>
              <button type="button" className={cx(ADMIN_GHOST, 'h-11')} disabled={busy || !scheduled} onClick={() => setDays(DAYS.map(() => []))}>
                Open at all times
              </button>
              <button type="button" className={cx(ADMIN_GHOST, 'h-11')} onClick={() => close()}>
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </Sheet>
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
    <Section id="menu" title="Menu" hint="This branch has its own menu. Changes here never affect another branch.">
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
          <div className="grid gap-3 border-t border-dashed border-hairline pt-5">
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
    </Section>
  );
}
