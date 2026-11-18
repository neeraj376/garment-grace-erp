// Readable, SEO-friendly storefront URLs. Product URLs keep the id at the end
// so old /product/<uuid> links keep working.
export function slugify(input: string | null | undefined): string {
  return (input ?? "")
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function productPath(p: { id: string; name?: string | null; brand?: string | null; color?: string | null }): string {
  const name = p.name ?? "";
  const brand = p.brand && !name.toLowerCase().includes(p.brand.toLowerCase()) ? p.brand : "";
  const slug = slugify([brand, name, p.color].filter(Boolean).join(" "));
  return `/product/${slug ? `${slug}-` : ""}${p.id}`;
}

export function productIdFromParam(param: string | undefined): string | undefined {
  if (!param) return param;
  const m = param.match(UUID_RE);
  return m ? m[1].toLowerCase() : param;
}

export function categoryPath(name: string): string {
  return name === "all" ? "/category/all" : `/category/${slugify(name)}`;
}

export function prettifySlug(slug: string): string {
  return decodeURIComponent(slug).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
