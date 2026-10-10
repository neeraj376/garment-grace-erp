// Runs before `vite dev` and `vite build` (predev/prebuild hooks); writes public/sitemap.xml.

import { writeFileSync } from "fs"
import { resolve } from "path"

const BASE_URL = "https://originee-store.com"

interface SitemapEntry {
  path: string
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never"
  priority?: string
}

// Every public, indexable route of the storefront.
// Category slugs mirror the home-page category tiles (HERO_CATEGORIES + stable extras).
const entries: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/category/all", changefreq: "weekly", priority: "0.9" },
  { path: "/category/Shirt", priority: "0.8" },
  { path: "/category/T-shirt", priority: "0.8" },
  { path: "/category/Jeans", priority: "0.8" },
  { path: "/category/Pants", priority: "0.8" },
  { path: "/category/Shorts", priority: "0.8" },
  { path: "/category/Linen%20Pants", priority: "0.8" },
  { path: "/category/Linen%20Shorts", priority: "0.8" },
  { path: "/category/Linen%20Shirts", priority: "0.8" },
  { path: "/category/Linen%20Blend%20Shirts", priority: "0.7" },
  { path: "/category/Denim%20Jeans", priority: "0.7" },
  { path: "/category/Denim%20Shorts", priority: "0.7" },
  { path: "/category/Denim%20Shirts", priority: "0.7" },
  { path: "/category/Cargo%20Pants", priority: "0.7" },
  { path: "/category/Blazzer", priority: "0.8" },
  { path: "/category/Jacket", priority: "0.8" },
  { path: "/category/Hoodie", priority: "0.8" },
  { path: "/category/Underwear", priority: "0.8" },
  { path: "/category/Footwear", priority: "0.8" },
  { path: "/category/Polo", priority: "0.7" },
  { path: "/category/Jogger", priority: "0.7" },
  { path: "/category/Kids", priority: "0.7" },
  { path: "/category/Dry%20Fit", priority: "0.7" },
  { path: "/category/Upper", priority: "0.7" },
  { path: "/category/Chino", priority: "0.7" },
  { path: "/category/Cap", priority: "0.6" },
  { path: "/category/Towel", priority: "0.6" },
  { path: "/category/Bag", priority: "0.6" },
  { path: "/category/Scarf", priority: "0.6" },
  { path: "/category/Legging", priority: "0.6" },
  { path: "/category/Windcheater", priority: "0.6" },
  { path: "/category/Shacket", priority: "0.6" },
]

function generateSitemap(entries: SitemapEntry[]) {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n"),
  )

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n")
}

writeFileSync(resolve("public/sitemap.xml"), generateSitemap(entries) + "\n")
console.log(`sitemap.xml written (${entries.length} entries)`)
