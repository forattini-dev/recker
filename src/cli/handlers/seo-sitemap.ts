/**
 * SEO Sitemap Handler
 *
 * Fetch and display sitemap.xml contents.
 */

import {
  withHandler,
  colors,
} from '../output.js'
import { normalizeUrl } from './seo-serp.js'

export const sitemapHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let url = ctx.result.positional.url as string

    if (!url) {
      const base = extCtx?.baseUrl?.()
      if (base) {
        url = base
      } else {
        out.error('Usage: sitemap <url> or set base URL first')
        return
      }
    }

    url = normalizeUrl(url)

    const sitemapUrl = url.endsWith('.xml') ? url : new URL('/sitemap.xml', url).toString()

    let response: Response
    if (extCtx?.client) {
      response = await extCtx.client.get(sitemapUrl)
    } else {
      response = await fetch(sitemapUrl)
    }

    const text = await response.text()

    if (response.status === 404) {
      out.warn(`No sitemap found at ${sitemapUrl}`)
      return
    }

    // Parse URLs from XML
    const urlMatches = text.match(/<loc>([^<]+)<\/loc>/g) || []
    const urls = urlMatches.map(m => m.replace(/<\/?loc>/g, ''))

    const result = {
      url: sitemapUrl,
      totalUrls: urls.length,
      sample: urls.slice(0, 10),
    }

    // Shell: structured response
    if (extCtx) {
      out.response(result, { responseType: 'sitemap' })
    } else {
      // CLI: formatted output
      out.title('Sitemap Analysis', '🗺️')
      out.keyValue({
        URL: sitemapUrl,
        'Total URLs': urls.length,
      })
      out.blank()

      if (urls.length > 0) {
        out.subtitle('Sample URLs')
        out.list(urls.slice(0, 10))
        if (urls.length > 10) {
          out.log(colors.gray(`  ... and ${urls.length - 10} more`))
        }
        out.blank()
      }
    }
  }
)
