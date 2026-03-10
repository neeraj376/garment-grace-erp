import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useShopAuth } from "./useShopAuth";

interface CartItem {
  id: string;
  product_id: string;
  quantity: number;
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
  items: CartItem[];
  cartCount: number;
  loading: boolean;
  addToCart: (productId: string, qty?: number) => Promise<void>;
  updateQuantity: (itemId: string, qty: number) => Promise<void>;
  removeFromCart: (itemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshCart: () => Promise<void>;
}

const CartContext = createContext<CartContextType>({
  items: [],
  cartCount: 0,
  loading: false,
  addToCart: async () => {},
  updateQuantity: async () => {},
  removeFromCart: async () => {},
  clearCart: async () => {},
  refreshCart: async () => {},
});

export function CartProvider({ children }: { children: ReactNode }) {
  const { customer } = useShopAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshCart = useCallback(async () => {
    if (!customer) { setItems([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("cart_items")
      .select("id, product_id, quantity, products:product_id(id, name, selling_price, mrp, photo_url, size, color, tax_rate)")
      .eq("customer_id", customer.id);
    setItems((data as any) ?? []);
    setLoading(false);
  }, [customer]);

  useEffect(() => { refreshCart(); }, [refreshCart]);

  const addToCart = async (productId: string, qty = 1) => {
    if (!customer) return;
    const existing = items.find((i) => i.product_id === productId);
    if (existing) {
      await supabase.from("cart_items").update({ quantity: existing.quantity + qty }).eq("id", existing.id);
    } else {
      await supabase.from("cart_items").insert({ customer_id: customer.id, product_id: productId, quantity: qty });
    }
    await refreshCart();
  };

  const updateQuantity = async (itemId: string, qty: number) => {
    if (qty <= 0) return removeFromCart(itemId);
    await supabase.from("cart_items").update({ quantity: qty }).eq("id", itemId);
    await refreshCart();
  };

  const removeFromCart = async (itemId: string) => {
    await supabase.from("cart_items").delete().eq("id", itemId);
    await refreshCart();
  };

  const clearCart = async () => {
    if (!customer) return;
    await supabase.from("cart_items").delete().eq("customer_id", customer.id);
    setItems([]);
  };

  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, cartCount, loading, addToCart, updateQuantity, removeFromCart, clearCart, refreshCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
