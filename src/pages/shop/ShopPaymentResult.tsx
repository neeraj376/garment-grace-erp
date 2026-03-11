import { useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle, XCircle, Package, Home, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/useCart";
import { addDays, format } from "date-fns";

export default function ShopPaymentResult() {
  const [params] = useSearchParams();
  const { clearCart } = useCart();
  const status = params.get("status");
  const orderId = params.get("order_id");
  const isSuccess = status === "success";

  const expectedDelivery = format(addDays(new Date(), 7), "dd MMMM yyyy");

  useEffect(() => {
    if (isSuccess) {
      clearCart();
    }
  }, [isSuccess, clearCart]);

  if (isSuccess) {
    return (
      <div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-[60vh]">
        <div className="max-w-lg w-full text-center space-y-6">
          <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Thank You!</h1>
            <p className="text-xl text-muted-foreground">Your order is confirmed</p>
          </div>

          <div className="rounded-xl border bg-card p-6 space-y-4 text-left">
            <div className="flex items-start gap-3">
              <Package className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Order ID</p>
                <p className="font-mono font-semibold text-sm">{orderId || "—"}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Expected Delivery</p>
                <p className="font-semibold text-sm">{expectedDelivery}</p>
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            We'll send you shipping updates. You can also track your order from your account.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button asChild size="lg">
              <Link to="/">
                <Home className="h-4 w-4 mr-2" />
                Back to Home
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/account">View My Orders</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-[60vh]">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
          <XCircle className="h-10 w-10 text-destructive" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Payment Failed</h1>
          <p className="text-muted-foreground">Something went wrong with the payment. Please try again or contact support.</p>
        </div>
        <div className="flex gap-3 justify-center pt-2">
          <Button asChild>
            <Link to="/shop/cart">Try Again</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/shop">Go Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
