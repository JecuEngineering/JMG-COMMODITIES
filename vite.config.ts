import react from '@vitejs/plugin-react'
import { rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// Adds canonical/og:url tags and writes sitemap.xml + robots.txt at build time
// when VITE_SITE_URL is set (e.g. https://jmgcommodities.com).
function publicSitePlugin(rawSiteUrl: string): Plugin {
  const base = rawSiteUrl.trim().replace(/\/+$/, '')
  const image = `${base}/JMG%20TRUCKS.jpg`

  return {
    name: 'jmg-public-site',
    apply: 'build',
    transformIndexHtml(html) {
      if (!base) return html
      const tags = [
        `<link rel="canonical" href="${base}/" />`,
        `<meta property="og:url" content="${base}/" />`,
      ].join('\n    ')
      return html
        .replace('</head>', `  ${tags}\n  </head>`)
        .replaceAll('content="/JMG TRUCKS.jpg"', `content="${image}"`)
    },
    async closeBundle() {
      const sitemapPath = resolve('dist/sitemap.xml')
      if (!base) {
        await rm(sitemapPath, { force: true })
        return
      }
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${base}/</loc>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`
      const robots = `User-agent: *
Allow: /
Disallow: /app
Disallow: /login

Sitemap: ${base}/sitemap.xml
`
      await writeFile(sitemapPath, sitemap)
      await writeFile(resolve('dist/robots.txt'), robots)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), publicSitePlugin(env.VITE_SITE_URL ?? '')],
  }
})
