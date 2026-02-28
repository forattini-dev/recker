/**
 * SEO Robots Handler
 *
 * Fetch and display robots.txt directives.
 */

import {
  withHandler,
  colors,
} from '../output.js'
import { normalizeUrl } from './seo-serp.js'

export const robotsHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let url = ctx.result.positional.url as string

    if (!url) {
      const base = extCtx?.baseUrl?.()
      if (base) {
        url = base
      } else {
        out.error('Usage: robots <url> or set base URL first')
        return
      }
    }

    url = normalizeUrl(url)

    const robotsUrl = new URL('/robots.txt', url).toString()

    let response: Response
    if (extCtx?.client) {
      response = await extCtx.client.get(robotsUrl)
    } else {
      response = await fetch(robotsUrl)
    }

    const text = await response.text()

    if (response.status === 404) {
      out.warn(`No robots.txt found at ${robotsUrl}`)
      return
    }

    // Parse directives
    const lines = text.split('\n')
    const directives: Array<{ agent?: string; type: string; path?: string; url?: string }> = []
    let currentAgent = '*'

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.toLowerCase().startsWith('user-agent:')) {
        currentAgent = trimmed.slice(11).trim()
      } else if (trimmed.toLowerCase().startsWith('disallow:')) {
        directives.push({ agent: currentAgent, type: 'disallow', path: trimmed.slice(9).trim() })
      } else if (trimmed.toLowerCase().startsWith('allow:')) {
        directives.push({ agent: currentAgent, type: 'allow', path: trimmed.slice(6).trim() })
      } else if (trimmed.toLowerCase().startsWith('sitemap:')) {
        directives.push({ type: 'sitemap', url: trimmed.slice(8).trim() })
      }
    }

    const result = {
      url: robotsUrl,
      rules: directives.length,
      sitemaps: directives.filter(d => d.type === 'sitemap').map(d => d.url!),
      disallowed: directives.filter(d => d.type === 'disallow').slice(0, 10).map(d => d.path!),
    }

    // Shell: structured response
    if (extCtx) {
      out.response(result, { responseType: 'robots' })
    } else {
      // CLI: formatted output
      out.title('robots.txt Analysis', '🤖')
      out.keyValue({
        URL: robotsUrl,
        Rules: directives.length,
      })
      out.blank()

      if (result.sitemaps.length > 0) {
        out.subtitle('Sitemaps')
        out.list(result.sitemaps)
        out.blank()
      }

      if (result.disallowed.length > 0) {
        out.subtitle('Disallowed Paths')
        for (const p of result.disallowed) {
          out.status('error', p)
        }
        out.blank()
      }
    }
  }
)
