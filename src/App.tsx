import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useStore } from "@/hooks/useStore";
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
import NotFound from "@/pages/NotFound";
import InvoicePublic from "@/pages/InvoicePublic";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading: authLoading } = useAuth();
  const { storeId, loading: storeLoading } = useStore();

  if (authLoading || storeLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/invoice/:id" element={<InvoicePublic />} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    );
  }

  if (!storeId) {
    return (
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/invoicing" element={<Invoicing />} />
        <Route path="/stock" element={<StockSummary />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/loyalty" element={<Loyalty />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="/auth" element={<Navigate to="/" replace />} />
      <Route path="/onboarding" element={<Navigate to="/" replace />} />
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
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
