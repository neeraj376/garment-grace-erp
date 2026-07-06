import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, SlidersHorizontal, X } from "lucide-react";
import ProductCard from "@/components/shop/ProductCard";
import { groupVariants } from "@/lib/variantUtils";
import { fetchInStockShopProducts } from "@/lib/shopProducts";

// Flexible matchers for hero category slugs -> any matching DB category/subcategory
const SLUG_CATEGORIES: Record<string, string[]> = {
  Shirt: ["shirt", "shirts", "full sleeve shirt", "linen shirts", "linen shirt"],
  Blazzer: ["blazzer", "blazer"],
  Jeans: ["jean", "jeans"],
  "T-shirt": ["t-shirt", "t-shirts", "tshirt", "polo", "polo t-shirt", "polo t- shirt", "roundneck"],
  Jacket: ["jacket", "windcheater"],
  Hoodie: ["hoodie", "sweatshirt", "sweater", "zipper"],
  Pants: ["pant", "trouser", "cargo pants", "linen pants", "jogger", "lower", "cotton", "dry fit"],
  Trousers: ["pant", "trouser", "cargo pants", "linen pants"],
  Shorts: ["short", "shorts", "denim shorts", "cotton shorts"],
  Underwear: ["underwear", "vest"],
};

export default function ShopCategory() {
  const { slug } = useParams<{ slug: string }>();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [selectedCategory, setSelectedCategory] = useState(slug === "all" ? "all" : slug ?? "all");

  // New filters
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [priceMax, setPriceMax] = useState<string>("");
  const [priceMin, setPriceMin] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    setSelectedCategory(slug === "all" ? "all" : slug ?? "all");
    // reset filters on category change
    setSelectedSubcategories([]);
    setSelectedSizes([]);
    setSelectedColors([]);
    setSelectedBrands([]);
    setPriceMin("");
    setPriceMax("");
  }, [slug]);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      const allData = await fetchInStockShopProducts();
      const all = allData.filter((p: any) => p.photo_url || p.video_url);

      let result = all;
      if (selectedCategory && selectedCategory !== "all") {
        const allowed = SLUG_CATEGORIES[selectedCategory] ?? [selectedCategory.toLowerCase()];
        result = all.filter((p: any) => {
          const c = (p.category ?? "").trim().toLowerCase();
          return allowed.includes(c);
        });
      }
      setProducts(result);
      setLoading(false);

      const unique = [...new Set(all.map((d: any) => d.category).filter(Boolean))].sort() as string[];
      setCategories(unique);
    };
    fetchProducts();
  }, [selectedCategory]);

  // Derive facet options from the current category's products
  const facets = useMemo(() => {
    const subs = new Set<string>();
    const sizes = new Set<string>();
    const colors = new Set<string>();
    const brands = new Set<string>();
    products.forEach((p) => {
      if (p.subcategory?.trim()) subs.add(p.subcategory.trim());
      if (p.size?.trim()) sizes.add(p.size.trim());
      if (p.color?.trim()) colors.add(p.color.trim());
      if (p.brand?.trim()) brands.add(p.brand.trim());
    });
    return {
      subs: [...subs].sort(),
      sizes: [...sizes].sort(),
      colors: [...colors].sort(),
      brands: [...brands].sort(),
    };
  }, [products]);

  const toggle = (list: string[], setList: (v: string[]) => void, val: string) => {
    setList(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);
  };

  const clearAll = () => {
    setSelectedSubcategories([]);
    setSelectedSizes([]);
    setSelectedColors([]);
    setSelectedBrands([]);
    setPriceMin("");
    setPriceMax("");
    setSearch("");
  };

  const activeCount =
    selectedSubcategories.length +
    selectedSizes.length +
    selectedColors.length +
    selectedBrands.length +
    (priceMin ? 1 : 0) +
    (priceMax ? 1 : 0);

  const filtered = useMemo(() => {
    let result = products;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.brand?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q)
      );
    }

    if (selectedSubcategories.length) {
      const set = new Set(selectedSubcategories.map((s) => s.toLowerCase()));
      result = result.filter((p) => p.subcategory && set.has(p.subcategory.trim().toLowerCase()));
    }
    if (selectedSizes.length) {
      const set = new Set(selectedSizes.map((s) => s.toLowerCase()));
      result = result.filter((p) => p.size && set.has(p.size.trim().toLowerCase()));
    }
    if (selectedColors.length) {
      const set = new Set(selectedColors.map((s) => s.toLowerCase()));
      result = result.filter((p) => p.color && set.has(p.color.trim().toLowerCase()));
    }
    if (selectedBrands.length) {
      const set = new Set(selectedBrands.map((s) => s.toLowerCase()));
      result = result.filter((p) => p.brand && set.has(p.brand.trim().toLowerCase()));
    }
    const min = priceMin ? Number(priceMin) : null;
    const max = priceMax ? Number(priceMax) : null;
    if (min !== null) result = result.filter((p) => Number(p.selling_price) >= min);
    if (max !== null) result = result.filter((p) => Number(p.selling_price) <= max);

    let groups = groupVariants(result);
    if (sortBy === "price_low") groups = [...groups].sort((a, b) => a.minPrice - b.minPrice);
    else if (sortBy === "price_high") groups = [...groups].sort((a, b) => b.maxPrice - a.maxPrice);
    else if (sortBy === "name") groups = [...groups].sort((a, b) => a.primary.name.localeCompare(b.primary.name));
    return groups;
  }, [products, search, sortBy, selectedSubcategories, selectedSizes, selectedColors, selectedBrands, priceMin, priceMax]);

  const FilterChipRow = ({
    title,
    options,
    selected,
    onToggle,
  }: {
    title: string;
    options: string[];
    selected: string[];
    onToggle: (v: string) => void;
  }) => {
    if (!options.length) return null;
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</p>
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => {
            const active = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onToggle(opt)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:border-primary"
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="font-display text-2xl md:text-3xl font-bold mb-6">
        {selectedCategory === "all" ? "All Products" : selectedCategory}
      </h1>

      {/* Top bar */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full md:w-44">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="price_low">Price: Low to High</SelectItem>
            <SelectItem value="price_high">Price: High to Low</SelectItem>
            <SelectItem value="name">Name A-Z</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() => setShowFilters((v) => !v)}
          className="md:w-auto gap-2"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-1">{activeCount}</Badge>
          )}
        </Button>
      </div>

      {/* Quick subcategory chips (always visible when available) */}
      {facets.subs.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedSubcategories([])}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              selectedSubcategories.length === 0
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:border-primary"
            }`}
          >
            All
          </button>
          {facets.subs.map((s) => {
            const active = selectedSubcategories.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggle(selectedSubcategories, setSelectedSubcategories, s)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:border-primary"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      )}

      {/* Expanded filters panel */}
      {showFilters && (
        <div className="mb-6 p-4 border border-border rounded-lg bg-card space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm">Refine results</p>
            {activeCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1 h-8">
                <X className="h-3 w-3" /> Clear all
              </Button>
            )}
          </div>

          <FilterChipRow
            title="Subcategory"
            options={facets.subs}
            selected={selectedSubcategories}
            onToggle={(v) => toggle(selectedSubcategories, setSelectedSubcategories, v)}
          />
          <FilterChipRow
            title="Size"
            options={facets.sizes}
            selected={selectedSizes}
            onToggle={(v) => toggle(selectedSizes, setSelectedSizes, v)}
          />
          <FilterChipRow
            title="Color"
            options={facets.colors}
            selected={selectedColors}
            onToggle={(v) => toggle(selectedColors, setSelectedColors, v)}
          />
          <FilterChipRow
            title="Brand"
            options={facets.brands}
            selected={selectedBrands}
            onToggle={(v) => toggle(selectedBrands, setSelectedBrands, v)}
          />

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Price (₹)</p>
            <div className="flex items-center gap-2 max-w-sm">
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Min"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Max"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-muted-foreground">Loading products...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">No products found.</div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">{filtered.length} products</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((g) => (
              <ProductCard
                key={g.key}
                product={g.primary}
                colors={g.colors}
                sizes={g.sizes}
                minPrice={g.minPrice}
                maxPrice={g.maxPrice}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
