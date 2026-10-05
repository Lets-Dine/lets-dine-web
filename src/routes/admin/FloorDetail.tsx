import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { isTableOpen } from '../../api/admin';
import { completeOrderPayment, regenerateFloorQr, setFloorActive, listFloors } from '../../api/staff';
import { floorBillSubject } from '../../domain/orderStatus';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useToast } from '../../state/ToastContext';
import { useNow } from '../../state/useNow';
import { FloorQrDialog, floorUrl, printSingleFloorQr } from '../../components/admin/FloorQrCard';
import { PassCard } from '../../components/admin/PassCard';
import { PaymentSheet } from '../../components/admin/PaymentSheet';
import {
  ADMIN_GHOST,
  ADMIN_PRIMARY,
  Confirm,
  Empty,
  Loading,
  PageTitle,
  Panel,
  useCommand,
} from '../../components/admin/kit';
import { ChevronLeft } from '../../components/icons';
import { cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

/**
 * §16b continued. Every order a floor's shared QR has produced, with the one
 * action its orders never had anywhere else: taking payment. A table has
 * `TableDetail` and a delivery order settles itself on dispatch, but a floor
 * order previously had nowhere to be paid once it was served.
 *
 * Billed one order at a time rather than as a merged session tab — unlike a
 * table, a floor scan starts its own session per visit, so each order is
 * already its own bill (§16b's "no shared bill" rule, just extended to cover
 * payment too).
 */

export function FloorDetail() {
  const { floorId = '' } = useParams();
  const staff = useStaff();
  const { allows } = useAuth();
  const { menu, orders, reloadOrders, applyOrder } = useDashboard();
  const { pending, busy, run } = useCommand();
  const push = useToast();
  const now = useNow();

  const floors = useAsync(() => listFloors(staff), [staff]);
  const floor = floors.data?.find((f) => f.id === floorId) ?? null;

  const editable = allows('tables:edit');
  const menuDishes = menu.dishes.filter((d) => !d.isArchived && d.isAvailable);

  const [showQr, setShowQr] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);

  // `Order.floorName` is the only thread back to a floor — it's joined in read-side from the
  // session rather than stored on the order itself (see the domain type), so a name match is
  // the whole join available here. A floor's orders never clear the way a table's visit does
  // (there's no `endSession` to drop them), so a finished ticket is filtered out here instead —
  // otherwise every order the floor's QR ever produced would sit on this page forever.
  const floorOrders = useMemo(
    () =>
      floor
        ? orders.filter((o) => o.floorName === floor.name && o.status !== 'COMPLETED' && o.status !== 'CANCELLED')
        : [],
    [orders, floor],
  );
  const sortedOrders = useMemo(
    () => [...floorOrders].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [floorOrders],
  );
  const openCount = floorOrders.filter((o) => isTableOpen(o.status)).length;
  const payingOrder = floorOrders.find((o) => o.id === payingId) ?? null;

  const act = (key: string, action: () => Promise<unknown>, message: string) =>
    void run(key, action, message).then((ok) => {
      if (ok) floors.reload();
      return ok;
    });

  if (floors.loading && !floor) return <Loading label="Opening the floor…" />;

  if (!floor) {
    return (
      <Empty
        emoji="🔍"
        title="This floor doesn't exist"
        message="It may have been renamed or removed. Head back to the floor list to find it."
        action={
          <Link to="/admin/floors" className={ADMIN_PRIMARY}>
            Back to floors
          </Link>
        }
      />
    );
  }

  const url = floorUrl(menu.restaurant.slug, floor);

  return (
    <>
      <PageTitle
        title={floor.name}
        subtitle={`${floor.isActive ? 'Taking orders' : 'Disabled'} · ${openCount} open order${openCount === 1 ? '' : 's'}`}
        action={
          <Link to="/admin/floors" className={cx(ADMIN_GHOST, 'gap-1.5')}>
            <ChevronLeft size={15} /> All floors
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="grid gap-4">
          {sortedOrders.length === 0 ? (
            <Panel title="Orders">
              <Empty
                emoji="🧾"
                title="Nothing ordered here yet"
                message="Orders placed through this floor's QR show up here, newest first."
              />
            </Panel>
          ) : (
            sortedOrders.map((order, index) => (
              <PassCard
                key={order.id}
                order={order}
                index={index}
                focus={null}
                menu={menu}
                canAdd={false}
                now={now}
                onApply={applyOrder}
                onResync={reloadOrders}
                onTakePayment={(o) => setPayingId(o.id)}
              />
            ))
          )}
        </div>

        <div className="grid gap-4">
          <Panel title="QR code">
            <div className="grid gap-2">
              <button type="button" className={ADMIN_GHOST} onClick={() => setShowQr(true)}>
                Show QR
              </button>
              <button
                type="button"
                className={ADMIN_GHOST}
                onClick={() => {
                  void navigator.clipboard?.writeText(url);
                  push('Floor link copied');
                }}
              >
                Copy link
              </button>
              <button type="button" className={ADMIN_GHOST} onClick={() => printSingleFloorQr(floor, menu.restaurant.name, url)}>
                Print this code
              </button>
              {editable && (
                <Confirm
                  label="Regenerate code"
                  question="Void the printed code?"
                  confirmLabel="Regenerate"
                  disabled={busy}
                  className="justify-center"
                  onConfirm={() =>
                    act(floor.id, () => regenerateFloorQr(staff, floor.id), `${floor.name} has a new code — reprint it`)
                  }
                />
              )}
            </div>
          </Panel>

          {editable && (
            <Panel title="Floor settings">
              <button
                type="button"
                className={ADMIN_GHOST}
                disabled={busy}
                onClick={() =>
                  act(
                    floor.id,
                    () => setFloorActive(staff, floor.id, !floor.isActive),
                    floor.isActive ? `${floor.name} disabled` : `${floor.name} is taking orders again`,
                  )
                }
              >
                {floor.isActive ? 'Disable floor' : 'Enable floor'}
              </button>
            </Panel>
          )}
        </div>
      </div>

      <FloorQrDialog
        floor={showQr ? floor : null}
        url={url}
        restaurantName={menu.restaurant.name}
        onClose={() => setShowQr(false)}
        onCopy={(copied) => {
          void navigator.clipboard?.writeText(copied);
          push('Floor link copied');
        }}
      />

      <PaymentSheet
        table={payingOrder ? floorBillSubject(payingOrder) : null}
        orders={payingOrder ? [payingOrder] : []}
        dishes={menuDishes}
        restaurantName={menu.restaurant.name}
        vatPanNumber={menu.restaurant.vatPanNumber}
        serviceChargeRate={menu.restaurant.serviceChargeRate}
        taxRate={menu.restaurant.taxRate}
        pending={pending}
        onClose={() => setPayingId(null)}
        onSettle={(changes) => {
          if (!payingOrder) return Promise.resolve(false);
          const order = payingOrder;
          return run(
            order.id,
            () => completeOrderPayment(staff, order, changes.items, changes.method, changes.discount),
            `${order.reference} paid up`,
          ).then((ok) => {
            if (ok) reloadOrders();
            return ok;
          });
        }}
        onEndSession={() => setPayingId(null)}
        onShowQr={() => {
          setPayingId(null);
          setShowQr(true);
        }}
      />
    </>
  );
}
