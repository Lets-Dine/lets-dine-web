import { useMemo } from 'react';
import { completeOrderPayment } from '../../api/staff';
import { floorBillSubject } from '../../domain/orderStatus';
import type { Order } from '../../domain/types';
import { useDashboard } from '../../routes/admin/AdminLayout';
import { useStaff } from '../../state/AuthContext';
import { PaymentSheet } from './PaymentSheet';
import { TablePaySheet } from './TablePaySheet';
import { useCommand } from './kit';

/**
 * Takes payment for the one order a screen is paying: a table order opens its table's sheet on this order's
 * lines (the whole tab for staff who can't split); floor and quick-sale orders are billed on their own.
 * Shared by the Orders pass and the order page.
 */
export function PayOrderHost({ order, onClose, onPaid }: { order: Order | null; onClose: () => void; onPaid: () => void }) {
  const { menu } = useDashboard();
  const staff = useStaff();
  const { pending, run } = useCommand();
  const dishes = useMemo(() => menu.dishes.filter((d) => !d.isArchived && d.isAvailable), [menu.dishes]);
  const own = order && !order.tableId ? order : null;

  return (
    <>
      {order?.tableId && <TablePaySheet order={order} onClose={onClose} onPaid={onPaid} />}
      <PaymentSheet
        table={own ? floorBillSubject(own) : null}
        orders={own ? [own] : []}
        dishes={dishes}
        restaurantName={menu.restaurant.name}
        legalName={menu.restaurant.legalName}
        vatPanNumber={menu.restaurant.vatPanNumber}
        vatRegistered={menu.restaurant.vatRegistered}
        serviceChargeRate={menu.restaurant.serviceChargeRate}
        taxRate={menu.restaurant.taxRate}
        pending={pending}
        onClose={onClose}
        onSettle={(changes) => {
          if (!own) return Promise.resolve(false);
          return run(
            own.id,
            () => completeOrderPayment(staff, own, changes.items, changes.method, changes.discount, changes.redeemPoints, changes.customerId, changes.credit),
            `${own.reference} paid up`,
          ).then((ok) => {
            if (ok) onPaid();
            return ok;
          });
        }}
        onEndSession={onClose}
        onShowQr={onClose}
      />
    </>
  );
}
