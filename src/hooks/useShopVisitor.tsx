import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface ShopVisitor {
  id: string;
  name: string;
  phone: string; // normalized: 91XXXXXXXXXX
  verified_at: string;
}

interface Ctx {
  visitor: ShopVisitor | null;
  setVisitor: (v: ShopVisitor) => void;
  clear: () => void;
  ready: boolean;
}

const STORAGE_KEY = "shop_visitor_v1";

const ShopVisitorContext = createContext<Ctx>({
  visitor: null,
  setVisitor: () => {},
  clear: () => {},
  ready: false,
});

export function ShopVisitorProvider({ children }: { children: ReactNode }) {
  const [visitor, setVisitorState] = useState<ShopVisitor | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as ShopVisitor) : null;
    } catch {
      return null;
    }
  });
  const [ready, setReady] = useState(false);

  useEffect(() => { setReady(true); }, []);

  const setVisitor = (v: ShopVisitor) => {
    setVisitorState(v);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch {}
  };
  const clear = () => {
    setVisitorState(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  return (
    <ShopVisitorContext.Provider value={{ visitor, setVisitor, clear, ready }}>
      {children}
    </ShopVisitorContext.Provider>
  );
}

export function useShopVisitor() {
  return useContext(ShopVisitorContext);
}
