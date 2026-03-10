import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCart } from "@/hooks/useCart";

export default function ShopPaymentResult() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const status = params.get("status");
  const isSuccess = status === "success";

  // Clear cart after successful payment
  useEffect(() => {
    if (isSuccess) {
      clearCart();
    }
  }, [isSuccess, clearCart]);
  return (
    <div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full text-center">
        <CardContent className="pt-8 pb-6 space-y-4">
          {isSuccess ? (
            <>
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
              <h1 className="font-display text-2xl font-bold">Payment Successful!</h1>
              <p className="text-muted-foreground">Your order has been confirmed. You'll receive updates on your registered email.</p>
            </>
          ) : (
            <>
              <XCircle className="h-16 w-16 text-destructive mx-auto" />
              <h1 className="font-display text-2xl font-bold">Payment Failed</h1>
              <p className="text-muted-foreground">Something went wrong with the payment. Please try again or contact support.</p>
            </>
          )}
          <div className="flex gap-3 justify-center pt-2">
            <Button onClick={() => navigate("/shop/account")}>View Orders</Button>
            <Button variant="outline" onClick={() => navigate("/shop")}>Continue Shopping</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
