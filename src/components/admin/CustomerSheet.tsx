import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DIETARY_TAGS, since } from '../../data/customers';
import type { Customer, NewCustomer } from '../../data/customers';
import type { CustomerListItem } from '../../domain/types';
import { formatMoney } from '../../domain/money';
import { X } from '../icons';
import { CHIP, CHIP_OFF, CHIP_ON, DISPLAY, cx } from '../ui';
import { ADMIN_GHOST, ADMIN_PRIMARY, Confirm, Field, TextArea, TextInput, Toggle } from './kit';

/** Hash a name to a hue so the same person always gets the same warm-to-cool tint. */
const hueOf = (name: string) => [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);

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
 * One side sheet for both jobs — reading a customer and adding one — built on
 * the native <dialog>, which brings focus trapping, Esc and the backdrop for
 * free. Bottom sheet on phones, right-hand drawer from `sm` up.
 */
export function CustomerSheet({
  mode,
  item,
  detail,
  sample,
  currency,
  canEdit,
  onClose,
  onAdd,
  onNotes,
  onRemove,
}: {
  mode: 'add' | 'view';
  /** The list row — all the live backend provides so far. */
  item?: CustomerListItem;
  /** The fuller profile (favourites, notes, contact…) — sample data only until the detail endpoint exists. */
  detail?: Customer;
  /** The profile fields are placeholders, not this customer's — say so. */
  sample?: boolean;
  currency: string;
  canEdit: boolean;
  onClose: () => void;
  onAdd: (input: NewCustomer) => void;
  onNotes: (id: string, notes: string) => void;
  onRemove: (id: string) => void;
}) {
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
      aria-label={mode === 'add' ? 'Add a customer' : item?.name}
      className={cx(
        'fixed m-0 flex max-h-none flex-col overflow-hidden bg-surface p-0 text-ink shadow-deep outline-none backdrop:bg-black/55 backdrop:backdrop-blur-[2px]',
        'inset-x-0 bottom-0 top-auto max-h-[92dvh] w-full max-w-none rounded-t-3xl',
        'sm:inset-y-0 sm:left-auto sm:right-0 sm:top-0 sm:h-dvh sm:max-h-none sm:w-[460px] sm:rounded-none sm:rounded-l-3xl',
        'animate-dock-in sm:animate-rise',
      )}
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          {mode === 'add' ? (
            <>
              <h2 className={cx(DISPLAY, 'text-[24px]')}>New customer</h2>
              <p className="mt-1 text-[13px] text-ink-3">A name and a phone number is enough. Add the rest when you learn it.</p>
            </>
          ) : (
            item && (
              <div className="flex items-center gap-3.5">
                <Avatar name={item.name} size={52} />
                <div className="min-w-0">
                  <h2 className={cx(DISPLAY, 'truncate text-[24px]')}>{item.name}</h2>
                  <div className="mt-1 flex items-center gap-2 text-[13px] text-ink-3">
                    <SegmentPill segment={item.segment} />
                    <span className="tnum">{item.phone}</span>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
        <button type="button" aria-label="Close" onClick={() => ref.current?.close()} className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3 ring-1 ring-hairline ring-inset transition-move hover:text-ink active:scale-90">
          <X size={16} />
        </button>
      </div>

      {mode === 'add' ? (
        <AddForm onCancel={() => ref.current?.close()} onSubmit={(input) => { onAdd(input); ref.current?.close(); }} />
      ) : (
        item && <Profile item={item} detail={detail} sample={sample} currency={currency} canEdit={canEdit} onNotes={onNotes} onRemove={(id) => { onRemove(id); ref.current?.close(); }} />
      )}
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

function Profile({ item, detail, sample, currency, canEdit, onNotes, onRemove }: { item: CustomerListItem; detail?: Customer; sample?: boolean; currency: string; canEdit: boolean; onNotes: (id: string, notes: string) => void; onRemove: (id: string) => void }) {
  const [notes, setNotes] = useState(detail?.notes ?? '');
  const dirty = detail !== undefined && notes !== detail.notes;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid flex-1 content-start gap-6 overflow-y-auto px-5 py-5">
        <dl className="grid grid-cols-3 divide-x divide-hairline rounded-2xl bg-surface-2/50 ring-1 ring-hairline ring-inset">
          <Figure label="Visits" value={String(item.visits)} />
          <Figure label="Spent" value={formatMoney(item.spend, currency)} />
          <Figure label="Last seen" value={since(item.lastVisitAt)} small />
        </dl>

        <Section title="Rhythm" hint="Last ten weeks">
          <Tally weeks={item.visitWeeks} className="gap-2 [&>span]:size-3" />
        </Section>

        {sample && <p className="rounded-xl bg-surface-2/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-3 ring-1 ring-hairline ring-inset">Orders most, tags, contact and notes below are sample content — they'll show this customer's own once the profile is connected.</p>}

        {detail && detail.favourites.length > 0 && (
          <Section title="Orders most">
            <ol className="grid gap-1.5">
              {detail?.favourites.map((dish, i) => (
                <li key={dish} className="flex items-baseline gap-2.5 text-[14.5px]">
                  <span className="w-4 text-[12px] font-semibold text-ink-4 tnum">{i + 1}</span>
                  <span className="font-medium">{dish}</span>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {detail && detail.tags.length > 0 && (
          <Section title="Good to know">
            <div className="flex flex-wrap gap-2">
              {detail?.tags.map((tag) => (
                <span key={tag} className="inline-flex h-7 items-center rounded-full bg-flame-2/15 px-3 text-[12.5px] font-semibold text-flame-1 ring-1 ring-flame-2/35 ring-inset">
                  {tag}
                </span>
              ))}
            </div>
          </Section>
        )}

        {detail && (
          <>
        <Section title="Contact">
          <dl className="grid gap-1.5 text-[14px]">
            <Line k="Phone" v={item.phone} />
            <Line k="Email" v={detail.email || '—'} />
            <Line k="Birthday" v={detail.birthday ? new Date(detail.birthday + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : '—'} />
            <Line k="Offers" v={detail.offersOk ? 'Okay to send' : 'Do not send'} />
          </dl>
        </Section>

        <Section title="Notes">
          {canEdit ? (
            <>
              <TextArea value={notes} onChange={setNotes} rows={4} maxLength={500} placeholder="Nothing noted yet." />
              {dirty && (
                <button type="button" className={cx(ADMIN_PRIMARY, 'mt-2 h-9')} onClick={() => onNotes(detail.id, notes)}>
                  Save note
                </button>
              )}
            </>
          ) : (
            <p className="text-[14px] leading-relaxed text-ink-2">{detail.notes || 'Nothing noted yet.'}</p>
          )}
        </Section>
          </>
        )}
      </div>
      {canEdit && detail && (
        <div className="flex items-center justify-between border-t border-hairline bg-surface-2/40 px-5 py-3 pb-[calc(12px+var(--safe-b))]">
          <span className="text-[12px] text-ink-4">Added {since(item.joinedAt)}</span>
          <Confirm label="Remove customer" question="Remove for good?" confirmLabel="Remove" onConfirm={() => onRemove(item.id)} />
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="px-3 py-3.5 text-center">
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-ink-4">{label}</dt>
      <dd className={cx(DISPLAY, 'mt-1 tnum', small ? 'text-[15px] leading-[1.5]' : 'text-[19px]')}>{value}</dd>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 flex items-baseline gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-4">
        {title}
        {hint && <span className="font-normal normal-case tracking-normal">{hint}</span>}
      </h3>
      {children}
    </section>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-3">{k}</dt>
      <dd className="truncate text-right font-medium tnum">{v}</dd>
    </div>
  );
}
