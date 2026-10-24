import { useMemo, useState } from 'react';
import { createAddOn, setAddOnArchived, updateAddOn } from '../../api/staff';
import type { AddOn } from '../../domain/types';
import { useStaff } from '../../state/AuthContext';
import { ADMIN_GHOST, ADMIN_PRIMARY, ADMIN_TINY, Confirm, INPUT_BOX, MoneyInput, useCommand } from '../../components/admin/kit';
import { Plus } from '../../components/icons';
import { formatMoney } from '../../domain/money';
import { DISPLAY, cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

/**
 * Add-ons are priced extras a diner can attach to a dish — created here,
 * once, and linked to as many dishes as make sense from each dish's own
 * editor. Same rule as a dish (§28): one already on a past order is
 * archived, never deleted, so a historical order never loses what it
 * actually charged for.
 */
export function AddOns() {
  const staff = useStaff();
  const { menu, reloadMenu } = useDashboard();
  const { pending, busy, run } = useCommand();

  const [name, setName] = useState('');
  const [price, setPrice] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const currency = menu.restaurant.currency;
  const ordered = useMemo(() => [...menu.addOns].sort((a, b) => a.sortOrder - b.sortOrder), [menu.addOns]);
  const live = ordered.filter((a) => !a.isArchived);
  const archived = ordered.filter((a) => a.isArchived);
  const linkCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const dish of menu.dishes) {
      if (dish.isArchived) continue;
      for (const id of dish.addOnIds) map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  }, [menu.dishes]);

  const act = (key: string, action: () => Promise<unknown>, message: string) =>
    void run(key, action, message).then(reloadMenu);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-10 animate-rise">
        <h1 className={cx(DISPLAY, 'text-[clamp(38px,7vw,64px)] leading-[0.98] tracking-[-0.03em]')}>Add-ons</h1>
        <p className="mt-3 text-[14px] text-ink-3 tnum">
          {live.length} add-on{live.length === 1 ? '' : 's'}. Priced extras diners can attach to a dish — link them from each dish's editor.
        </p>
      </header>

      {live.length === 0 ? (
        <p className="border-y border-hairline px-2 py-10 text-center text-[14px] text-ink-3">No add-ons yet — add the first one below.</p>
      ) : (
        <ul className="divide-y divide-hairline border-y border-hairline">
          {live.map((addOn, index) => {
            const links = linkCounts.get(addOn.id) ?? 0;
            return (
              <li key={addOn.id} className="animate-rise" style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}>
                {editing === addOn.id ? (
                  <AddOnEditor
                    addOn={addOn}
                    currency={currency}
                    busy={busy}
                    onCancel={() => setEditing(null)}
                    onSave={(nextName, nextPrice) => {
                      setEditing(null);
                      act(addOn.id, () => updateAddOn(staff, addOn.id, { name: nextName, price: nextPrice }), 'Add-on updated');
                    }}
                  />
                ) : (
                  <div className={cx('group flex flex-wrap items-center gap-x-4 gap-y-2 px-2 py-4 transition-opacity sm:px-3', pending === addOn.id && 'opacity-50')}>
                    <span className="min-w-0 flex-1 basis-48">
                      <span className={cx(DISPLAY, 'block truncate text-[20px] leading-tight', !addOn.isAvailable && 'text-ink-3')}>{addOn.name}</span>
                      <span className="mt-0.5 block text-[13px] text-ink-3 tnum">
                        {links === 0 ? 'Not linked to a dish yet' : `On ${links} dish${links === 1 ? '' : 'es'}`}
                        {!addOn.isAvailable && ' · Unavailable'}
                      </span>
                    </span>
                    <span className="shrink-0 text-[16px] font-semibold tnum">{formatMoney(addOn.price, currency)}</span>
                    <div className="flex shrink-0 items-center gap-1 transition-opacity lg:opacity-0 lg:focus-within:opacity-100 lg:group-hover:opacity-100">
                      <button
                        type="button"
                        disabled={busy}
                        className={cx(ADMIN_TINY, 'bg-surface-2 ring-1 ring-hairline ring-inset')}
                        onClick={() =>
                          act(
                            addOn.id,
                            () => updateAddOn(staff, addOn.id, { isAvailable: !addOn.isAvailable }),
                            addOn.isAvailable ? `${addOn.name} marked unavailable` : `${addOn.name} is back on`,
                          )
                        }
                      >
                        {addOn.isAvailable ? 'Mark unavailable' : 'Put back on'}
                      </button>
                      <button type="button" disabled={busy} className={cx(ADMIN_TINY, 'bg-surface-2 ring-1 ring-hairline ring-inset')} onClick={() => setEditing(addOn.id)}>
                        Edit
                      </button>
                      <Confirm
                        label="Archive"
                        question="Archive it?"
                        confirmLabel="Archive"
                        disabled={busy}
                        onConfirm={() => act(addOn.id, () => setAddOnArchived(staff, addOn.id, true), `${addOn.name} archived`)}
                      />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-6">
        {adding ? (
          <form
            className="animate-pop grid gap-4 rounded-3xl bg-surface p-5 ring-1 ring-flame-2/40 ring-inset"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim().length < 2) return;
              act('new', () => createAddOn(staff, { name, price, isAvailable: true }), `${name.trim()} added`);
              setName('');
              setPrice(0);
              setAdding(false);
            }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <input
                className={cx(INPUT_BOX, 'min-w-40 flex-1')}
                value={name}
                maxLength={40}
                autoFocus
                placeholder="Extra cheese"
                aria-label="Add-on name"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
              />
              <span className="w-36 shrink-0">
                <MoneyInput value={price} onChange={setPrice} currency={currency} />
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button type="submit" className={ADMIN_PRIMARY} disabled={busy || name.trim().length < 2}>
                {pending === 'new' ? 'Adding…' : 'Add add-on'}
              </button>
              <button type="button" className={ADMIN_GHOST} onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="group flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl border border-dashed border-hairline-strong text-[14.5px] font-semibold text-ink-2 transition-[color,border-color,background-color] duration-200 hover:border-flame-2/60 hover:bg-flame-2/5 hover:text-ink"
          >
            <span className="grid size-6 place-items-center rounded-full bg-flame-2/15 text-flame-1 transition-transform duration-300 ease-spring group-hover:rotate-90">
              <Plus size={14} />
            </span>
            Add an add-on
          </button>
        )}
      </div>

      {archived.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.09em] text-ink-4">Archived</h2>
          <ul className="mt-3 divide-y divide-hairline border-y border-hairline">
            {archived.map((addOn) => (
              <li key={addOn.id} className={cx('flex items-center gap-4 px-2 py-3 transition-opacity sm:px-3', pending === addOn.id && 'opacity-50')}>
                <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink-3">{addOn.name}</span>
                <span className="shrink-0 text-[14px] text-ink-3 tnum">{formatMoney(addOn.price, currency)}</span>
                <button
                  type="button"
                  disabled={busy}
                  className={cx(ADMIN_TINY, 'bg-surface-2 ring-1 ring-hairline ring-inset')}
                  onClick={() => act(addOn.id, () => setAddOnArchived(staff, addOn.id, false), `${addOn.name} restored`)}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function AddOnEditor({
  addOn,
  currency,
  busy,
  onSave,
  onCancel,
}: {
  addOn: AddOn;
  currency: string;
  busy: boolean;
  onSave: (name: string, price: number) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(addOn.name);
  const [price, setPrice] = useState(addOn.price);

  return (
    <form
      className="flex animate-swap flex-wrap items-center gap-2 px-2 py-4 sm:px-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name, price);
      }}
    >
      <input
        className={cx(INPUT_BOX, 'min-w-30 flex-1')}
        value={name}
        maxLength={40}
        aria-label="Add-on name"
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      />
      <span className="w-32 shrink-0">
        <MoneyInput value={price} onChange={setPrice} currency={currency} />
      </span>
      <button type="button" className={ADMIN_GHOST} onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className={ADMIN_PRIMARY} disabled={busy || name.trim().length < 2}>
        Save
      </button>
    </form>
  );
}
