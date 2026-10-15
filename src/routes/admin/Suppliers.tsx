import { useState } from 'react';
import { Link } from 'react-router-dom';
import { addSupplier, fetchSuppliers } from '../../api/suppliers';
import type { SupplierListItem } from '../../api/suppliers';
import { ADMIN_GHOST, ADMIN_PRIMARY, Field, Loading, PageTitle, Panel, TextInput, useCommand } from '../../components/admin/kit';
import { ChevronRight, Plus } from '../../components/icons';
import { formatMoney } from '../../domain/money';
import { useAsync } from '../../state/useAsync';
import { useAuth } from '../../state/AuthContext';
import { useDashboard } from './AdminLayout';

const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Who the kitchen buys from, with what each has delivered. Names seen only on old deliveries can be saved with one tap. */
export function Suppliers() {
  const { allows } = useAuth();
  const { menu } = useDashboard();
  const { busy, run } = useCommand();
  const list = useAsync(fetchSuppliers, []);
  const canManage = allows('inventory:manage');
  const currency = menu.restaurant.currency;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const save = (draft: { name: string; phone: string }) =>
    void run('add', () => addSupplier({ ...draft, note: '' }), `${draft.name} saved`).then((ok) => {
      if (!ok) return;
      setAdding(false);
      setName('');
      setPhone('');
      list.reload();
    });

  if (list.loading && !list.data) return <Loading />;
  const rows = list.data ?? [];

  return (
    <>
      <PageTitle
        title="Suppliers"
        purpose="Who you buy from."
        subtitle="Pick one when a delivery arrives. Open a supplier to see what they delivered and how their prices have moved."
        action={
          canManage && (
            <button type="button" className={ADMIN_PRIMARY} onClick={() => setAdding(true)}>
              <Plus size={16} /> Add supplier
            </button>
          )
        }
      />

      {adding && (
        <Panel className="mb-4" title="New supplier">
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) save({ name: name.trim(), phone: phone.trim() });
            }}
          >
            <Field label="Name">
              <TextInput value={name} onChange={setName} maxLength={80} placeholder="Ram Traders" autoFocus />
            </Field>
            <Field label="Phone (optional)">
              <TextInput value={phone} onChange={setPhone} maxLength={30} placeholder="98…" type="tel" />
            </Field>
            <span className="flex gap-2">
              <button type="submit" disabled={busy || !name.trim()} className={ADMIN_PRIMARY}>
                Save
              </button>
              <button type="button" className={ADMIN_GHOST} onClick={() => setAdding(false)}>
                Cancel
              </button>
            </span>
          </form>
        </Panel>
      )}

      {rows.length === 0 ? (
        <Panel>
          <p className="py-4 text-center text-[13.5px] text-ink-3">No suppliers yet. Add one, or name a supplier when you receive a delivery and it will show up here.</p>
        </Panel>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3">
          {rows.map((s, i) => (
            <li key={s.name} className="animate-rise" style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }}>
              <SupplierCard s={s} currency={currency} canSave={canManage} busy={busy} onSave={() => save({ name: s.name, phone: '' })} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function SupplierCard({ s, currency, canSave, busy, onSave }: { s: SupplierListItem; currency: string; canSave: boolean; busy: boolean; onSave: () => void }) {
  return (
    <div className="flex h-full flex-col rounded-2xl bg-surface p-4 ring-1 ring-hairline ring-inset">
      <Link to={`/admin/suppliers/${encodeURIComponent(s.name)}`} className="group flex items-start justify-between gap-2 rounded-lg">
        <span className="min-w-0">
          <span className="line-clamp-2 text-[15px] leading-snug font-semibold break-words">{s.name}</span>
          <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">{s.phone || 'No phone saved'}</span>
        </span>
        <ChevronRight size={16} className="mt-0.5 shrink-0 text-ink-4 transition-move group-hover:text-ink" />
      </Link>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-[12.5px]">
        <div>
          <dt className="text-ink-3">Deliveries</dt>
          <dd className="mt-0.5 text-[18px] leading-none font-bold tnum">{s.deliveries}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Spent</dt>
          <dd className="mt-0.5 text-[18px] leading-none font-bold tnum">{s.spent > 0 ? formatMoney(s.spent, currency) : '-'}</dd>
        </div>
      </dl>
      {s.owed > 0 && <p className="mt-3 text-[13px] font-semibold text-berry-ink tnum">Owed {formatMoney(s.owed, currency)}</p>}
      <p className="mt-3 text-[12.5px] text-ink-3">{s.lastDeliveryAt ? `Last delivery ${day.format(new Date(s.lastDeliveryAt))}` : 'No deliveries yet'}</p>
      {s.id === null && canSave && (
        <button type="button" disabled={busy} onClick={onSave} className="mt-3 self-start rounded-full bg-surface-2 px-3 py-1 text-[12.5px] font-semibold text-flame-1 ring-1 ring-hairline ring-inset transition-move hover:bg-surface-3 disabled:opacity-40">
          Save as supplier
        </button>
      )}
    </div>
  );
}
