import { Outlet, Link, useNavigate } from "react-router-dom";
import { ShoppingBag, Search, Menu, X, Instagram, Youtube, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/useCart";
import { fetchInStockShopProducts } from "@/lib/shopProducts";

export default function ShopLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [brands, setBrands] = useState<string[]>([]);
  const [brandsOpen, setBrandsOpen] = useState(false);
  const { cartCount } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    (async () => {
      const data = await fetchInStockShopProducts();
      if (!active) return;
      const set = new Set<string>();
      for (const p of data as any[]) {
        if ((p.photo_url || p.video_url) && p.brand?.trim()) set.add(p.brand.trim());
      }
      setBrands([...set].sort((a, b) => a.localeCompare(b)));
    })();
    return () => {
      active = false;
    };
  }, []);


  return (
    <div className="min-h-screen bg-background">

      {/* Announcement Banner */}
      <div className="sticky top-0 z-[60] bg-primary text-primary-foreground text-xs sm:text-sm font-medium overflow-hidden">
        <div className="whitespace-nowrap py-2 animate-marquee">
          <span className="inline-block px-8">
            We deal in original brand surplus and rejections • NO COD, NO RETURN, NO EXCHANGE, NO REFUND POLICY • We encourage every customer to physically visit the store, try the product and then buy it.
          </span>
          <span className="inline-block px-8">
            We deal in original brand surplus and rejections • NO COD, NO RETURN, NO EXCHANGE, NO REFUND POLICY • We encourage every customer to physically visit the store, try the product and then buy it.
          </span>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-[34px] sm:top-[36px] z-50 bg-card/95 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="font-display text-xl font-bold text-foreground tracking-tight shrink-0">
            Originee
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
            <Link to="/category/all" className="hover:text-foreground transition-colors">All Products</Link>
            <Link to="/category/Jeans" className="hover:text-foreground transition-colors">Jeans</Link>
            <Link to="/category/T-shirt" className="hover:text-foreground transition-colors">T-Shirts</Link>
            <Link to="/category/Jacket" className="hover:text-foreground transition-colors">Jackets</Link>

            {/* Brands mega dropdown */}
            <div
              className="relative"
              onMouseEnter={() => setBrandsOpen(true)}
              onMouseLeave={() => setBrandsOpen(false)}
            >
              <button className="flex items-center gap-1 hover:text-foreground transition-colors">
                Brands
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {brandsOpen && brands.length > 0 && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full pt-3 z-50">
                  <div className="bg-card border border-border rounded-lg shadow-lg p-4 w-[min(70vw,640px)] max-h-[60vh] overflow-y-auto grid grid-cols-3 gap-x-6 gap-y-1">
                    {brands.map((b) => (
                      <Link
                        key={b}
                        to={`/category/all?brand=${encodeURIComponent(b)}`}
                        className="block py-1 text-sm text-muted-foreground hover:text-foreground truncate"
                        onClick={() => setBrandsOpen(false)}
                      >
                        {b}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/category/all")}>
              <Search className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="relative" onClick={() => navigate("/cart")}>
              <ShoppingBag className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t border-border bg-card px-4 py-3 space-y-1">
            {["Home:/", "All Products:/category/all", "Jeans:/category/Jeans", "T-Shirts:/category/T-shirt", "Jackets:/category/Jacket"].map((item) => {
              const [label, path] = item.split(":");
              return (
                <Link
                  key={path}
                  to={path}
                  className="block py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {label}
                </Link>
              );
            })}
            {brands.length > 0 && (
              <div className="pt-2 border-t border-border">
                <button
                  className="flex w-full items-center justify-between py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setBrandsOpen(!brandsOpen)}
                >
                  Brands
                  <ChevronDown className={`h-4 w-4 transition-transform ${brandsOpen ? "rotate-180" : ""}`} />
                </button>
                {brandsOpen && (
                  <div className="max-h-60 overflow-y-auto grid grid-cols-2 gap-x-4">
                    {brands.map((b) => (
                      <Link
                        key={b}
                        to={`/category/all?brand=${encodeURIComponent(b)}`}
                        className="block py-1.5 text-sm text-muted-foreground hover:text-foreground truncate"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setBrandsOpen(false);
                        }}
                      >
                        {b}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </nav>
        )}
      </header>

      {/* Content */}
      <main>
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-foreground text-background/70 mt-16">
        <div className="container mx-auto px-4 py-12 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="font-display text-lg font-bold text-background mb-3">Originee</h3>
            <p className="text-sm leading-relaxed">
              Premium menswear for the modern gentleman. Quality fabrics, contemporary designs.
            </p>
          </div>
          <div>
            <h4 className="font-display font-semibold text-background mb-3">Quick Links</h4>
            <div className="space-y-2 text-sm">
              <Link to="/" className="block hover:text-background transition-colors">Home</Link>
              <Link to="/category/all" className="block hover:text-background transition-colors">All Products</Link>
              <Link to="/cart" className="block hover:text-background transition-colors">Cart</Link>
            </div>
          </div>
          <div>
            <h4 className="font-display font-semibold text-background mb-3">Contact</h4>
            <p className="text-sm">Phone: +91 93109 04557, +91 88828 66833</p>
            <p className="text-sm mt-1">Email: originee-store@gmail.com</p>
            <div className="flex items-center gap-3 mt-3">
              <a href="https://www.instagram.com/origi_nee/" target="_blank" rel="noopener noreferrer" className="hover:text-background transition-colors">
                <Instagram className="h-5 w-5" />
              </a>
              <a href="https://www.youtube.com/@originee-store" target="_blank" rel="noopener noreferrer" className="hover:text-background transition-colors">
                <Youtube className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>
        <div className="border-t border-background/10 py-4 text-center text-xs text-background/50">
          © {new Date().getFullYear()} Originee. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
