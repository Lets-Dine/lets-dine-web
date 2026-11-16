import { useEffect, useState } from 'react';
import { listCustomers } from '../../api/customers';
import type { CustomerListItem } from '../../domain/types';
import { Plus, Search, X } from '../icons';
import { Avatar } from './Avatar';
import { cx } from '../ui';

export interface Guest {
  name: string;
  phone: string;
}

const FIELD = 'h-11 w-full rounded-lg bg-surface px-3 text-[15px] text-ink outline-none ring-1 ring-hairline ring-inset placeholder:text-ink-4 focus:ring-[1.5px] focus:ring-flame-2/50';

/**
 * Who the order is for at the POS: pick a regular by name or phone, or write in someone new. Closed it is one quiet line, so
 * it never competes with the dishes; open it is a search with matches right under it. A new guest is saved with the order
 * (the server upserts by phone), which is why a name and phone are all it takes.
 */
export function PosCustomer({ value, onChange, required, disabled }: { value: Guest | null; onChange: (g: Guest | null) => void; required?: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState<Guest | null>(null);
  const [results, setResults] = useState<{ q: string; rows: CustomerListItem[] }>({ q: '', rows: [] });
  const needle = query.trim();
  // Only an answer to exactly what is typed now: Enter during the debounce must not pick the last query's match.
  const matches = needle.length >= 2 && results.q === needle ? results.rows : [];

  useEffect(() => {
    if (!open || needle.length < 2) return;
    let stale = false;
    const timer = window.setTimeout(() => {
      listCustomers({ q: needle, limit: 5 })
        .then((page) => !stale && setResults({ q: needle, rows: page.rows }))
        .catch(() => !stale && setResults({ q: needle, rows: [] }));
    }, 200);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [open, needle]);

  const close = () => {
    setOpen(false);
    setAdding(null);
    setQuery('');
  };
  const pick = (g: Guest) => {
    onChange(g);
    close();
  };

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-surface-2 py-1.5 pr-1.5 pl-2.5 ring-1 ring-hairline ring-inset">
        <Avatar name={value.name} className="size-8 text-[13px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] leading-tight font-semibold text-ink">{value.name}</span>
          <span className="block truncate text-[12.5px] leading-tight text-ink-3 tnum">{value.phone}</span>
        </span>
        <button type="button" disabled={disabled} onClick={() => onChange(null)} aria-label="Remove customer" className="grid size-9 place-items-center rounded-md text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink">
          <X size={15} />
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cx(
          'flex h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-[14.5px] font-semibold transition-colors',
          required ? 'bg-flame/10 text-flame-3 ring-1 ring-flame/40 ring-inset' : 'text-ink-3 ring-1 ring-dashed ring-hairline-strong ring-inset hover:text-ink',
        )}
      >
        <Plus size={15} />
        {required ? 'Choose the customer' : 'Add customer'}
        {!required && <span className="ml-auto text-[12.5px] font-normal text-ink-4">optional</span>}
      </button>
    );
  }

  if (adding) {
    const ready = adding.phone.replace(/\D/g, '').length >= 6 && adding.name.trim() !== '';
    return (
      <form
        className="grid gap-2 rounded-lg bg-surface-2 p-2 ring-1 ring-hairline ring-inset"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) pick({ name: adding.name.trim(), phone: adding.phone.trim() });
        }}
      >
        <input autoFocus={!adding.name} value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} maxLength={60} placeholder="Name" aria-label="Customer name" className={FIELD} />
        <input autoFocus={!!adding.name} value={adding.phone} onChange={(e) => setAdding({ ...adding, phone: e.target.value })} maxLength={20} inputMode="tel" placeholder="Phone" aria-label="Customer phone" className={cx(FIELD, 'tnum')} />
        <div className="flex gap-2">
          <button type="submit" disabled={!ready} className="h-10 flex-1 rounded-lg bg-flame text-[14.5px] font-semibold text-white disabled:opacity-40">
            Add customer
          </button>
          <button type="button" onClick={() => setAdding(null)} className="h-10 rounded-lg px-3 text-[14px] font-semibold text-ink-3 hover:text-ink">
            Back
          </button>
        </div>
      </form>
    );
  }

  const looksLikePhone = /^[\d\s+-]{6,}$/.test(needle);
  const startAdding = () => setAdding(looksLikePhone ? { name: '', phone: needle } : { name: needle, phone: '' });

  return (
    <div className="grid gap-1.5 rounded-lg bg-surface-2 p-2 ring-1 ring-hairline ring-inset">
      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-4" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
              if (e.key !== 'Enter') return;
              e.preventDefault();
              if (matches[0]) pick(matches[0]);
              else if (needle) startAdding();
            }}
            placeholder="Search name or phone"
            aria-label="Search customers"
            className={cx(FIELD, 'pl-9')}
          />
        </div>
        <button type="button" onClick={close} aria-label="Cancel" className="grid size-11 place-items-center rounded-lg text-ink-3 hover:text-ink">
          <X size={16} />
        </button>
      </div>
      <p className="sr-only" role="status">
        {needle.length >= 2 ? `${matches.length} matching customer${matches.length === 1 ? '' : 's'}` : ''}
      </p>
      {matches.length > 0 && (
        <ul aria-label="Matching customers">
          {matches.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => pick(c)} className="flex min-h-12 w-full items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-surface-3">
                <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-ink">{c.name}</span>
                <span className="shrink-0 text-[12.5px] text-ink-3 tnum">{c.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={startAdding} className="flex h-10 items-center gap-1.5 rounded-lg px-2 text-[14px] font-semibold text-flame-3 hover:bg-surface-3">
        <Plus size={14} />
        {needle && matches.length === 0 ? `New customer “${needle}”` : 'New customer'}
      </button>
    </div>
  );
}
