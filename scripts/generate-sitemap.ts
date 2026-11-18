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
  { path: "/category/shirt", priority: "0.8" },
  { path: "/category/t-shirt", priority: "0.8" },
  { path: "/category/jeans", priority: "0.8" },
  { path: "/category/pants", priority: "0.8" },
  { path: "/category/shorts", priority: "0.8" },
  { path: "/category/linen-pants", priority: "0.8" },
  { path: "/category/linen-shorts", priority: "0.8" },
  { path: "/category/linen-shirts", priority: "0.8" },
  { path: "/category/linen-blend-shirts", priority: "0.7" },
  { path: "/category/denim-jeans", priority: "0.7" },
  { path: "/category/denim-shorts", priority: "0.7" },
  { path: "/category/denim-shirts", priority: "0.7" },
  { path: "/category/cargo-pants", priority: "0.7" },
  { path: "/category/blazzer", priority: "0.8" },
  { path: "/category/jacket", priority: "0.8" },
  { path: "/category/hoodie", priority: "0.8" },
  { path: "/category/underwear", priority: "0.8" },
  { path: "/category/footwear", priority: "0.8" },
  { path: "/category/polo", priority: "0.7" },
  { path: "/category/jogger", priority: "0.7" },
  { path: "/category/kids", priority: "0.7" },
  { path: "/category/dry-fit", priority: "0.7" },
  { path: "/category/upper", priority: "0.7" },
  { path: "/category/chino", priority: "0.7" },
  { path: "/category/cap", priority: "0.6" },
  { path: "/category/towel", priority: "0.6" },
  { path: "/category/bag", priority: "0.6" },
  { path: "/category/scarf", priority: "0.6" },
  { path: "/category/legging", priority: "0.6" },
  { path: "/category/windcheater", priority: "0.6" },
  { path: "/category/shacket", priority: "0.6" },
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
