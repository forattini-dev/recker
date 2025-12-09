/**
 * Web Scraping MCP Tool
 *
 * Provides AI agents with web scraping capabilities:
 * - CSS selector-based extraction
 * - Schema-based structured data extraction
 * - Link and image extraction
 * - Table parsing
 */

import { createClient } from '../../core/client.js';
import { ScrapeDocument } from '../../scrape/document.js';
import type { MCPTool, MCPToolResult } from '../types.js';

/**
 * Scrape a web page and extract data
 */
async function scrapeUrl(args: Record<string, unknown>): Promise<MCPToolResult> {
  const url = String(args.url || '');
  const selectors = args.selectors as Record<string, string> | undefined;
  const extract = args.extract as string[] | undefined;
  const selector = args.selector as string | undefined;

  if (!url) {
    return {
      content: [{ type: 'text', text: 'Error: url is required' }],
      isError: true,
    };
  }

  try {
    // Fetch the page
    const client = createClient({ timeout: 30000 });
    const response = await client.get(url);
    const html = await response.text();

    // Parse HTML
    const doc = await ScrapeDocument.create(html, { baseUrl: url });

    // Build result based on requested extractions
    const output: Record<string, unknown> = {
      url,
      title: doc.title(),
    };

    // If single selector provided, extract just that
    if (selector) {
      const elements = doc.selectAll(selector);
      output.results = elements.map(el => ({
        text: el.text(),
        html: el.html(),
        tag: el.tagName(),
        attrs: el.attrs(),
      }));
      output.count = elements.length;
    }

    // If selectors map provided, extract each
    if (selectors && Object.keys(selectors).length > 0) {
      const extracted: Record<string, string | string[]> = {};
      for (const [key, sel] of Object.entries(selectors)) {
        const isMultiple = sel.endsWith('[]');
        const actualSel = isMultiple ? sel.slice(0, -2) : sel;

        if (isMultiple) {
          extracted[key] = doc.texts(actualSel);
        } else {
          extracted[key] = doc.text(actualSel);
        }
      }
      output.data = extracted;
    }

    // Built-in extractions
    const extractSet = new Set(extract || []);

    if (extractSet.has('links') || extractSet.has('all')) {
      const links = doc.links({ absolute: true });
      output.links = links.slice(0, 100).map(l => ({
        href: l.href,
        text: l.text?.slice(0, 100),
        rel: l.rel,
      }));
      output.linkCount = links.length;
    }

    if (extractSet.has('images') || extractSet.has('all')) {
      const images = doc.images({ absolute: true });
      output.images = images.slice(0, 50).map(img => ({
        src: img.src,
        alt: img.alt,
        width: img.width,
        height: img.height,
      }));
      output.imageCount = images.length;
    }

    if (extractSet.has('meta') || extractSet.has('all')) {
      output.meta = doc.meta();
    }

    if (extractSet.has('og') || extractSet.has('all')) {
      output.openGraph = doc.openGraph();
    }

    if (extractSet.has('twitter') || extractSet.has('all')) {
      output.twitterCard = doc.twitterCard();
    }

    if (extractSet.has('jsonld') || extractSet.has('all')) {
      output.jsonLd = doc.jsonLd();
    }

    if (extractSet.has('tables') || extractSet.has('all')) {
      const tables = doc.tables();
      output.tables = tables.slice(0, 10).map(t => ({
        headers: t.headers,
        rows: t.rows.slice(0, 50),
      }));
      output.tableCount = tables.length;
    }

    if (extractSet.has('forms') || extractSet.has('all')) {
      output.forms = doc.forms();
    }

    if (extractSet.has('headings')) {
      output.headings = {
        h1: doc.texts('h1'),
        h2: doc.texts('h2'),
        h3: doc.texts('h3'),
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(output, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Scrape failed: ${(error as Error).message}`,
      }],
      isError: true,
    };
  }
}

export const scrapeTools: MCPTool[] = [
  {
    name: 'rek_scrape',
    description: `Scrape a web page and extract data using CSS selectors.

Supports multiple extraction modes:
- Single selector: Extract elements matching one CSS selector
- Selector map: Extract multiple fields at once
- Built-in extractors: links, images, meta, og, twitter, jsonld, tables, forms, headings

Examples:
- Get all product titles: selector=".product-title"
- Extract multiple fields: selectors={"title":"h1","price":".price","desc":".description"}
- Get all links and images: extract=["links","images"]
- Full extraction: extract=["all"]`,
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to scrape',
        },
        selector: {
          type: 'string',
          description: 'Single CSS selector to extract elements (e.g., ".product-card", "article h2")',
        },
        selectors: {
          type: 'object',
          description: 'Map of field names to CSS selectors. Add [] suffix for multiple values (e.g., {"title":"h1","links[]":"a"})',
        },
        extract: {
          type: 'array',
          items: { type: 'string' },
          description: 'Built-in extractors to run: links, images, meta, og, twitter, jsonld, tables, forms, headings, all',
        },
      },
      required: ['url'],
    },
  },
];

export const scrapeToolHandlers: Record<string, (args: Record<string, unknown>) => Promise<MCPToolResult>> = {
  rek_scrape: scrapeUrl,
};
