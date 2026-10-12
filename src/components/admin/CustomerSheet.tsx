import { useEffect, useRef, useState } from 'react';
import { DIETARY_TAGS } from '../../data/customers';
import type { NewCustomer } from '../../data/customers';
import type { CustomerListItem } from '../../domain/types';
import { X } from '../icons';
import { CHIP, CHIP_OFF, CHIP_ON, DISPLAY, cx } from '../ui';
import { ADMIN_GHOST, ADMIN_PRIMARY, Field, TextArea, TextInput, Toggle } from './kit';

/** Hash a name to a hue so the same person always gets the same warm-to-cool tint. */
export const hueOf = (name: string) => [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold text-ink ring-1 ring-hairline ring-inset"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `oklch(0.72 0.11 ${hueOf(name)} / 0.28)` }}
    >
      {initials}
    </span>
  );
}

const SEGMENT_LABEL = { regular: 'Regular', new: 'New', lapsed: 'Lapsed', occasional: 'Occasional' } as const;
const SEGMENT_STYLE = {
  regular: 'bg-mint/16 text-mint-ink',
  new: 'bg-flame-2/18 text-flame-1',
  lapsed: 'bg-berry/14 text-berry-ink',
  occasional: 'bg-ink/8 text-ink-3',
} as const;

export function SegmentPill({ segment: seg }: { segment: CustomerListItem['segment'] }) {
  return (
    <span className={cx('inline-flex h-5.5 items-center rounded-full px-2 text-[11px] font-bold uppercase tracking-[0.06em]', SEGMENT_STYLE[seg])}>
      {SEGMENT_LABEL[seg]}
    </span>
  );
}

/** Ten weeks of visits as a row of dots — filled means they came that week. */
export function Tally({ weeks, className }: { weeks: boolean[]; className?: string }) {
  const count = weeks.filter(Boolean).length;
  return (
    <span className={cx('inline-flex items-center gap-1', className)} role="img" aria-label={`Visited in ${count} of the last ${weeks.length} weeks`}>
      {weeks.map((on, i) => (
        <span key={i} className={cx('size-1.5 rounded-full', on ? 'bg-flame-2' : 'bg-ink/14')} />
      ))}
    </span>
  );
}

/**
 * The add-a-customer side sheet, built on the native <dialog>, which brings focus trapping, Esc and
 * the backdrop for free. Bottom sheet on phones, right-hand drawer from `sm` up. Reading a customer
 * lives on its own page (`routes/admin/CustomerDetail`).
 */
export function CustomerSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (input: NewCustomer) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-label="Add a customer"
      className={cx(
        'fixed m-0 flex max-h-none flex-col overflow-hidden bg-surface p-0 text-ink shadow-deep outline-none backdrop:bg-black/55 backdrop:backdrop-blur-[2px]',
        'inset-x-0 bottom-0 top-auto max-h-[92dvh] w-full max-w-none rounded-t-3xl',
        'sm:inset-y-0 sm:left-auto sm:right-0 sm:top-0 sm:h-dvh sm:max-h-none sm:w-[460px] sm:rounded-none sm:rounded-l-3xl',
        'animate-dock-in sm:animate-rise',
      )}
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <h2 className={cx(DISPLAY, 'text-[24px]')}>New customer</h2>
          <p className="mt-1 text-[13px] text-ink-3">A name and a phone number is enough. Add the rest when you learn it.</p>
        </div>
        <button type="button" aria-label="Close" onClick={() => ref.current?.close()} className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3 ring-1 ring-hairline ring-inset transition-move hover:text-ink active:scale-90">
          <X size={16} />
        </button>
      </div>
      <AddForm onCancel={() => ref.current?.close()} onSubmit={(input) => { onAdd(input); ref.current?.close(); }} />
    </dialog>
  );
}

function AddForm({ onSubmit, onCancel }: { onSubmit: (input: NewCustomer) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [birthday, setBirthday] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [offersOk, setOffersOk] = useState(true);

  const digits = phone.replace(/\D/g, '');
  const canSubmit = name.trim().length >= 2 && digits.length >= 9;
  const toggleTag = (tag: string) => setTags((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]));

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit({ name, phone, email, birthday, tags, notes: notes.trim(), offersOk });
      }}
    >
      <div className="grid flex-1 content-start gap-4 overflow-y-auto px-5 py-5">
        <Field label="Name">
          <TextInput value={name} onChange={setName} maxLength={120} placeholder="Anita Gurung" autoFocus />
        </Field>
        <Field label="Phone" hint="Nepal mobile, e.g. 9841 234 567 — it's how we recognise them next time.">
          <TextInput value={phone} onChange={(v) => setPhone(v.replace(/[^\d\s+]/g, ''))} maxLength={16} placeholder="98XX XXX XXX" className="tnum" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" hint="Optional">
            <TextInput value={email} onChange={setEmail} type="email" maxLength={180} placeholder="anita@example.com" />
          </Field>
          <Field label="Birthday" hint="Optional">
            <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className="w-full rounded-xl bg-surface-2 px-3.5 py-2.5 text-[14.5px] text-ink outline-none ring-1 ring-hairline ring-inset focus:ring-[1.5px] focus:ring-flame-2/40 [color-scheme:dark] tnum" />
          </Field>
        </div>
        <fieldset>
          <legend className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-4">Good to know</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {DIETARY_TAGS.map((tag) => (
              <button key={tag} type="button" aria-pressed={tags.includes(tag)} onClick={() => toggleTag(tag)} className={cx(CHIP, tags.includes(tag) ? CHIP_ON : CHIP_OFF)}>
                {tag}
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="Notes" hint="Seat they like, allergies the kitchen must know, anything a new waiter should hear.">
          <TextArea value={notes} onChange={setNotes} rows={3} maxLength={500} placeholder="Prefers the window table…" />
        </Field>
        <Toggle checked={offersOk} onChange={setOffersOk} label="Okay to send offers" hint="They agreed to hear about new dishes and events." />
      </div>
      <div className="flex gap-2 border-t border-hairline bg-surface-2/40 px-5 py-3.5 pb-[calc(14px+var(--safe-b))]">
        <button type="submit" className={cx(ADMIN_PRIMARY, 'flex-1')} disabled={!canSubmit}>
          Add customer
        </button>
        <button type="button" className={ADMIN_GHOST} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
