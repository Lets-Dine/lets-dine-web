import { useEffect, useRef } from 'react';
import { BrowserRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { AuthProvider } from './state/AuthContext';
import { ToastProvider } from './state/ToastContext';
import { Cart } from './routes/Cart';
import { Checkout } from './routes/Checkout';
import { DishDetail } from './routes/DishDetail';
import { Entry } from './routes/Entry';
import { Menu } from './routes/Menu';
import { NotFound } from './routes/NotFound';
import { OrderHistory } from './routes/OrderHistory';
import { OrderStatus } from './routes/OrderStatus';
import { RestaurantLayout } from './routes/RestaurantLayout';
import { ReviewFlow } from './routes/ReviewFlow';
import { AdminLayout } from './routes/admin/AdminLayout';
import { Analytics } from './routes/admin/Analytics';
import { Categories } from './routes/admin/Categories';
import { Dashboard } from './routes/admin/Dashboard';
import { DishEditor } from './routes/admin/DishEditor';
import { MenuBoard } from './routes/admin/MenuBoard';
import { Orders } from './routes/admin/Orders';
import { Reviews } from './routes/admin/Reviews';
import { Settings } from './routes/admin/Settings';
import { SignIn } from './routes/admin/SignIn';
import { Tables } from './routes/admin/Tables';

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
      main.setAttribute('tabindex', '-1');
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
          <Routes>
            <Route path="/" element={<Entry />} />
            {/* The QR encodes only the restaurant slug and an opaque table token. */}
            <Route path="/r/:slug/t/:token" element={<RestaurantLayout />}>
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
              <Route path="categories" element={<Categories />} />
              <Route path="tables" element={<Tables />} />
              <Route path="reviews" element={<Reviews />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
