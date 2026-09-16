import type { Order, OrderStatus } from './types';

/** Still moving through the kitchen — the diner should be able to find these. */
export const OPEN_STATUSES: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'];

export function isOpenOrder(status: OrderStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export const DINER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Placed',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const DINER_STATUS_HINT: Record<OrderStatus, string> = {
  PENDING: 'Sent to the kitchen',
  ACCEPTED: 'They have your order',
  PREPARING: 'On the grill',
  READY: 'Coming to your table',
  COMPLETED: 'Enjoy your meal',
  CANCELLED: 'Nothing was sent to the kitchen',
};

export function dinerStatusToast(status: OrderStatus): { message: string; icon: string } {
  switch (status) {
    case 'ACCEPTED':
      return { message: 'Restaurant accepted your order', icon: '✓' };
    case 'PREPARING':
      return { message: 'Kitchen is preparing your order', icon: '🔥' };
    case 'READY':
      return { message: 'Your order is ready', icon: '🔔' };
    case 'COMPLETED':
      return { message: 'Enjoy your meal', icon: '✓' };
    case 'CANCELLED':
      return { message: 'Your order was cancelled', icon: '✕' };
    default:
      return { message: `Order ${DINER_STATUS_LABEL[status].toLowerCase()}`, icon: '✓' };
  }
}

export function needsReview(order: Order): boolean {
  return order.status === 'COMPLETED' && order.items.some((item) => !order.reviewedDishIds.includes(item.dishId));
}

/** Newest open ticket, with food that's ready jumping the line. After that, a meal still waiting on a rating. */
export function followOrder(orders: Order[]): Order | null {
  const open = orders.filter((o) => isOpenOrder(o.status));
  return open.find((o) => o.status === 'READY') ?? open[0] ?? orders.find(needsReview) ?? null;
}
