import { useEffect, useRef } from 'react';
import { BrowserRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { AuthProvider } from './state/AuthContext';
import { AdminThemeProvider } from './state/AdminTheme';
import { ToastProvider } from './state/ToastContext';
import { Cart } from './routes/Cart';
import { Checkout } from './routes/Checkout';
import { DishDetail } from './routes/DishDetail';
import { GetStarted } from './routes/GetStarted';
import { Landing } from './routes/Landing';
import { Menu } from './routes/Menu';
import { NotFound } from './routes/NotFound';
import { OrderHistory } from './routes/OrderHistory';
import { OrderStatus } from './routes/OrderStatus';
import { RestaurantLayout } from './routes/RestaurantLayout';
import { ReviewFlow } from './routes/ReviewFlow';
import { AdminLayout } from './routes/admin/AdminLayout';
import { Analytics } from './routes/admin/Analytics';
import { AddOns } from './routes/admin/AddOns';
import { AuditLog } from './routes/admin/AuditLog';
import { BranchDetail } from './routes/admin/BranchDetail';
import { Branches } from './routes/admin/Branches';
import { Categories } from './routes/admin/Categories';
import { Customers } from './routes/admin/Customers';
import { Dashboard } from './routes/admin/Dashboard';
import { DishEditor } from './routes/admin/DishEditor';
import { MenuBoard } from './routes/admin/MenuBoard';
import { Orders } from './routes/admin/Orders';
import { Payments } from './routes/admin/Payments';
import { Reviews } from './routes/admin/Reviews';
import { Settings } from './routes/admin/Settings';
import { SignIn } from './routes/admin/SignIn';
import { Staff } from './routes/admin/Staff';
import { Tables } from './routes/admin/Tables';
import { Floors } from './routes/admin/Floors';
import { FloorDetail } from './routes/admin/FloorDetail';
import { TableDetail } from './routes/admin/TableDetail';
import { PlatformLayout } from './routes/platform/PlatformLayout';
import { PlatformSignIn } from './routes/platform/PlatformSignIn';
import { PlatformRestaurants } from './routes/platform/Restaurants';

/**
 * Scroll and focus, per navigation.
 *
 * Going somewhere new starts at the top. Coming *back* does not: a diner who
 * scrolled deep into the menu, opened a dish and returned has to land exactly
 * where they left, or every dish they inspect costs them the scroll again.
 * Same content, same place — that is what makes the back gesture safe to use.
 *
 * Restoration is deliberately instant. `scroll-behavior: smooth` is right for
 * a jump the diner asked for; watching the page fly back to a remembered
 * position is motion nobody requested.
 */
function Navigation() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map<string, number>());
  const first = useRef(true);

  useEffect(() => {
    const key = location.key;
    const remember = () => positions.current.set(key, window.scrollY);
    window.addEventListener('scroll', remember, { passive: true });
    return () => {
      // Runs before the next screen paints, so this is the last honest reading.
      remember();
      window.removeEventListener('scroll', remember);
    };
  }, [location.key]);

  useEffect(() => {
    const saved = positions.current.get(location.key);
    window.scrollTo({ top: navigationType === 'POP' && saved !== undefined ? saved : 0, behavior: 'instant' });

    // Where am I? Screen readers only find out if focus moves with the route.
    // Skipped on first paint, where the landing page already owns focus.
    if (first.current) {
      first.current = false;
      return;
    }
    const main = document.querySelector('main');
    if (main) {
      // main.setAttribute('tabindex', '-1');
      main.focus({ preventScroll: true });
    }
  }, [location.key, navigationType]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <Navigation />
      <ToastProvider>
        <AuthProvider>
          <AdminThemeProvider>
            <Routes>
              <Route path="/" element={<Landing />} />
              {/* The public, self-serve restaurant sign-up — what the landing page's "Get started" CTA points at. */}
              <Route path="/get-started" element={<GetStarted />} />
              {/* Stands in for the physical QR code on the table — the live product starts at /r/:slug/t/:token. */}
              {/* <Route path="/demo" element={<Entry />} /> */}
              {/* The QR encodes only the restaurant slug and an opaque table token. */}
              <Route path="/r/:slug/t/:token" element={<RestaurantLayout kind="table" />}>
                <Route index element={<Menu />} />
                <Route path="d/:dishId" element={<DishDetail />} />
                <Route path="cart" element={<Cart />} />
                <Route path="checkout" element={<Checkout />} />
                <Route path="orders" element={<OrderHistory />} />
                <Route path="order/:orderId" element={<OrderStatus />} />
                <Route path="order/:orderId/review" element={<ReviewFlow />} />
              </Route>

              {/* §16b — one QR for a whole floor; no single table, so a room is picked right after landing. */}
              <Route path="/r/:slug/f/:token" element={<RestaurantLayout kind="floor" />}>
                <Route index element={<Menu />} />
                <Route path="d/:dishId" element={<DishDetail />} />
                <Route path="cart" element={<Cart />} />
                <Route path="checkout" element={<Checkout />} />
                <Route path="orders" element={<OrderHistory />} />
                <Route path="order/:orderId" element={<OrderStatus />} />
                <Route path="order/:orderId/review" element={<ReviewFlow />} />
              </Route>

              {/* Delivery: no QR, no table — same layout, session starts from a phone number instead. */}
              <Route path="/r/:slug/delivery" element={<RestaurantLayout kind="delivery" />}>
                <Route index element={<Menu />} />
                <Route path="d/:dishId" element={<DishDetail />} />
                <Route path="cart" element={<Cart />} />
                <Route path="checkout" element={<Checkout />} />
                <Route path="orders" element={<OrderHistory />} />
                <Route path="order/:orderId" element={<OrderStatus />} />
                <Route path="order/:orderId/review" element={<ReviewFlow />} />
              </Route>

              {/* The restaurant side: same store, same rules, different job. */}
              <Route path="/admin/signin" element={<SignIn />} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="orders" element={<Orders />} />
                <Route path="menu" element={<MenuBoard />} />
                <Route path="menu/:dishId" element={<DishEditor />} />
                <Route path="add-ons" element={<AddOns />} />
                <Route path="categories" element={<Categories />} />
                <Route path="tables" element={<Tables />} />
                <Route path="tables/:tableId" element={<TableDetail />} />
                <Route path="floors" element={<Floors />} />
                <Route path="floors/:floorId" element={<FloorDetail />} />
                <Route path="customers" element={<Customers />} />
                <Route path="payments" element={<Payments />} />
                <Route path="reviews" element={<Reviews />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="branches" element={<Branches />} />
                <Route path="branches/:branchId" element={<BranchDetail />} />
                <Route path="staff" element={<Staff />} />
                <Route path="audit" element={<AuditLog />} />
                <Route path="settings" element={<Settings />} />
              </Route>

              <Route path="/platform/signin" element={<PlatformSignIn />} />
              <Route path="/platform" element={<PlatformLayout />}>
                <Route index element={<PlatformRestaurants />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </AdminThemeProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
