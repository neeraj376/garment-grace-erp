import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { StoreProvider, useStore } from "@/hooks/useStore";
import { CartProvider } from "@/hooks/useCart";
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
import NotFound from "@/pages/NotFound";
import InvoicePublic from "@/pages/InvoicePublic";

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

function AppRoutes() {
  const { user, loading: authLoading } = useAuth();
  const { storeId, loading: storeLoading } = useStore();
  const permissions = usePermissions();

  const isLoading = authLoading || (Boolean(user) && storeLoading);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Shop routes (always accessible)
  const shopRoutes = (
    <Route path="/" element={<ShopLayout />}>
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
        {shopRoutes}
        <Route path="/administrator/*" element={<Navigate to="/administrator/auth" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    );
  }

  if (!storeId) {
    return (
      <Routes>
        <Route path="/administrator/onboarding" element={<Onboarding />} />
        {shopRoutes}
        <Route path="/administrator/*" element={<Navigate to="/administrator/onboarding" replace />} />
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
    return "invoicing"; // fallback
  })();

  return (
    <Routes>
      <Route path="/administrator" element={<AppLayout />}>
        <Route index element={defaultStaffPage ? <Navigate to={`/administrator/${defaultStaffPage}`} replace /> : <Dashboard />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="invoicing" element={<Invoicing />} />
        <Route path="stock" element={<StockSummary />} />
        <Route path="customers" element={<Customers />} />
        <Route path="loyalty" element={<Loyalty />} />
        <Route path="reports" element={<Reports />} />
        <Route path="employees" element={<Employees />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="photos" element={<PhotoManager />} />
      </Route>
      {shopRoutes}
      <Route path="/administrator/auth" element={<Navigate to="/administrator" replace />} />
      <Route path="/administrator/onboarding" element={<Navigate to="/administrator" replace />} />
      <Route path="/invoice/:id" element={<InvoicePublic />} />
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
                <AppRoutes />
              </CartProvider>
            </PermissionsProvider>
          </StoreProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
