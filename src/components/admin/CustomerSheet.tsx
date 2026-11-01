import { useState } from 'react';
import { DIETARY_TAGS } from '../../data/customers';
import type { NewCustomer } from '../../data/customers';
import type { CustomerListItem } from '../../domain/types';
import { X } from '../icons';
import { CHIP, CHIP_OFF, CHIP_ON, DISPLAY, cx } from '../ui';
import { ADMIN_GHOST, Field, TextArea, TextInput, Toggle } from './kit';
import { DatePicker } from './DatePicker';
import { FOOT_PRIMARY, SHEET_FOOT, Sheet } from './Sheet';

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
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `oklch(0.72 0.11 ${hueOf(name)} / 0.28)`,
      }}
    >
      {initials}
    </span>
  );
}

const SEGMENT_LABEL = {
  regular: 'Regular',
  new: 'New',
  lapsed: 'Lapsed',
  occasional: 'Occasional',
} as const;
const SEGMENT_STYLE = {
  regular: 'bg-mint/16 text-mint-ink',
  new: 'bg-flame-2/18 text-flame-1',
  lapsed: 'bg-berry/14 text-berry-ink',
  occasional: 'bg-ink/8 text-ink-3',
} as const;

export function SegmentPill({ segment: seg }: { segment: CustomerListItem['segment'] }) {
  return (
    <span
      className={cx(
        'inline-flex h-5.5 items-center rounded-full px-2 text-[11px] font-bold uppercase tracking-[0.06em]',
        SEGMENT_STYLE[seg],
      )}
    >
      {SEGMENT_LABEL[seg]}
    </span>
  );
}

/** Ten weeks of visits as a row of dots — filled means they came that week. */
export function Tally({ weeks, className }: { weeks: boolean[]; className?: string }) {
  const count = weeks.filter(Boolean).length;
  return (
    <span
      className={cx('inline-flex items-center gap-1', className)}
      role="img"
      aria-label={`Visited in ${count} of the last ${weeks.length} weeks`}
    >
      {weeks.map((on, i) => (
        <span key={i} className={cx('size-1.5 rounded-full', on ? 'bg-flame-2' : 'bg-ink/14')} />
      ))}
    </span>
  );
}

/** The add-a-customer side sheet, framed like the stock detail sheet: wide, close button on top, big title. */
export function CustomerSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (input: NewCustomer) => void }) {
  return (
    <Sheet label="Add a customer" onClose={onClose} wide>
      {(close) => (
        <>
          <div className="flex items-center justify-end px-3 pt-3">
            <button
              type="button"
              aria-label="Close"
              onClick={() => close()}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3 ring-1 ring-hairline ring-inset transition-move hover:text-ink active:scale-90"
            >
              <X size={16} />
            </button>
          </div>
          <header className="px-5 pt-2 pb-5">
            <h2 className={cx(DISPLAY, 'animate-rise text-[clamp(30px,6vw,44px)] leading-[1] tracking-[-0.03em]')}>New customer</h2>
            <p className="mt-3 max-w-[40ch] animate-rise text-[clamp(17px,2.2vw,21px)] font-medium leading-[1.35] text-ink-2 [animation-delay:80ms]">
              A name and a phone number is enough. Add the rest when you learn it.
            </p>
          </header>
          <AddForm
            onCancel={() => close()}
            onSubmit={(input) => {
              onAdd(input);
              close();
            }}
          />
        </>
      )}
    </Sheet>
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

  const today = new Date().toLocaleDateString('en-CA');
  const digits = phone.replace(/\D/g, '');
  const canSubmit = name.trim().length >= 2 && digits.length >= 9;
  const toggleTag = (tag: string) => setTags((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]));

  return (
    <form
      className="grid min-h-0 flex-1 animate-swap content-start gap-4 overflow-y-auto px-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit)
          onSubmit({
            name,
            phone,
            email,
            birthday,
            tags,
            notes: notes.trim(),
            offersOk,
          });
      }}
    >
      <Field label="Name">
        <TextInput value={name} onChange={setName} maxLength={120} placeholder="Anita Gurung" autoFocus />
      </Field>
      <Field label="Phone" hint="Nepal mobile, e.g. 9841 234 567 — it's how we recognise them next time.">
        <TextInput
          value={phone}
          onChange={(v) => setPhone(v.replace(/[^\d\s+]/g, ''))}
          maxLength={16}
          placeholder="98XX XXX XXX"
          className="tnum"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" hint="Optional">
          <TextInput value={email} onChange={setEmail} type="email" maxLength={180} placeholder="anita@example.com" />
        </Field>
        <Field label="Birthday" hint="Optional">
          <DatePicker
            value={birthday}
            onChange={setBirthday}
            max={today}
            startYear={new Date().getFullYear() - 30}
            aria-label="Birthday"
          />
        </Field>
      </div>
      <fieldset>
        <legend className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-4">Good to know</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {DIETARY_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={tags.includes(tag)}
              onClick={() => toggleTag(tag)}
              className={cx(CHIP, tags.includes(tag) ? CHIP_ON : CHIP_OFF)}
            >
              {tag}
            </button>
          ))}
        </div>
      </fieldset>
      <Field label="Notes" hint="Seat they like, allergies the kitchen must know, anything a new waiter should hear.">
        <TextArea value={notes} onChange={setNotes} rows={3} maxLength={500} placeholder="Prefers the window table…" />
      </Field>
      <Toggle
        checked={offersOk}
        onChange={setOffersOk}
        label="Okay to send offers"
        hint="They agreed to hear about new dishes and events."
      />
      <div className={SHEET_FOOT}>
        <button type="submit" className={FOOT_PRIMARY} disabled={!canSubmit}>
          Add customer
        </button>
        <button type="button" className={cx(ADMIN_GHOST, 'h-11')} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
