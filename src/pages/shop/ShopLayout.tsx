import { Outlet, Link, useNavigate } from "react-router-dom";
import { ShoppingBag, Search, Menu, X, Instagram, Youtube } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/useCart";

export default function ShopLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { cartCount } = useCart();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">

      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-md border-b border-border">
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
          </div>
        </div>
        <div className="border-t border-background/10 py-4 text-center text-xs text-background/50">
          © {new Date().getFullYear()} Originee. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
