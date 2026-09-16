import { useState } from 'react';
import { createTable, listTables, regenerateQr, setTableActive, updateTable } from '../../api/admin';
import type { DiningTable } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useToast } from '../../state/ToastContext';
import { QrImage, downloadQr, printQrSheet, tableUrl } from '../../components/admin/QrCard';
import {
  ADMIN_GHOST,
  ADMIN_PRIMARY,
  ADMIN_TINY,
  Confirm,
  Field,
  INPUT_BOX,
  Loading,
  PANEL,
  PageTitle,
  Panel,
  TextInput,
  useCommand,
} from '../../components/admin/kit';
import { cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

/**
 * §29. Tables and their codes.
 *
 * The QR is generated here rather than fetched, so a restaurant can print the
 * whole floor in one go without an internet round trip per table. Regenerating
 * a token is the one destructive action on this screen — every printed copy of
 * that code stops working the moment it happens — so it is the one that asks.
 */
export function Tables() {
  const staff = useStaff();
  const { allows } = useAuth();
  const { menu } = useDashboard();
  const { pending, busy, run } = useCommand();
  const push = useToast();

  const tables = useAsync(() => listTables(staff), [staff]);
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [renaming, setRenaming] = useState<string | null>(null);

  const editable = allows('tables:edit');
  const rows = tables.data ?? [];
  const active = rows.filter((t) => t.isActive);

  const act = (key: string, action: () => Promise<unknown>, message: string) =>
    void run(key, action, message).then(tables.reload);

  return (
    <>
      <PageTitle
        title="Tables"
        subtitle={`${active.length} seating · ${rows.length - active.length} disabled`}
        action={
          rows.length > 0 && (
            <button
              type="button"
              className={ADMIN_GHOST}
              onClick={() => {
                const opened = printQrSheet(active, menu.restaurant.name, menu.restaurant.slug);
                if (!opened) push('Allow pop-ups to print the QR sheet.', '⚠️');
              }}
            >
              Print all codes
            </button>
          )
        }
      />

      {tables.loading && rows.length === 0 ? (
        <Loading label="Reading the floor plan…" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px] lg:items-start">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                slug={menu.restaurant.slug}
                restaurantName={menu.restaurant.name}
                editable={editable}
                pending={pending}
                renaming={renaming === table.id}
                onRename={() => setRenaming(table.id)}
                onCancelRename={() => setRenaming(null)}
                onSaveRename={(nextName, nextCapacity) => {
                  setRenaming(null);
                  act(table.id, () => updateTable(staff, table.id, { name: nextName, capacity: nextCapacity }), 'Table updated');
                }}
                onToggle={() =>
                  act(
                    table.id,
                    () => setTableActive(staff, table.id, !table.isActive),
                    table.isActive ? `${table.name} disabled` : `${table.name} is seating again`,
                  )
                }
                onRegenerate={() =>
                  act(table.id, () => regenerateQr(staff, table.id), `${table.name} has a new code — reprint it`)
                }
                onCopy={(url) => {
                  void navigator.clipboard?.writeText(url);
                  push('Table link copied');
                }}
              />
            ))}
          </div>

          {editable && (
            <Panel title="Add a table">
              <form
                className="grid gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  act('new', () => createTable(staff, name, Number(capacity)), `${name.trim()} added`);
                  setName('');
                }}
              >
                <Field label="Name">
                  <TextInput value={name} onChange={setName} maxLength={30} placeholder="Table 15" />
                </Field>
                <Field label="Seats">
                  <input
                    className={cx(INPUT_BOX, 'tnum')}
                    value={capacity}
                    inputMode="numeric"
                    onChange={(e) => setCapacity(e.target.value.replace(/[^0-9]/g, ''))}
                  />
                </Field>
                <button type="submit" className={ADMIN_PRIMARY} disabled={busy || name.trim().length < 1}>
                  {pending === 'new' ? 'Adding…' : 'Add table'}
                </button>
                <p className="text-[12.5px] leading-relaxed text-ink-4">
                  A new table gets its own token straight away. Print its code before the next service.
                </p>
              </form>
            </Panel>
          )}
        </div>
      )}
    </>
  );
}

interface CardProps {
  table: DiningTable;
  slug: string;
  restaurantName: string;
  editable: boolean;
  pending: string | null;
  renaming: boolean;
  onRename: () => void;
  onCancelRename: () => void;
  onSaveRename: (name: string, capacity: number) => void;
  onToggle: () => void;
  onRegenerate: () => void;
  onCopy: (url: string) => void;
}

function TableCard({ table, slug, restaurantName, editable, pending, renaming, ...on }: CardProps) {
  const url = tableUrl(slug, table);
  const busy = pending !== null;

  return (
    <article className={cx(PANEL, 'flex flex-col overflow-hidden', pending === table.id && 'opacity-50')}>
      <div className="flex items-start gap-3 p-4">
        <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-white p-1">
          <QrImage value={url} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15.5px] font-semibold tracking-tight">{table.name}</h3>
            {!table.isActive && (
              <span className="rounded-full bg-berry/14 px-2 py-0.5 text-[10.5px] font-bold uppercase text-[#ff8098]">
                Off
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12.5px] text-ink-4">
            {table.capacity} seat{table.capacity === 1 ? '' : 's'}
          </p>
          <p className="mt-1.5 break-all font-mono text-[11px] leading-tight text-ink-4">{table.qrToken}</p>
        </div>
      </div>

      {renaming ? (
        <RenameForm table={table} onCancel={on.onCancelRename} onSave={on.onSaveRename} />
      ) : (
        <div className="mt-auto flex flex-wrap gap-1 border-t border-hairline px-3 py-2.5">
          <button
            type="button"
            className={cx(ADMIN_TINY, 'bg-surface-2 ring-1 ring-hairline ring-inset')}
            onClick={() => printQrSheet([table], restaurantName, slug)}
          >
            Print
          </button>
          <button type="button" className={cx(ADMIN_TINY, 'text-ink-3 hover:text-ink')} onClick={() => downloadQr(table, url)}>
            Download
          </button>
          <button type="button" className={cx(ADMIN_TINY, 'text-ink-3 hover:text-ink')} onClick={() => on.onCopy(url)}>
            Copy link
          </button>

          {editable && (
            <>
              <button
                type="button"
                disabled={busy}
                className={cx(ADMIN_TINY, 'text-ink-3 hover:text-ink')}
                onClick={on.onRename}
              >
                Rename
              </button>
              <button
                type="button"
                disabled={busy}
                className={cx(ADMIN_TINY, table.isActive ? 'text-ink-3 hover:text-ink' : 'text-mint')}
                onClick={on.onToggle}
              >
                {table.isActive ? 'Disable' : 'Enable'}
              </button>
              <Confirm
                label="New code"
                question="Void the printed code?"
                confirmLabel="Regenerate"
                disabled={busy}
                onConfirm={on.onRegenerate}
              />
            </>
          )}
        </div>
      )}
    </article>
  );
}

function RenameForm({
  table,
  onSave,
  onCancel,
}: {
  table: DiningTable;
  onSave: (name: string, capacity: number) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(table.name);
  const [capacity, setCapacity] = useState(String(table.capacity));

  return (
    <form
      className="mt-auto grid gap-2 border-t border-hairline p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name, Number(capacity) || table.capacity);
      }}
    >
      <input
        className={cx(INPUT_BOX, 'py-2')}
        value={name}
        maxLength={30}
        aria-label="Table name"
        autoFocus
        onChange={(e) => setName(e.target.value)}
      />
      <div className="flex gap-2">
        <input
          className={cx(INPUT_BOX, 'w-20 py-2 tnum')}
          value={capacity}
          inputMode="numeric"
          aria-label="Seats"
          onChange={(e) => setCapacity(e.target.value.replace(/[^0-9]/g, ''))}
        />
        <button type="button" className={cx(ADMIN_GHOST, 'h-9 flex-1')} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={cx(ADMIN_PRIMARY, 'h-9 flex-1')}>
          Save
        </button>
      </div>
    </form>
  );
}
