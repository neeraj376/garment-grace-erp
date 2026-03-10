import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const STORE_ID = "8995a7bd-2850-4a9f-9a13-7c4b1f41ffe6";
const CART_KEY = "originee_cart";

export interface LocalCartItem {
  product_id: string;
  quantity: number;
  // Populated after fetch
  product?: {
    id: string;
    name: string;
    selling_price: number;
    mrp: number | null;
    photo_url: string | null;
    size: string | null;
    color: string | null;
    tax_rate: number;
  };
}

interface CartContextType {
  items: LocalCartItem[];
  cartCount: number;
  loading: boolean;
  addToCart: (productId: string, qty?: number) => void;
  updateQuantity: (productId: string, qty: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextType>({
  items: [],
  cartCount: 0,
  loading: false,
  addToCart: () => {},
  updateQuantity: () => {},
  removeFromCart: () => {},
  clearCart: () => {},
});

function getRawCart(): { product_id: string; quantity: number }[] {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRawCart(cart: { product_id: string; quantity: number }[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<LocalCartItem[]>([]);
  const [loading, setLoading] = useState(false);

  const hydrateProducts = useCallback(async () => {
    const raw = getRawCart();
    if (raw.length === 0) {
      setItems([]);
      return;
    }
    setLoading(true);
    const productIds = raw.map((r) => r.product_id);
    const { data: products } = await supabase
      .from("products")
      .select("id, name, selling_price, mrp, photo_url, size, color, tax_rate")
      .in("id", productIds)
      .eq("store_id", STORE_ID);

    const productMap = new Map((products ?? []).map((p) => [p.id, p]));
    const hydrated: LocalCartItem[] = raw
      .filter((r) => productMap.has(r.product_id))
      .map((r) => ({
        product_id: r.product_id,
        quantity: r.quantity,
        product: productMap.get(r.product_id)!,
      }));
    setItems(hydrated);
    setLoading(false);
  }, []);

  useEffect(() => {
    hydrateProducts();
  }, [hydrateProducts]);

  const addToCart = (productId: string, qty = 1) => {
    const raw = getRawCart();
    const existing = raw.find((r) => r.product_id === productId);
    if (existing) {
      existing.quantity += qty;
    } else {
      raw.push({ product_id: productId, quantity: qty });
    }
    saveRawCart(raw);
    hydrateProducts();
  };

  const updateQuantity = (productId: string, qty: number) => {
    if (qty <= 0) return removeFromCart(productId);
    const raw = getRawCart();
    const item = raw.find((r) => r.product_id === productId);
    if (item) item.quantity = qty;
    saveRawCart(raw);
    hydrateProducts();
  };

  const removeFromCart = (productId: string) => {
    const raw = getRawCart().filter((r) => r.product_id !== productId);
    saveRawCart(raw);
    hydrateProducts();
  };

  const clearCart = () => {
    localStorage.removeItem(CART_KEY);
    setItems([]);
  };

  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, cartCount, loading, addToCart, updateQuantity, removeFromCart, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
