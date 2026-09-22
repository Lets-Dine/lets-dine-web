import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getSessionOrders, subscribeToOrder } from '../api/diner';
import { IS_LIVE_API } from '../api/http';
import { track } from '../domain/analytics';
import { REVIEW_REMIND_MS } from '../domain/config';
import { dinerItemStatusToast, dinerStatusToast, isOpenOrder, needsReview } from '../domain/orderStatus';
import type { DiningSession, Order } from '../domain/types';
import { haptic } from '../platform/haptics';
import { notifyAway } from '../platform/notify';
import { useToast } from './ToastContext';

/**
 * The diner's visit, not a single ticket. Status changes have to reach them
 * on the menu, a dish, or another tab — not only on the order-status screen
 * they may have already left.
 */

interface SessionOrdersValue {
  orders: Order[];
  ready: boolean;
  rememberOrder: (order: Order) => void;
}

const SessionOrdersContext = createContext<SessionOrdersValue | null>(null);

export function useSessionOrders(): SessionOrdersValue {
  const ctx = useContext(SessionOrdersContext);
  if (!ctx) throw new Error('useSessionOrders must be used inside SessionOrdersProvider');
  return ctx;
}

const POLL_MS = 2500;

export function SessionOrdersProvider({
  session,
  base,
  children,
}: {
  session: DiningSession;
  base: string;
  children: ReactNode;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [ready, setReady] = useState(false);
  const lastStatus = useRef(new Map<string, Order['status']>());
  const lastItemStatus = useRef(new Map<string, string>());
  const reviewReminded = useRef(new Set<string>());
  const reviewTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const goToReview = useCallback(
    (orderId: string) => {
      navigate(`${base}/order/${orderId}/review`);
    },
    [base, navigate],
  );

  const remindReview = useCallback(
    (order: Order) => {
      if (reviewReminded.current.has(order.id) || !needsReview(order)) return;
      reviewReminded.current.add(order.id);
      if (pathnameRef.current.includes(`/order/${order.id}/review`)) return;
      haptic.tick();
      toast('How was your meal?', '⭐', {
        label: 'Rate',
        onAction: () => goToReview(order.id),
      });
      notifyAway(`Order ${order.reference}`, 'A dish from your order is ready to rate.', `review-${order.id}`);
    },
    [goToReview, toast],
  );

  const scheduleReviewRemind = useCallback(
    (order: Order) => {
      if (!needsReview(order) || reviewReminded.current.has(order.id) || reviewTimers.current.has(order.id)) return;
      const servedAt = Date.parse(order.completedAt ?? order.updatedAt);
      const wait = Number.isFinite(servedAt) ? Math.max(0, REVIEW_REMIND_MS - (Date.now() - servedAt)) : REVIEW_REMIND_MS;
      reviewTimers.current.set(
        order.id,
        setTimeout(() => {
          reviewTimers.current.delete(order.id);
          remindReview(order);
        }, wait),
      );
    },
    [remindReview],
  );

  const announce = useCallback(
    (order: Order) => {
      const copy = dinerStatusToast(order.status);
      if (order.status === 'READY') haptic.success();
      else if (order.status === 'CANCELLED') haptic.warn();
      else haptic.tick();

      const viewing = pathnameRef.current.includes(`/order/${order.id}`);
      const rate = needsReview(order);
      toast(
        copy.message,
        copy.icon,
        rate
          ? { label: 'Rate', onAction: () => goToReview(order.id) }
          : viewing
            ? undefined
            : { label: 'View', onAction: () => navigate(`${base}/order/${order.id}`) },
      );
      notifyAway(`Order ${order.reference}`, copy.message, `order-${order.id}`);
    },
    [base, goToReview, navigate, toast],
  );

  // A lighter nudge for one dish — otherwise a multi-item order goes quiet
  // until every last item converges on the same order-level status.
  const announceItem = useCallback(
    (order: Order, item: Order['items'][number]) => {
      const copy = dinerItemStatusToast(item);
      if (!copy) return;
      haptic.tick();
      toast(copy.message, copy.icon);
      notifyAway(`Order ${order.reference}`, copy.message, `order-item-${item.id}`);
    },
    [toast],
  );

  const ingest = useCallback(
    (incoming: Order[]) => {
      for (const order of incoming) {
        const previous = lastStatus.current.get(order.id);
        lastStatus.current.set(order.id, order.status);
        if (previous && previous !== order.status) {
          announce(order);
          if (order.status === 'COMPLETED') track('order_completed', { orderId: order.id });
        }
        for (const item of order.items) {
          const key = `${order.id}:${item.id}`;
          const previousItemStatus = lastItemStatus.current.get(key);
          lastItemStatus.current.set(key, item.status);
          if (previousItemStatus && previousItemStatus !== item.status) announceItem(order, item);
        }
        if (needsReview(order)) {
          scheduleReviewRemind(order);
        } else {
          const timer = reviewTimers.current.get(order.id);
          if (timer) {
            clearTimeout(timer);
            reviewTimers.current.delete(order.id);
          }
        }
      }
      setOrders((prev) => mergeOrders(prev, incoming));
    },
    [announce, announceItem, scheduleReviewRemind],
  );

  const rememberOrder = useCallback(
    (order: Order) => {
      ingest([order]);
    },
    [ingest],
  );

  const reload = useCallback(() => {
    getSessionOrders(session)
      .then((next) => ingest(next))
      .catch(() => {
        /* a failed poll must not blank the last known tickets */
      })
      .finally(() => setReady(true));
  }, [session, ingest]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const timers = reviewTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  // Live: one socket per open ticket. Mock: the same poll the status screen
  // used to own, so leaving that screen does not go silent.
  const openKey = orders
    .filter((o) => isOpenOrder(o.status))
    .map((o) => o.id)
    .sort()
    .join(',');

  useEffect(() => {
    if (IS_LIVE_API) {
      const ids = openKey ? openKey.split(',') : [];
      const stops = ids.map((id) =>
        subscribeToOrder(id, session.anonymousSessionToken, (order) => ingest([order]), reload),
      );
      return () => {
        for (const stop of stops) stop();
      };
    }
    const timer = setInterval(reload, POLL_MS);
    return () => clearInterval(timer);
  }, [openKey, session.anonymousSessionToken, ingest, reload]);

  const value = useMemo<SessionOrdersValue>(() => ({ orders, ready, rememberOrder }), [orders, ready, rememberOrder]);

  return <SessionOrdersContext.Provider value={value}>{children}</SessionOrdersContext.Provider>;
}

function mergeOrders(prev: Order[], incoming: Order[]): Order[] {
  const byId = new Map(prev.map((o) => [o.id, o]));
  for (const order of incoming) byId.set(order.id, order);
  return [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
