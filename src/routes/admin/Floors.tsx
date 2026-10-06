import { useState } from 'react';
import { Link } from 'react-router-dom';
import { createFloor, listFloors, regenerateFloorQr, setFloorActive, updateFloor } from '../../api/staff';
import type { Floor } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useToast } from '../../state/ToastContext';
import { FloorQrDialog, floorUrl } from '../../components/admin/FloorQrCard';
import {
  ADMIN_GHOST,
  ADMIN_PRIMARY,
  ADMIN_TINY,
  Field,
  INPUT_BOX,
  Loading,
  PANEL,
  PageTitle,
  Panel,
  TextInput,
  useCommand,
} from '../../components/admin/kit';
import { DISPLAY, cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

/**
 * §16b. Floors and their shared codes.
 *
 * One QR per floor rather than per room: any scan starts its own independent
 * session, so — unlike a table — a floor has no occupied/free state or
 * session of its own to show here, just the floor and its printed code.
 */

export function Floors() {
  const staff = useStaff();
  const { allows } = useAuth();
  const { menu } = useDashboard();
  const { pending, busy, run } = useCommand();
  const push = useToast();

  const floors = useAsync(() => listFloors(staff), [staff]);

  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [qrId, setQrId] = useState<string | null>(null);

  const editable = allows('tables:edit');
  const rows = floors.data ?? [];
  const active = rows.filter((f) => f.isActive);

  const act = (key: string, action: () => Promise<unknown>, message: string) =>
    void run(key, action, message).then(floors.reload);

  const qrFloor = rows.find((f) => f.id === qrId) ?? null;

  return (
    <>
      <PageTitle title="Floors" subtitle={`${active.length} taking orders · ${rows.length - active.length} disabled`} />

      {floors.loading && rows.length === 0 ? (
        <Loading label="Reading the floor list…" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px] lg:items-start">
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.length === 0 && (
              <p className="col-span-full py-6 text-center text-[13px] text-ink-4">
                No floors yet — add one for a shared, room-less QR.
              </p>
            )}
            {rows.map((floor) => (
              <FloorCard
                key={floor.id}
                floor={floor}
                editable={editable}
                pending={pending}
                renaming={renaming === floor.id}
                onRename={() => setRenaming(floor.id)}
                onCancelRename={() => setRenaming(null)}
                onSaveRename={(nextName) => {
                  setRenaming(null);
                  act(floor.id, () => updateFloor(staff, floor.id, { name: nextName }), 'Floor updated');
                }}
                onToggle={() =>
                  act(
                    floor.id,
                    () => setFloorActive(staff, floor.id, !floor.isActive),
                    floor.isActive ? `${floor.name} disabled` : `${floor.name} is taking orders again`,
                  )
                }
                onRegenerate={() =>
                  act(floor.id, () => regenerateFloorQr(staff, floor.id), `${floor.name} has a new code — reprint it`)
                }
                onCopy={(url) => {
                  void navigator.clipboard?.writeText(url);
                  push('Floor link copied');
                }}
                onShowQr={() => setQrId(floor.id)}
              />
            ))}
          </div>

          {editable && (
            <Panel title="Add a floor">
              <form
                className="grid gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  act('new', () => createFloor(staff, name), `${name.trim()} added`);
                  setName('');
                }}
              >
                <Field label="Name">
                  <TextInput value={name} onChange={setName} maxLength={30} placeholder="3rd Floor" />
                </Field>
                <button type="submit" className={ADMIN_PRIMARY} disabled={busy || name.trim().length < 1}>
                  {pending === 'new' ? 'Adding…' : 'Add floor'}
                </button>
                <p className="text-[12.5px] leading-relaxed text-ink-4">
                  A new floor gets its own shared code straight away. Any staff member on that floor can scan it and
                  order — each scan starts its own tab, so nobody is forced to share a bill.
                </p>
              </form>
            </Panel>
          )}
        </div>
      )}

      <FloorQrDialog
        floor={qrFloor}
        url={qrFloor ? floorUrl(menu.restaurant.slug, qrFloor) : ''}
        restaurantName={menu.restaurant.name}
        logoUrl={menu.restaurant.logoUrl || undefined}
        onClose={() => setQrId(null)}
        onCopy={(url) => {
          void navigator.clipboard?.writeText(url);
          push('Floor link copied');
        }}
      />
    </>
  );
}

interface CardProps {
  floor: Floor;
  editable: boolean;
  pending: string | null;
  renaming: boolean;
  onRename: () => void;
  onCancelRename: () => void;
  onSaveRename: (name: string) => void;
  onToggle: () => void;
  onRegenerate: () => void;
  onCopy: (url: string) => void;
  onShowQr: () => void;
}

function FloorCard({ floor, editable, pending, renaming, ...on }: CardProps) {
  const busy = pending === floor.id;
  const disabled = !floor.isActive;

  return (
    <article className={cx(PANEL, 'flex flex-col gap-2.5 p-3 transition-move', busy && 'opacity-50', disabled && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/admin/floors/${floor.id}`}
          className={cx(
            DISPLAY,
            'truncate text-[26px] leading-none font-black transition-colors hover:text-flame-2',
            disabled ? 'text-ink-2' : 'text-ink',
          )}
        >
          {floor.name}
        </Link>
        <span className="mt-1 flex shrink-0 items-center gap-1.5">
          <span className={cx('size-2 rounded-full', disabled ? 'bg-ink-4/40' : 'bg-mint')} />
          <span className={cx('text-[10px] font-bold tracking-wide uppercase', disabled ? 'text-ink-4' : 'text-mint')}>
            {disabled ? 'Off' : 'Active'}
          </span>
        </span>
      </div>

      <p className="text-[12px] text-ink-4">One shared QR — any room on this floor orders through it.</p>

      <div className="flex justify-end gap-1">
        <Link
          to={`/admin/floors/${floor.id}`}
          className="rounded-md px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-ink-4 uppercase ring-1 ring-hairline ring-inset transition-colors hover:text-flame-1 hover:ring-flame-2/40"
        >
          Orders
        </Link>
        <button
          type="button"
          className="rounded-md px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-ink-4 uppercase ring-1 ring-hairline ring-inset transition-colors hover:text-flame-1 hover:ring-flame-2/40"
          onClick={on.onShowQr}
        >
          QR
        </button>
      </div>

      {renaming ? (
        <RenameForm floor={floor} onCancel={on.onCancelRename} onSave={on.onSaveRename} />
      ) : (
        editable && (
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              disabled={busy}
              className={cx(
                'w-full rounded-[10px] py-2 text-[10px] font-bold tracking-wide uppercase ring-1 ring-inset transition-move active:scale-[0.99] disabled:pointer-events-none disabled:opacity-35',
                disabled ? 'text-mint ring-mint/40' : 'text-ink-3 ring-hairline',
              )}
              onClick={on.onToggle}
            >
              {disabled ? 'Enable floor' : 'Disable floor'}
            </button>
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              <button
                type="button"
                disabled={busy}
                className={cx(ADMIN_TINY, 'h-6 px-2 text-[10px] text-ink-3 hover:text-ink')}
                onClick={on.onRename}
              >
                Rename
              </button>
            </div>
          </div>
        )
      )}
    </article>
  );
}

function RenameForm({ floor, onSave, onCancel }: { floor: Floor; onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(floor.name);

  return (
    <form
      className="mt-auto grid gap-2 border-t border-hairline p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name);
      }}
    >
      <input
        className={cx(INPUT_BOX, 'py-2')}
        value={name}
        maxLength={30}
        aria-label="Floor name"
        autoFocus
        onChange={(e) => setName(e.target.value)}
      />
      <div className="flex gap-2">
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
