import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { StoreProvider, useStore } from "@/hooks/useStore";
import { CartProvider } from "@/hooks/useCart";
import { ShopVisitorProvider } from "@/hooks/useShopVisitor";
import { ShopVisitorGate } from "@/components/shop/ShopVisitorGate";
import { PermissionsProvider, usePermissions } from "@/hooks/usePermissions";
import AppLayout from "@/components/layout/AppLayout";
import Auth from "@/pages/Auth";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import Inventory from "@/pages/Inventory";
import Invoicing from "@/pages/Invoicing";
import Customers from "@/pages/Customers";
import StockSummary from "@/pages/StockSummary";
import Loyalty from "@/pages/Loyalty";
import Reports from "@/pages/Reports";
import Employees from "@/pages/Employees";
import SettingsPage from "@/pages/SettingsPage";
import PhotoManager from "@/pages/PhotoManager";
import Marketing from "@/pages/Marketing";
import WhatsAppRotation from "@/pages/WhatsAppRotation";
import StickerPrinter from "@/pages/StickerPrinter";
import Expenses from "@/pages/Expenses";
import ShippingCalculator from "@/pages/ShippingCalculator";
import NotFound from "@/pages/NotFound";
import InvoicePublic from "@/pages/InvoicePublic";
import AddressCollection from "@/pages/AddressCollection";

// Shop pages
import ShopLayout from "@/pages/shop/ShopLayout";
import ShopHome from "@/pages/shop/ShopHome";
import ShopCategory from "@/pages/shop/ShopCategory";
import ShopProduct from "@/pages/shop/ShopProduct";
import ShopCart from "@/pages/shop/ShopCart";
import ShopCheckout from "@/pages/shop/ShopCheckout";
import ShopLogin from "@/pages/shop/ShopLogin";
import ShopAccount from "@/pages/shop/ShopAccount";
import ShopPaymentResult from "@/pages/shop/ShopPaymentResult";

const queryClient = new QueryClient();

function BareAddressTokenRedirect() {
  const { token } = useParams<{ token: string }>();
  if (!token) return <NotFound />;

  // Handles two WhatsApp template shapes:
  //   /<64hex>           (base URL ended with "/")
  //   /address<64hex>    (base URL was "https://originee-store.com/address" with no trailing slash)
  const stripped = token.toLowerCase().startsWith("address")
    ? token.slice("address".length)
    : token;

  if (!/^[a-f0-9]{64}$/i.test(stripped)) {
    return <NotFound />;
  }

  return <Navigate to={`/address/${stripped}`} replace />;
}

function ProtectedAdminRoute({
  allowed,
  fallbackPath,
  children,
}: {
  allowed: boolean;
  fallbackPath: string;
  children: React.ReactNode;
}) {
  if (!allowed) return <Navigate to={fallbackPath} replace />;
  return <>{children}</>;
}

function NoAdminAccess() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 text-center">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Access not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask the account owner to enable access to an administrator section.
        </p>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user, loading: authLoading } = useAuth();
  const { storeId, loading: storeLoading } = useStore();
  const permissions = usePermissions();

  const isLoading = authLoading || (Boolean(user) && (storeLoading || permissions.loading));

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Shop routes (always accessible) — gated by mobile-OTP verification
  const shopRoutes = (
    <Route path="/" element={<ShopVisitorGate><ShopLayout /></ShopVisitorGate>}>
      <Route index element={<ShopHome />} />
      <Route path="category/:slug" element={<ShopCategory />} />
      <Route path="product/:id" element={<ShopProduct />} />
      <Route path="cart" element={<ShopCart />} />
      <Route path="checkout" element={<ShopCheckout />} />
      <Route path="login" element={<ShopLogin />} />
      <Route path="account" element={<ShopAccount />} />
      <Route path="payment-result" element={<ShopPaymentResult />} />
    </Route>
  );

  if (!user) {
    return (
      <Routes>
        <Route path="/administrator/auth" element={<Auth />} />
        <Route path="/invoice/:id" element={<InvoicePublic />} />
        <Route path="/address/:token" element={<AddressCollection />} />
        
        {shopRoutes}
        <Route path="/administrator/*" element={<Navigate to="/administrator/auth" replace />} />
        <Route path="/:token" element={<BareAddressTokenRedirect />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    );
  }

  if (!storeId) {
    return (
      <Routes>
        <Route path="/administrator/onboarding" element={<Onboarding />} />
        <Route path="/address/:token" element={<AddressCollection />} />
        {shopRoutes}
        <Route path="/administrator/*" element={<Navigate to="/administrator/onboarding" replace />} />
        <Route path="/:token" element={<BareAddressTokenRedirect />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    );
  }

  // Determine default page for staff (first allowed module)
  const defaultStaffPage = (() => {
    const p = permissions;
    if (p.role === "owner") return null; // owners get Dashboard
    if (p.can_dashboard) return null; // staff with dashboard access
    if (p.can_invoicing) return "invoicing";
    if (p.can_inventory) return "inventory";
    if (p.can_customers) return "customers";
    if (p.can_photos) return "photos";
    if (p.can_stock_summary) return "stock";
    if (p.can_loyalty) return "loyalty";
    if (p.can_reports) return "reports";
    if (p.can_employees) return "employees";
    if (p.can_settings) return "settings";
    return "access-denied";
  })();

  const defaultAdminPath = defaultStaffPage
    ? `/administrator/${defaultStaffPage}`
    : "/administrator";
  const canAccess = (permission: boolean) => permissions.role === "owner" || permission;

  return (
    <Routes>
      <Route path="/administrator" element={<AppLayout />}>
        <Route index element={defaultStaffPage ? <Navigate to={`/administrator/${defaultStaffPage}`} replace /> : <Dashboard />} />
        <Route path="access-denied" element={<NoAdminAccess />} />
        <Route path="inventory" element={<ProtectedAdminRoute allowed={canAccess(permissions.can_inventory)} fallbackPath={defaultAdminPath}><Inventory /></ProtectedAdminRoute>} />
        <Route path="invoicing" element={<ProtectedAdminRoute allowed={canAccess(permissions.can_invoicing)} fallbackPath={defaultAdminPath}><Invoicing /></ProtectedAdminRoute>} />
        <Route path="stock" element={<ProtectedAdminRoute allowed={canAccess(permissions.can_stock_summary)} fallbackPath={defaultAdminPath}><StockSummary /></ProtectedAdminRoute>} />
        <Route path="customers" element={<ProtectedAdminRoute allowed={canAccess(permissions.can_customers)} fallbackPath={defaultAdminPath}><Customers /></ProtectedAdminRoute>} />
        <Route path="loyalty" element={<ProtectedAdminRoute allowed={canAccess(permissions.can_loyalty)} fallbackPath={defaultAdminPath}><Loyalty /></ProtectedAdminRoute>} />
        <Route path="reports" element={<ProtectedAdminRoute allowed={canAccess(permissions.can_reports)} fallbackPath={defaultAdminPath}><Reports /></ProtectedAdminRoute>} />
        <Route path="employees" element={<ProtectedAdminRoute allowed={canAccess(permissions.can_employees)} fallbackPath={defaultAdminPath}><Employees /></ProtectedAdminRoute>} />
        <Route path="settings" element={<ProtectedAdminRoute allowed={canAccess(permissions.can_settings)} fallbackPath={defaultAdminPath}><SettingsPage /></ProtectedAdminRoute>} />
        <Route path="photos" element={<ProtectedAdminRoute allowed={canAccess(permissions.can_photos)} fallbackPath={defaultAdminPath}><PhotoManager /></ProtectedAdminRoute>} />
        <Route path="marketing" element={<ProtectedAdminRoute allowed={canAccess(permissions.can_customers)} fallbackPath={defaultAdminPath}><Marketing /></ProtectedAdminRoute>} />
        <Route path="whatsapp-rotation" element={<ProtectedAdminRoute allowed={permissions.role === "owner"} fallbackPath={defaultAdminPath}><WhatsAppRotation /></ProtectedAdminRoute>} />
        <Route path="stickers" element={<ProtectedAdminRoute allowed={canAccess(permissions.can_print_stickers)} fallbackPath={defaultAdminPath}><StickerPrinter /></ProtectedAdminRoute>} />
        <Route path="expenses" element={<ProtectedAdminRoute allowed={permissions.role === "owner"} fallbackPath={defaultAdminPath}><Expenses /></ProtectedAdminRoute>} />
        <Route path="shipping-calculator" element={<ProtectedAdminRoute allowed={canAccess(permissions.can_shipping_calculator)} fallbackPath={defaultAdminPath}><ShippingCalculator /></ProtectedAdminRoute>} />
      </Route>
      {shopRoutes}
      <Route path="/administrator/auth" element={<Navigate to="/administrator" replace />} />
      <Route path="/administrator/onboarding" element={<Navigate to="/administrator" replace />} />
      <Route path="/invoice/:id" element={<InvoicePublic />} />
      <Route path="/address/:token" element={<AddressCollection />} />
      <Route path="/:token" element={<BareAddressTokenRedirect />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <StoreProvider>
            <PermissionsProvider>
              <CartProvider>
                <ShopVisitorProvider>
                  <AppRoutes />
                </ShopVisitorProvider>
              </CartProvider>
            </PermissionsProvider>
          </StoreProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
