import { createContext, useContext, useMemo } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { getMenu, resolveQr } from '../api/diner';
import { buildRankContext } from '../domain/metrics';
import type { RankContext } from '../domain/metrics';
import type { DiningSession, DiningTable, Menu } from '../domain/types';
import { CartProvider } from '../state/CartContext';
import { SessionOrdersProvider } from '../state/SessionOrdersContext';
import { useAsync } from '../state/useAsync';
import { CartDock } from '../components/CartDock';
import { OrderDock } from '../components/OrderDock';
import { BootScreen, ErrorScreen } from './Shell';

interface RestaurantValue {
  menu: Menu;
  table: DiningTable;
  session: DiningSession;
  ctx: RankContext;
  base: string;
  reload: () => void;
}

const RestaurantContext = createContext<RestaurantValue | null>(null);

export function useRestaurant(): RestaurantValue {
  const ctx = useContext(RestaurantContext);
  if (!ctx) throw new Error('useRestaurant must be used inside RestaurantLayout');
  return ctx;
}

export function RestaurantLayout() {
  const { slug = '', token = '' } = useParams();

  const qr = useAsync(() => resolveQr(slug, token), [slug, token]);
  const menu = useAsync(() => getMenu(slug), [slug]);

  const value = useMemo<RestaurantValue | null>(() => {
    if (!qr.data || !menu.data) return null;
    return {
      menu: menu.data,
      table: qr.data.table,
      session: qr.data.session,
      ctx: buildRankContext(menu.data.dishes),
      base: `/r/${slug}/t/${token}`,
      reload: menu.reload,
    };
  }, [qr.data, menu.data, slug, token, menu.reload]);

  const error = qr.error ?? menu.error;
  if (error) return <ErrorScreen title="We couldn't open this table" message={error.message} />;
  if (!value) return <BootScreen />;

  return (
    <RestaurantContext.Provider value={value}>
      <CartProvider sessionId={value.session.id}>
        <SessionOrdersProvider session={value.session} base={value.base}>
          <Outlet />
          <CartDock dishes={value.menu.dishes} base={value.base} />
          <OrderDock base={value.base} />
        </SessionOrdersProvider>
      </CartProvider>
    </RestaurantContext.Provider>
  );
}
