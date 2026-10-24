import { useEffect, useRef } from 'react';
import features from './content/features.json';
import { Feature } from './routes/Feature';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { AuthProvider } from './state/AuthContext';
import { AdminThemeProvider } from './state/AdminTheme';
import { ToastProvider } from './state/ToastContext';
import { Cart } from './routes/Cart';
import { Checkout } from './routes/Checkout';
import { DishDetail } from './routes/DishDetail';
import { DishDetailV2 } from './routes/DishDetailV2';
import { GetStarted } from './routes/GetStarted';
import { Landing } from './routes/Landing';
import { Pricing } from './routes/Pricing';
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
import { CategoriesV2 } from './routes/admin/CategoriesV2';
import { CourierDetail } from './routes/admin/CourierDetail';
import { Customers } from './routes/admin/Customers';
import { CustomerDetail } from './routes/admin/CustomerDetail';
import { Delivery } from './routes/admin/Delivery';
import { Dashboard } from './routes/admin/Dashboard';
import { DashboardV2 } from './routes/admin/DashboardV2';
import { DishEditor } from './routes/admin/DishEditor';
import { DishEditorV2 } from './routes/admin/DishEditorV2';
import { MenuBoard } from './routes/admin/MenuBoard';
import { Orders } from './routes/admin/Orders';
import { OrdersV2 } from './routes/admin/OrdersV2';
import { StockTake } from './routes/admin/StockTake';
import { BuyList } from './routes/admin/BuyList';
import { Watchlist } from './routes/admin/Watchlist';
import { Inventory } from './routes/admin/Inventory';
import { Suppliers } from './routes/admin/Suppliers';
import { SupplierDetail } from './routes/admin/SupplierDetail';
import { Ledger } from './routes/admin/Ledger';
import { LedgerHistory } from './routes/admin/LedgerHistory';
import { PaymentModes } from './routes/admin/PaymentModes';
import { Payments } from './routes/admin/Payments';
import { Sales } from './routes/admin/Sales';
import { Receivables } from './routes/admin/Receivables';
import { DishMargins } from './routes/admin/DishMargins';
import { DishPerformance } from './routes/admin/DishPerformance';
import { Waste } from './routes/admin/Waste';
import { Recurring } from './routes/admin/Recurring';
import { ProfitLossPage } from './routes/admin/ProfitLoss';
import { Transactions } from './routes/admin/Transactions';
import { Plan } from './routes/admin/Plan';
import { Referrals } from './routes/admin/Referrals';
import { Reviews } from './routes/admin/Reviews';
import { Settings } from './routes/admin/Settings';
import { SignIn } from './routes/admin/SignIn';
import { Staff } from './routes/admin/Staff';
import { Tables } from './routes/admin/Tables';
import { TablesV2 } from './routes/admin/TablesV2';
import { Floors } from './routes/admin/Floors';
import { FloorDetail } from './routes/admin/FloorDetail';
import { TableDetail } from './routes/admin/TableDetail';
import { TableDetailV2 } from './routes/admin/TableDetailV2';
import { PlatformLayout } from './routes/platform/PlatformLayout';
import { PlatformSignIn } from './routes/platform/PlatformSignIn';
import { PlatformRestaurants } from './routes/platform/Restaurants';
import { PlatformOverview } from './routes/platform/Overview';
import { PlatformRestaurantNew } from './routes/platform/RestaurantNew';
import { PlatformRestaurantDetail } from './routes/platform/RestaurantDetail';
import { PlatformBilling } from './routes/platform/Billing';
import { PlatformPlans } from './routes/platform/Plans';
import { PlatformPhotos } from './routes/platform/Photos';
import { PlatformFeedback } from './routes/platform/Feedback';
import { PlatformActivity } from './routes/platform/Activity';
import { PlatformSettingsPage } from './routes/platform/Settings';

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
  const lastPath = useRef(location.pathname);

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
    // A same-page replace (opening a row writes `?sale=…`, a filter writes its query) is not a new screen:
    // the reader stays where they are, and focus stays where it was.
    const samePage = navigationType === 'REPLACE' && lastPath.current === location.pathname;
    lastPath.current = location.pathname;
    if (samePage) return;

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
  }, [location.key, location.pathname, navigationType]);

  return null;
}

/** The original dish page is the default; `?v=2` previews the redesigned one. */
function DishPage() {
  return new URLSearchParams(useLocation().search).get('v') === '2' ? <DishDetailV2 /> : <DishDetail />;
}

/** The redesigned admin dish editor is the default; `?v=1` brings back the original. */
function DishEditorPage() {
  return new URLSearchParams(useLocation().search).get('v') === '1' ? <DishEditor /> : <DishEditorV2 />;
}

/** The redesigned table page is the default; `?v=1` brings back the original. */
function TableDetailPage() {
  return new URLSearchParams(useLocation().search).get('v') === '1' ? <TableDetail /> : <TableDetailV2 />;
}

/** The redesigned tables list is the default; `?v=1` brings back the original. */
function TablesPage() {
  return new URLSearchParams(useLocation().search).get('v') === '1' ? <Tables /> : <TablesV2 />;
}

/** The redesigned orders page is the default; `?v=1` brings back the original. */
function OrdersPage() {
  return new URLSearchParams(useLocation().search).get('v') === '1' ? <Orders /> : <OrdersV2 />;
}

/** The redesigned dashboard is the default; `?v=1` brings back the original. */
function DashboardPage() {
  return new URLSearchParams(useLocation().search).get('v') === '1' ? <Dashboard /> : <DashboardV2 />;
}

/** The redesigned categories page is the default; `?v=1` brings back the original. */
function CategoriesPage() {
  return new URLSearchParams(useLocation().search).get('v') === '1' ? <Categories /> : <CategoriesV2 />;
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
              <Route path="/pricing" element={<Pricing />} />
              {features.map((f) => (
                <Route key={f.slug} path={`/${f.slug}`} element={<Feature slug={f.slug} />} />
              ))}
              {/* Stands in for the physical QR code on the table — the live product starts at /r/:slug/t/:token. */}
              {/* <Route path="/demo" element={<Entry />} /> */}
              {/* The QR encodes only the restaurant slug and an opaque table token. */}
              <Route path="/r/:slug/t/:token" element={<RestaurantLayout kind="table" />}>
                <Route index element={<Menu />} />
                <Route path="d/:dishId" element={<DishPage />} />
                <Route path="cart" element={<Cart />} />
                <Route path="checkout" element={<Checkout />} />
                <Route path="orders" element={<OrderHistory />} />
                <Route path="order/:orderId" element={<OrderStatus />} />
                <Route path="order/:orderId/review" element={<ReviewFlow />} />
              </Route>

              {/* §16b — one QR for a whole floor; no single table, so a room is picked right after landing. */}
              <Route path="/r/:slug/f/:token" element={<RestaurantLayout kind="floor" />}>
                <Route index element={<Menu />} />
                <Route path="d/:dishId" element={<DishPage />} />
                <Route path="cart" element={<Cart />} />
                <Route path="checkout" element={<Checkout />} />
                <Route path="orders" element={<OrderHistory />} />
                <Route path="order/:orderId" element={<OrderStatus />} />
                <Route path="order/:orderId/review" element={<ReviewFlow />} />
              </Route>

              {/* Delivery: no QR, no table — same layout, session starts from a phone number instead. */}
              <Route path="/r/:slug/delivery" element={<RestaurantLayout kind="delivery" />}>
                <Route index element={<Menu />} />
                <Route path="d/:dishId" element={<DishPage />} />
                <Route path="cart" element={<Cart />} />
                <Route path="checkout" element={<Checkout />} />
                <Route path="orders" element={<OrderHistory />} />
                <Route path="order/:orderId" element={<OrderStatus />} />
                <Route path="order/:orderId/review" element={<ReviewFlow />} />
              </Route>

              {/* The restaurant side: same store, same rules, different job. */}
              <Route path="/admin/signin" element={<SignIn />} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="menu" element={<MenuBoard />} />
                <Route path="menu/:dishId" element={<DishEditorPage />} />
                <Route path="add-ons" element={<AddOns />} />
                <Route path="categories" element={<CategoriesPage />} />
                <Route path="tables" element={<TablesPage />} />
                <Route path="tables/:tableId" element={<TableDetailPage />} />
                <Route path="floors" element={<Floors />} />
                <Route path="floors/:floorId" element={<FloorDetail />} />
                <Route path="delivery" element={<Delivery />} />
                <Route path="delivery/partners/:id" element={<CourierDetail kind="partner" />} />
                <Route path="delivery/riders/:id" element={<CourierDetail kind="rider" />} />
                <Route path="customers" element={<Customers />} />
                <Route path="customers/:id" element={<CustomerDetail />} />
                <Route path="sales" element={<Sales />} />
                <Route path="receivables" element={<Receivables />} />
                <Route path="dish-margins" element={<DishMargins />} />
                <Route path="dish-performance" element={<DishPerformance />} />
                <Route path="waste" element={<Waste />} />
                <Route path="payments" element={<Payments />} />
                <Route path="transactions" element={<Transactions />} />
                <Route path="payment-modes" element={<PaymentModes />} />
                <Route path="ledger" element={<Ledger />} />
                <Route path="ledger/transactions" element={<LedgerHistory />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="inventory/count" element={<StockTake />} />
                <Route path="inventory/buy-list" element={<BuyList />} />
                <Route path="inventory/watchlist" element={<Watchlist />} />
                <Route path="suppliers" element={<Suppliers />} />
                <Route path="suppliers/:name" element={<SupplierDetail />} />
                <Route path="inventory/margins" element={<Navigate to="/admin/inventory/watchlist" replace />} />
                <Route path="inventory/quality" element={<Navigate to="/admin/inventory/watchlist" replace />} />
                <Route path="reviews" element={<Reviews />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="profit-loss" element={<ProfitLossPage />} />
                <Route path="recurring" element={<Recurring />} />
                <Route path="branches" element={<Branches />} />
                <Route path="branches/:branchId" element={<BranchDetail />} />
                <Route path="staff" element={<Staff />} />
                <Route path="audit" element={<AuditLog />} />
                <Route path="plan" element={<Plan />} />
                <Route path="referrals" element={<Referrals />} />
                <Route path="settings" element={<Settings />} />
              </Route>

              <Route path="/platform/signin" element={<PlatformSignIn />} />
              <Route path="/platform" element={<PlatformLayout />}>
                <Route index element={<PlatformOverview />} />
                <Route path="restaurants" element={<PlatformRestaurants />} />
                <Route path="restaurants/new" element={<PlatformRestaurantNew />} />
                <Route path="restaurants/:id" element={<PlatformRestaurantDetail />} />
                <Route path="billing" element={<PlatformBilling />} />
                <Route path="plans" element={<PlatformPlans />} />
                <Route path="photos" element={<PlatformPhotos />} />
                <Route path="feedback" element={<PlatformFeedback />} />
                <Route path="activity" element={<PlatformActivity />} />
                <Route path="settings" element={<PlatformSettingsPage />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </AdminThemeProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
