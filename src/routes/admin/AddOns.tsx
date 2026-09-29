import { useMemo, useState } from 'react';
import { createAddOn, setAddOnArchived, updateAddOn } from '../../api/staff';
import type { AddOn } from '../../domain/types';
import { useStaff } from '../../state/AuthContext';
import {
  ADMIN_GHOST,
  ADMIN_PRIMARY,
  ADMIN_TINY,
  Confirm,
  Field,
  MoneyInput,
  PageTitle,
  Perforation,
  TextInput,
  useCommand,
} from '../../components/admin/kit';
import { formatMoney } from '../../domain/money';
import { cx } from '../../components/ui';
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
    <>
      <PageTitle title="Add-ons" subtitle="Priced extras diners can attach to a dish — link them from each dish's editor." />

      <div className="grid gap-4 lg:grid-cols-[1.9fr_1fr] lg:items-start">
        <div className="overflow-hidden rounded-[28px] bg-docket-surface text-docket-ink ring-1 ring-docket-line">
          <div className="flex items-baseline justify-between gap-3 px-6 pt-5 pb-4">
            <h2 className="font-display text-[18px] font-black tracking-tight">On the menu</h2>
            <span className="shrink-0 text-[11px] font-bold tracking-wide text-docket-inksoft uppercase">
              {live.length} add-on{live.length === 1 ? '' : 's'}
            </span>
          </div>
          <Perforation />
          {live.length === 0 ? (
            <p className="px-6 py-8 text-center text-[13.5px] text-docket-inksoft">No add-ons yet — add one alongside.</p>
          ) : (
            <ul>
              {live.map((addOn, index) => (
                <li key={addOn.id}>
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
                    <>
                      <div className={cx('flex items-center gap-3 px-6 py-4', pending === addOn.id && 'opacity-50')}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px] font-semibold">{addOn.name}</span>
                          <span className="block text-[12.5px] text-docket-inksoft">
                            Linked to {linkCounts.get(addOn.id) ?? 0} dish{(linkCounts.get(addOn.id) ?? 0) === 1 ? '' : 'es'}
                            {!addOn.isAvailable && ' · Unavailable'}
                          </span>
                        </span>
                        <span className="font-display shrink-0 text-[15px] font-black tnum">
                          {formatMoney(addOn.price, currency)}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            className={cx(ADMIN_TINY, addOn.isAvailable ? 'bg-docket-line/70 text-docket-ink' : 'bg-docket-mint/16 text-docket-mint')}
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
                          <button
                            type="button"
                            disabled={busy}
                            className={cx(ADMIN_TINY, 'bg-surface-2 ring-1 ring-hairline ring-inset')}
                            onClick={() => setEditing(addOn.id)}
                          >
                            Edit
                          </button>
                          <Confirm
                            label="Archive"
                            question="Archive it?"
                            confirmLabel="Archive"
                            disabled={busy}
                            tone="paper"
                            onConfirm={() => act(addOn.id, () => setAddOnArchived(staff, addOn.id, true), `${addOn.name} archived`)}
                          />
                        </div>
                      </div>
                      {index < live.length - 1 && <Perforation />}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {archived.length > 0 && (
            <>
              <Perforation label="Archived" thick />
              <ul>
                {archived.map((addOn, index) => (
                  <li key={addOn.id}>
                    <div className={cx('flex items-center gap-3 px-6 py-4 opacity-60', pending === addOn.id && 'opacity-30')}>
                      <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{addOn.name}</span>
                      <span className="font-display shrink-0 text-[15px] font-black tnum">
                        {formatMoney(addOn.price, currency)}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        className={cx(ADMIN_TINY, 'text-docket-mint')}
                        onClick={() => act(addOn.id, () => setAddOnArchived(staff, addOn.id, false), `${addOn.name} restored`)}
                      >
                        Restore
                      </button>
                    </div>
                    {index < archived.length - 1 && <Perforation />}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="overflow-hidden rounded-[28px] bg-docket-surface text-docket-ink ring-1 ring-docket-line">
          <div className="flex items-baseline justify-between gap-3 px-6 pt-5 pb-4">
            <h2 className="font-display text-[18px] font-black tracking-tight">Add an add-on</h2>
          </div>
          <Perforation />
          <form
            className="grid gap-4 px-6 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              act('new', () => createAddOn(staff, { name, price, isAvailable: true }), `${name.trim()} added`);
              setName('');
              setPrice(0);
            }}
          >
            <Field label="Name">
              <TextInput value={name} onChange={setName} maxLength={40} placeholder="Extra cheese" />
            </Field>
            <Field label="Price">
              <MoneyInput value={price} onChange={setPrice} currency={currency} />
            </Field>
            <button type="submit" className={ADMIN_PRIMARY} disabled={busy || name.trim().length < 2}>
              {pending === 'new' ? 'Adding…' : 'Add add-on'}
            </button>
          </form>
        </div>
      </div>
    </>
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
      className="flex flex-wrap items-center gap-2 px-6 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name, price);
      }}
    >
      <input
        className="min-w-30 flex-1 rounded-xl bg-surface-2 px-3.5 py-2.5 text-[14.5px] outline-none ring-1 ring-hairline ring-inset placeholder:text-ink-4 focus:ring-[1.5px] focus:ring-flame-2/40"
        value={name}
        maxLength={40}
        aria-label="Add-on name"
        autoFocus
        onChange={(e) => setName(e.target.value)}
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
