import { useEffect, useState } from 'react';
import { listCustomers } from '../../api/customers';
import { useAsync } from '../../state/useAsync';
import { Search } from '../icons';
import { PICKER_SEARCH, PickerModal } from './PaymentSheet';

export interface SeatedCustomer {
  id: string;
  name: string;
}

/** Who a table was seated for. Nothing is stored on the visit: the id rides along with its first order, as the new-order flow does with a guest. */
const KEY = (sessionId: string) => `seated-for:${sessionId}`;
export function rememberSeatedCustomer(sessionId: string, customer: SeatedCustomer | undefined) {
  try {
    if (customer) sessionStorage.setItem(KEY(sessionId), JSON.stringify(customer));
  } catch {
    // Private mode: the order simply isn't pre-assigned.
  }
}
export function readSeatedCustomer(sessionId: string | null | undefined): SeatedCustomer | null {
  if (!sessionId) return null;
  try {
    const raw = sessionStorage.getItem(KEY(sessionId));
    return raw ? (JSON.parse(raw) as SeatedCustomer) : null;
  } catch {
    return null;
  }
}

/**
 * Shown after "Seat this table": pick the regular the table is for — so their orders and points land on them from the
 * first dish — or seat without one. Either choice seats the table; closing the dialog seats nobody.
 */
export function SeatCustomer({ onSeat, onClose }: { onSeat: (customer?: SeatedCustomer) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(id);
  }, [q]);
  const found = useAsync(() => listCustomers({ q: debounced, limit: 8 }), [debounced]);

  return (
    <PickerModal title="Who is this table for?" onClose={onClose}>
      <label className="relative mb-2 block">
        <span className="sr-only">Search customers by name or phone</span>
        <Search size={14} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2" />
        <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone" className={PICKER_SEARCH} />
      </label>
      <ul className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {found.data?.rows.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => onSeat({ id: c.id, name: c.name })} className="flex w-full items-baseline justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[oklch(0.879_0.033_85)]">
              <span className="truncate text-[13px] text-[oklch(0.232_0.019_70)]">{c.name}</span>
              <span className="shrink-0 text-[13px] tnum">{c.phone}</span>
            </button>
          </li>
        ))}
        {found.data && found.data.rows.length === 0 && <li className="px-3 py-3 text-[13px]">Nobody matches that.</li>}
        {found.loading && !found.data && <li className="px-3 py-3 text-[13px]">Searching…</li>}
        {found.error && <li className="px-3 py-3 text-[13px] text-[oklch(0.5_0.18_25)]">Couldn't search just now.</li>}
      </ul>
      <button type="button" onClick={() => onSeat()} className="mt-2 w-full rounded-xl bg-[oklch(0.879_0.033_85)] px-3 py-2.5 text-[13px] font-bold text-[oklch(0.232_0.019_70)]">
        Seat without a customer
      </button>
    </PickerModal>
  );
}
