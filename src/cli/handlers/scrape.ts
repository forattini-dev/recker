/**
 * Scrape Commands (Unified)
 *
 * Web scraping tools migrated to the unified command system.
 * These handlers work in both CLI and TUI modes.
 */

import type { RekCommandDefinition, RekHandler } from '../handler-types.js'
import {
  withHandler,
  getString,
  getBoolean,
  colors,
} from '../output.js'

/**
 * Normalize URL (add https:// if missing)
 */
function normalizeUrl(url: string): string {
  return url.startsWith('http') ? url : `https://${url}`
}

// =============================================================================
// Scrape Handler
// =============================================================================

export const scrapeHandler: RekHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let url = getString(ctx.result.positional.url)

    if (!url) {
      // Try to get base URL from shell context
      if (extCtx?.baseUrl) {
        const base = extCtx.baseUrl()
        if (base) {
          url = base
        } else {
          out.error('Usage: scrape <url> or set base URL first')
          return
        }
      } else {
        out.error('URL is required')
        return
      }
    }

    url = normalizeUrl(url)

    // Parse options
    const selector = getString(ctx.result.options.select)
    const attr = getString(ctx.result.options.attr)
    const extractLinks = getBoolean(ctx.result.options.links)
    const extractImages = getBoolean(ctx.result.options.images)
    const extractMeta = getBoolean(ctx.result.options.meta)
    const extractTables = getBoolean(ctx.result.options.tables)
    const extractScripts = getBoolean(ctx.result.options.scripts)
    const extractJsonLd = getBoolean(ctx.result.options.jsonld)

    out.log(colors.gray(`Fetching ${url}...`))

    const { ScrapeDocument } = await import('../../scrape/document.js')

    // Get HTTP client from extended context or create one
    let html: string
    if (extCtx?.client) {
      const res = await extCtx.client.get(url)
      html = await res.text()
    } else {
      const { createClient } = await import('../../core/client.js')
      const client = createClient()
      const res = await client.get(url)
      html = await res.text()
    }

    const doc = await ScrapeDocument.create(html, { baseUrl: url })

    // Check if any extraction flag is set
    const hasExtraction = selector || extractLinks || extractImages || extractMeta || extractTables || extractScripts || extractJsonLd

    // Default: show basic page info
    if (!hasExtraction) {
      const title = doc.text('title') || 'N/A'
      const description = doc.attr('meta[name="description"]', 'content') || 'N/A'
      const h1 = doc.text('h1') || 'N/A'
      const linkCount = doc.links().length
      const imageCount = doc.images().length

      if (extCtx) {
        out.response({
          title,
          description: description.slice(0, 100),
          h1,
          links: linkCount,
          images: imageCount,
        }, { responseType: 'scrape' })
      } else {
        out.title('Page Info', '📄')
        out.keyValue({
          Title: title,
          Description: description.length > 100 ? description.slice(0, 100) + '...' : description,
          H1: h1,
          Links: linkCount,
          Images: imageCount,
        })
      }
      return
    }

    // CSS Selector extraction
    if (selector) {
      if (attr) {
        const values = doc.attrs(selector, attr)
        if (extCtx) {
          out.response({ selector, attr, count: values.length, values: values.slice(0, 50) }, { responseType: 'scrape' })
        } else {
          out.title(`Found ${values.length} values for "${attr}" in "${selector}"`)
          out.numberedList(values.slice(0, 50).filter(Boolean))
          if (values.length > 50) out.info(`... and ${values.length - 50} more`)
        }
      } else {
        const texts = doc.texts(selector)
        if (extCtx) {
          out.response({ selector, count: texts.length, texts: texts.slice(0, 50) }, { responseType: 'scrape' })
        } else {
          out.title(`Found ${texts.length} elements matching "${selector}"`)
          out.numberedList(texts.slice(0, 50).map(t => t.trim()).filter(Boolean).map(t => t.slice(0, 200)))
          if (texts.length > 50) out.info(`... and ${texts.length - 50} more`)
        }
      }
      return
    }

    // Extract links
    if (extractLinks) {
      const links = doc.links()
      if (extCtx) {
        out.response({ type: 'links', count: links.length, data: links.slice(0, 50) }, { responseType: 'scrape' })
      } else {
        out.title(`Found ${links.length} links`)
        for (const link of links.slice(0, 50)) {
          const text = (link.text || '').trim().slice(0, 50) || '[no text]'
          out.log(`  ${colors.cyan(text)}`)
          out.log(`  ${colors.gray(link.href)}`)
          out.blank()
        }
        if (links.length > 50) out.info(`... and ${links.length - 50} more`)
      }
      return
    }

    // Extract images
    if (extractImages) {
      const images = doc.images()
      if (extCtx) {
        out.response({ type: 'images', count: images.length, data: images.slice(0, 30) }, { responseType: 'scrape' })
      } else {
        out.title(`Found ${images.length} images`)
        for (const img of images.slice(0, 30)) {
          const alt = img.alt || '[no alt]'
          out.log(`  ${colors.cyan(alt.slice(0, 50))}`)
          out.log(`  ${colors.gray(img.src)}`)
          out.blank()
        }
        if (images.length > 30) out.info(`... and ${images.length - 30} more`)
      }
      return
    }

    // Extract meta tags
    if (extractMeta) {
      const meta = doc.meta()
      const entries = Object.entries(meta)
      if (extCtx) {
        out.response({ type: 'meta', count: entries.length, data: meta }, { responseType: 'scrape' })
      } else {
        out.title(`Found ${entries.length} meta entries`)
        for (const [name, content] of entries) {
          if (name && content) {
            const value = String(content)
            out.log(`  ${colors.cyan(name)}: ${value.slice(0, 100)}${value.length > 100 ? '...' : ''}`)
          }
        }
      }
      return
    }

    // Extract tables
    if (extractTables) {
      const tables = doc.tables()
      if (extCtx) {
        out.response({ type: 'tables', count: tables.length, data: tables.slice(0, 5) }, { responseType: 'scrape' })
      } else {
        out.title(`Found ${tables.length} tables`)
        for (let i = 0; i < Math.min(tables.length, 5); i++) {
          const table = tables[i]
          out.subtitle(`Table ${i + 1}: ${table.rows?.length || 0} rows`)
          out.json((table.rows || []).slice(0, 10))
          if ((table.rows?.length || 0) > 10) out.info(`... and ${(table.rows?.length || 0) - 10} more rows`)
          out.blank()
        }
      }
      return
    }

    // Extract scripts
    if (extractScripts) {
      const scripts = doc.scripts()
      const external = scripts.filter(s => s.src)
      const inline = scripts.filter(s => !s.src)
      if (extCtx) {
        out.response({ type: 'scripts', external: external.length, inline: inline.length, data: external.slice(0, 20) }, { responseType: 'scrape' })
      } else {
        out.title(`Found ${external.length} external scripts, ${inline.length} inline`)
        if (external.length > 0) {
          out.section('External Scripts')
          out.numberedList(external.slice(0, 20).map(s => s.src || ''))
          if (external.length > 20) out.info(`... and ${external.length - 20} more`)
        }
      }
      return
    }

    // Extract JSON-LD
    if (extractJsonLd) {
      const jsonld = doc.jsonLd()
      if (extCtx) {
        out.response({ type: 'jsonld', count: jsonld.length, data: jsonld }, { responseType: 'scrape' })
      } else {
        out.title(`Found ${jsonld.length} JSON-LD blocks`)
        for (let i = 0; i < jsonld.length; i++) {
          const data = jsonld[i] as Record<string, unknown>
          out.subtitle(`Block ${i + 1}: ${data['@type'] || 'Unknown type'}`)
          out.json(data)
          out.blank()
        }
      }
      return
    }
  }
)

/**
 * Scrape command definition for unified CLI
 */
export const scrapeCommands: RekCommandDefinition = {
  description: 'Web scraping tools',
  category: 'web',
  tuiEnabled: true,
  commands: {
    scrape: {
      description: 'Extract data from web pages using CSS selectors',
      aliases: ['extract'],
      positional: [
        { name: 'url', required: true, description: 'URL to scrape' }
      ],
      options: {
        select: { short: 's', type: 'string', description: 'CSS selector' },
        attr: { short: 'a', type: 'string', description: 'Extract attribute' },
        links: { short: 'L', type: 'boolean', description: 'Extract links' },
        images: { short: 'I', type: 'boolean', description: 'Extract images' },
        meta: { short: 'M', type: 'boolean', description: 'Extract meta tags' },
        tables: { short: 'T', type: 'boolean', description: 'Extract tables' },
        scripts: { short: 'S', type: 'boolean', description: 'Extract scripts' },
        jsonld: { type: 'boolean', description: 'Extract JSON-LD' },
      },
      examples: [
        { cmd: 'rek scrape example.com', desc: 'Show basic page info' },
        { cmd: 'rek scrape example.com -s "h1"', desc: 'Extract all h1 text' },
        { cmd: 'rek scrape example.com --links', desc: 'Get all links' },
      ],
      handler: scrapeHandler
    }
  }
}
