import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getSettings, rotateKey, saveSettings } from '../../api/platformConsole';
import type { PlatformSettings } from '../../api/platformConsole';
import { storePlatformKey } from '../../api/platform';
import { useAsync } from '../../state/useAsync';
import { ADMIN_GHOST, ADMIN_PRIMARY, Confirm, Field, Loading, PageTitle, PercentInput, Panel, Segmented, Select, TextArea, TextInput, Toggle, useCommand } from '../../components/admin/kit';
import { usePageTitle } from '../../state/usePageTitle';
import { useToast } from '../../state/ToastContext';
import { Alert, Copy, Info, Key } from '../../components/icons';
import { cx } from '../../components/ui';
import { relTime } from './kit';

/** Platform-wide rules. Each section says what it changes and for whom, because a setting here reaches every restaurant. */
export function PlatformSettingsPage() {
  usePageTitle('Settings · Platform admin');
  const data = useAsync(getSettings, []);
  const { busy, run } = useCommand();
  const [draft, setDraft] = useState<PlatformSettings | null>(null);

  useEffect(() => {
    if (data.data) setDraft(structuredClone(data.data));
  }, [data.data]);

  const dirty = useMemo(() => !!draft && !!data.data && JSON.stringify(draft) !== JSON.stringify(data.data), [draft, data.data]);
  if (!draft) return <Loading label="Loading settings…" />;

  const set = <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  return (
    <>
      <PageTitle title="Settings" subtitle="Rules that apply across the whole platform." />

      <div className="grid gap-5">
        <Section title="New restaurant defaults" hint="Pre-filled when you add a restaurant. Existing restaurants are never changed.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Currency">
              <Select value={draft.defaults.currency} onChange={(v) => set('defaults', { ...draft.defaults, currency: v })} options={[{ value: 'NPR', label: 'NPR · Rs.' }, { value: 'INR', label: 'INR · ₹' }, { value: 'USD', label: 'USD · $' }]} />
            </Field>
            <Field label="Timezone">
              <TextInput value={draft.defaults.timezone} onChange={(v) => set('defaults', { ...draft.defaults, timezone: v })} maxLength={60} />
            </Field>
            <Field label="Service charge">
              <PercentInput value={draft.defaults.serviceChargePct} onChange={(v) => set('defaults', { ...draft.defaults, serviceChargePct: v })} />
            </Field>
            <Field label="Tax (VAT)">
              <PercentInput value={draft.defaults.taxPct} onChange={(v) => set('defaults', { ...draft.defaults, taxPct: v })} />
            </Field>
            <Field label="Free trial">
              <Select value={draft.defaults.trialDays} onChange={(v) => set('defaults', { ...draft.defaults, trialDays: v })} options={['0', '7', '14', '30'].map((d) => ({ value: d, label: d === '0' ? 'No trial' : `${d} days` }))} />
            </Field>
          </div>
        </Section>

        <Section title="When payment is late" hint="Reminders go to the owner by email. The days count from the invoice due date.">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <div className="grid gap-4 sm:grid-cols-2">
              <Days label="Remind before due" value={draft.dunning.remindBeforeDueDays} onChange={(v) => set('dunning', { ...draft.dunning, remindBeforeDueDays: v })} />
              <Days label="Remind after due" value={draft.dunning.remindAfterDueDays} onChange={(v) => set('dunning', { ...draft.dunning, remindAfterDueDays: v })} />
              <Days label="Restrict after" hint="New orders stop; existing ones can be finished." value={draft.dunning.restrictAfterDays} onChange={(v) => set('dunning', { ...draft.dunning, restrictAfterDays: v })} />
              <Days label="Suspend after" hint="Staff can no longer sign in." value={draft.dunning.suspendAfterDays} onChange={(v) => set('dunning', { ...draft.dunning, suspendAfterDays: v })} />
            </div>
            <Timeline d={draft.dunning} />
          </div>
        </Section>

        <Section title="Announcement" hint="A banner across the top of every restaurant dashboard.">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="grid gap-4">
              <Field label="Message">
                <TextArea value={draft.announcement.text} onChange={(v) => set('announcement', { ...draft.announcement, text: v })} rows={3} maxLength={220} placeholder="Scheduled maintenance Sunday 2–3 am. Orders will pause for about 10 minutes." />
              </Field>
              <Segmented<'info' | 'warn'> label="Tone" value={draft.announcement.tone} onChange={(v) => set('announcement', { ...draft.announcement, tone: v })} options={[{ value: 'info', label: 'Information' }, { value: 'warn', label: 'Warning' }]} />
              <Toggle checked={draft.announcement.live} onChange={(v) => set('announcement', { ...draft.announcement, live: v })} label="Show to restaurants" hint={draft.announcement.text.trim() ? 'Visible as soon as you save.' : 'Write a message first.'} disabled={!draft.announcement.text.trim()} />
            </div>
            <div>
              <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-4">What restaurants see</div>
              <div
                className={cx(
                  'flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[13.5px] leading-snug ring-1 ring-inset',
                  draft.announcement.tone === 'warn' ? 'bg-gold/12 text-ink ring-gold/30' : 'bg-pass/10 text-ink ring-pass/25',
                  !draft.announcement.live && 'opacity-60',
                )}
              >
                {draft.announcement.tone === 'warn' ? <Alert size={16} className="mt-0.5 shrink-0 text-gold-ink" /> : <Info size={16} className="mt-0.5 shrink-0 text-pass" />}
                <span>{draft.announcement.text.trim() || 'Your message appears here.'}</span>
              </div>
              {!draft.announcement.live && <p className="mt-2 text-[12.5px] text-ink-4">Not showing to anyone yet.</p>}
            </div>
          </div>
        </Section>

        <Section title="Maintenance mode" hint="Pauses new diner orders everywhere. Staff keep working the orders already open.">
          <Toggle checked={draft.maintenance} onChange={(v) => set('maintenance', v)} label="Pause new orders on the whole platform" hint="Diners scanning a QR see a friendly “back in a few minutes” screen. Use it for migrations only." />
        </Section>

        <PlatformKey settings={draft} />
      </div>

      {dirty && (
        <div className="sticky bottom-4 z-30 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3 shadow-deep ring-1 ring-hairline-strong ring-inset" role="region" aria-label="Unsaved settings">
          <p className="text-[13.5px] font-semibold">Unsaved changes</p>
          <div className="flex gap-2">
            <button type="button" className={ADMIN_GHOST} disabled={busy} onClick={() => setDraft(structuredClone(data.data!))}>
              Discard
            </button>
            <button type="button" className={ADMIN_PRIMARY} disabled={busy} onClick={() => void run('save', () => saveSettings(draft), 'Settings saved.').then((ok) => ok && data.reload())}>
              {busy ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <Panel title={title} hint={hint}>
      {children}
    </Panel>
  );
}

function Days({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} hint={hint}>
      <span className="relative block">
        <input
          className="w-full rounded-xl bg-surface-2 px-3.5 py-2.5 pr-14 text-[14.5px] tnum text-ink outline-none ring-1 ring-hairline ring-inset transition-[box-shadow] duration-150 focus:ring-[1.5px] focus:ring-flame-2/40"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 3))}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[13px] text-ink-4">days</span>
      </span>
    </Field>
  );
}

/** The same numbers laid out in the order things will happen to a restaurant that never pays. */
function Timeline({ d }: { d: PlatformSettings['dunning'] }) {
  const steps: { when: string; what: string; tone: string }[] = [
    { when: `${d.remindBeforeDueDays || 0} days before due`, what: 'Friendly reminder', tone: 'bg-pass' },
    { when: 'Due date', what: 'Invoice becomes overdue if unpaid', tone: 'bg-gold' },
    { when: `${d.remindAfterDueDays || 0} days after`, what: 'Second reminder', tone: 'bg-gold' },
    { when: `${d.restrictAfterDays || 0} days after`, what: 'Restricted: no new orders', tone: 'bg-flame-3' },
    { when: `${d.suspendAfterDays || 0} days after`, what: 'Suspended: staff locked out', tone: 'bg-berry' },
  ];
  return (
    <ol className="relative grid gap-4 pl-6 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-hairline-strong" aria-label="What happens to an unpaid invoice">
      {steps.map((s) => (
        <li key={s.what} className="relative">
          <span className={cx('absolute -left-6 top-1 size-[11px] rounded-full ring-4 ring-docket-surface', s.tone)} aria-hidden />
          <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-4">{s.when}</div>
          <div className="text-[13.5px] font-semibold">{s.what}</div>
        </li>
      ))}
    </ol>
  );
}

function PlatformKey({ settings }: { settings: PlatformSettings }) {
  const toast = useToast();
  const { busy, run } = useCommand();
  const data = useAsync(getSettings, []);
  const [fresh, setFresh] = useState<string | null>(null);
  const hint = data.data?.keyHint ?? settings.keyHint;
  const rotated = data.data?.keyRotatedAt ?? settings.keyRotatedAt;

  return (
    <Panel title="Platform key" hint="The shared secret that unlocks this console.">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-ink-3 ring-1 ring-hairline ring-inset">
            <Key size={18} />
          </span>
          <div>
            <div className="font-semibold tnum tracking-wider">{hint}</div>
            <div className="text-[12.5px] text-ink-3">Rotated {relTime(rotated)}</div>
          </div>
        </div>
        <Confirm
          label={<span className="inline-flex h-8 items-center rounded-lg bg-surface-2 px-3 text-[13px] ring-1 ring-hairline ring-inset">Rotate key</span>}
          question="Retire the current key?"
          confirmLabel="Rotate"
          disabled={busy}
          onConfirm={() =>
            void run('rotate', async () => {
              const key = await rotateKey();
              storePlatformKey(key);
              setFresh(key);
              data.reload();
            })
          }
        />
      </div>
      {fresh && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-mint/10 px-3.5 py-3 ring-1 ring-mint/25 ring-inset" role="status">
          <div className="min-w-0">
            <p className="text-[12.5px] text-ink-3">New key, shown once. Store it somewhere safe.</p>
            <p className="break-all font-semibold tnum">{fresh}</p>
          </div>
          <button
            type="button"
            className={ADMIN_GHOST}
            onClick={() => {
              void navigator.clipboard?.writeText(fresh).catch(() => undefined);
              toast('Key copied.', <Copy size={16} />);
            }}
          >
            <Copy size={14} /> Copy
          </button>
        </div>
      )}
      <p className="mt-4 border-t border-hairline pt-4 text-[12.5px] leading-relaxed text-ink-4">
        Everyone holding this key has full operator access and appears in Activity as “Operator”. Rotating signs everyone else out; you stay signed in on this device.
      </p>
    </Panel>
  );
}
