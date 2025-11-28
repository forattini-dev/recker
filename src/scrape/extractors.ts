/**
 * Built-in Extractors
 *
 * Modular functions for extracting structured data from HTML.
 */

import type { CheerioAPI } from 'cheerio';
import type {
  ExtractedLink,
  ExtractedImage,
  ExtractedMeta,
  OpenGraphData,
  TwitterCardData,
  JsonLdData,
  ExtractedForm,
  ExtractedFormField,
  ExtractedTable,
  ExtractedScript,
  ExtractedStyle,
  LinkExtractionOptions,
  ImageExtractionOptions,
} from './types.js';

/**
 * Resolve a URL against a base URL
 */
function resolveUrl(url: string | undefined, baseUrl?: string): string {
  if (!url) return '';
  if (!baseUrl) return url;

  try {
    // Already absolute URL
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
      return url;
    }
    // Resolve relative URL
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

/**
 * Classify link type based on href
 */
function classifyLinkType(href: string, baseUrl?: string): ExtractedLink['type'] {
  if (!href) return undefined;

  if (href.startsWith('mailto:')) return 'mailto';
  if (href.startsWith('tel:')) return 'tel';
  if (href.startsWith('#')) return 'anchor';

  if (baseUrl) {
    try {
      const base = new URL(baseUrl);
      const link = new URL(href, baseUrl);
      return link.hostname === base.hostname ? 'internal' : 'external';
    } catch {
      return undefined;
    }
  }

  // Without baseUrl, check if it looks absolute
  if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
    return 'external';
  }

  return 'internal';
}

/**
 * Extract all links from HTML
 */
export function extractLinks(
  $: CheerioAPI,
  options?: LinkExtractionOptions & { baseUrl?: string }
): ExtractedLink[] {
  const selector = options?.selector || 'a[href]';
  const links: ExtractedLink[] = [];

  $(selector).each((_, element) => {
    const $el = $(element);
    let href = $el.attr('href') || '';

    // Resolve to absolute if requested
    if (options?.absolute && options?.baseUrl) {
      href = resolveUrl(href, options.baseUrl);
    }

    links.push({
      href,
      text: $el.text().trim(),
      rel: $el.attr('rel'),
      target: $el.attr('target'),
      title: $el.attr('title'),
      type: classifyLinkType(href, options?.baseUrl),
    });
  });

  return links;
}

/**
 * Extract all images from HTML
 */
export function extractImages(
  $: CheerioAPI,
  options?: ImageExtractionOptions & { baseUrl?: string }
): ExtractedImage[] {
  const selector = options?.selector || 'img[src]';
  const images: ExtractedImage[] = [];

  $(selector).each((_, element) => {
    const $el = $(element);
    let src = $el.attr('src') || '';

    // Resolve to absolute if requested
    if (options?.absolute && options?.baseUrl) {
      src = resolveUrl(src, options.baseUrl);
    }

    const width = $el.attr('width');
    const height = $el.attr('height');

    images.push({
      src,
      alt: $el.attr('alt'),
      title: $el.attr('title'),
      width: width ? parseInt(width, 10) : undefined,
      height: height ? parseInt(height, 10) : undefined,
      srcset: $el.attr('srcset'),
      loading: $el.attr('loading') as 'lazy' | 'eager' | undefined,
    });
  });

  return images;
}

/**
 * Extract meta tags from HTML
 */
export function extractMeta($: CheerioAPI): ExtractedMeta {
  const meta: ExtractedMeta = {};

  // Get title from <title> tag
  meta.title = $('title').first().text().trim() || undefined;

  // Get charset
  const charsetMeta = $('meta[charset]').attr('charset');
  if (charsetMeta) {
    meta.charset = charsetMeta;
  } else {
    // Try Content-Type charset
    const contentType = $('meta[http-equiv="Content-Type"]').attr('content');
    if (contentType) {
      const charsetMatch = contentType.match(/charset=([^;]+)/i);
      if (charsetMatch) {
        meta.charset = charsetMatch[1].trim();
      }
    }
  }

  // Get canonical URL
  const canonical = $('link[rel="canonical"]').attr('href');
  if (canonical) {
    meta.canonical = canonical;
  }

  // Get common meta tags
  $('meta[name]').each((_, element) => {
    const $el = $(element);
    const name = $el.attr('name')?.toLowerCase();
    const content = $el.attr('content');

    if (!name || !content) return;

    switch (name) {
      case 'description':
        meta.description = content;
        break;
      case 'keywords':
        meta.keywords = content.split(',').map((k) => k.trim()).filter(Boolean);
        break;
      case 'author':
        meta.author = content;
        break;
      case 'robots':
        meta.robots = content;
        break;
      case 'viewport':
        meta.viewport = content;
        break;
      default:
        // Store other meta tags
        meta[name] = content;
    }
  });

  return meta;
}

/**
 * Extract OpenGraph data from HTML
 */
export function extractOpenGraph($: CheerioAPI): OpenGraphData {
  const og: OpenGraphData = {};
  const images: string[] = [];

  $('meta[property^="og:"]').each((_, element) => {
    const $el = $(element);
    const property = $el.attr('property');
    const content = $el.attr('content');

    if (!property || !content) return;

    const key = property.replace('og:', '');

    switch (key) {
      case 'title':
        og.title = content;
        break;
      case 'type':
        og.type = content;
        break;
      case 'url':
        og.url = content;
        break;
      case 'image':
        images.push(content);
        break;
      case 'description':
        og.description = content;
        break;
      case 'site_name':
        og.siteName = content;
        break;
      case 'locale':
        og.locale = content;
        break;
      default:
        // Store other OG properties (convert snake_case to camelCase for common ones)
        og[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = content;
    }
  });

  // Set image(s)
  if (images.length === 1) {
    og.image = images[0];
  } else if (images.length > 1) {
    og.image = images;
  }

  return og;
}

/**
 * Extract Twitter Card data from HTML
 */
export function extractTwitterCard($: CheerioAPI): TwitterCardData {
  const twitter: TwitterCardData = {};

  $('meta[name^="twitter:"]').each((_, element) => {
    const $el = $(element);
    const name = $el.attr('name');
    const content = $el.attr('content');

    if (!name || !content) return;

    const key = name.replace('twitter:', '');

    switch (key) {
      case 'card':
        twitter.card = content as TwitterCardData['card'];
        break;
      case 'site':
        twitter.site = content;
        break;
      case 'creator':
        twitter.creator = content;
        break;
      case 'title':
        twitter.title = content;
        break;
      case 'description':
        twitter.description = content;
        break;
      case 'image':
        twitter.image = content;
        break;
      default:
        twitter[key] = content;
    }
  });

  return twitter;
}

/**
 * Extract JSON-LD structured data from HTML
 */
export function extractJsonLd($: CheerioAPI): JsonLdData[] {
  const results: JsonLdData[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const content = $(element).html();
    if (!content) return;

    try {
      const data = JSON.parse(content);

      // Handle @graph arrays
      if (data['@graph'] && Array.isArray(data['@graph'])) {
        results.push(...data['@graph']);
      } else if (Array.isArray(data)) {
        results.push(...data);
      } else {
        results.push(data);
      }
    } catch {
      // Invalid JSON, skip
    }
  });

  return results;
}

/**
 * Extract forms from HTML
 */
export function extractForms($: CheerioAPI, selector?: string): ExtractedForm[] {
  const forms: ExtractedForm[] = [];
  const formSelector = selector || 'form';

  $(formSelector).each((_, formElement) => {
    const $form = $(formElement);
    const fields: ExtractedFormField[] = [];

    // Extract input fields
    $form.find('input, select, textarea').each((_, fieldElement) => {
      const $field = $(fieldElement);
      const tagName = fieldElement.tagName?.toLowerCase();
      const type = $field.attr('type') || (tagName === 'textarea' ? 'textarea' : tagName === 'select' ? 'select' : 'text');

      const field: ExtractedFormField = {
        name: $field.attr('name'),
        type,
        value: $field.val() as string | undefined,
        placeholder: $field.attr('placeholder'),
        required: $field.attr('required') !== undefined,
      };

      // For select elements, extract options
      if (tagName === 'select') {
        field.options = [];
        $field.find('option').each((_, optionElement) => {
          const $option = $(optionElement);
          field.options!.push({
            value: $option.attr('value') || $option.text(),
            text: $option.text().trim(),
          });
        });
      }

      fields.push(field);
    });

    forms.push({
      action: $form.attr('action'),
      method: $form.attr('method')?.toUpperCase(),
      name: $form.attr('name'),
      id: $form.attr('id'),
      fields,
    });
  });

  return forms;
}

/**
 * Extract tables from HTML
 */
export function extractTables($: CheerioAPI, selector?: string): ExtractedTable[] {
  const tables: ExtractedTable[] = [];
  const tableSelector = selector || 'table';

  $(tableSelector).each((_, tableElement) => {
    const $table = $(tableElement);
    const headers: string[] = [];
    const rows: string[][] = [];

    // Get caption
    const caption = $table.find('caption').first().text().trim() || undefined;

    // Extract headers from thead or first tr with th
    const $headerCells = $table.find('thead th, thead td, tr:first-child th');
    if ($headerCells.length > 0) {
      $headerCells.each((_, th) => {
        headers.push($(th).text().trim());
      });
    }

    // Extract rows
    const $rows = $table.find('tbody tr, tr').not(':has(th):not(:first-child)');
    $rows.each((_, tr) => {
      const row: string[] = [];
      $(tr).find('td').each((_, td) => {
        row.push($(td).text().trim());
      });
      if (row.length > 0) {
        rows.push(row);
      }
    });

    // If no thead, first row might be headers
    if (headers.length === 0 && rows.length > 0) {
      const $firstRowCells = $table.find('tr:first-child td, tr:first-child th');
      if ($firstRowCells.length > 0) {
        $firstRowCells.each((_, cell) => {
          headers.push($(cell).text().trim());
        });
        // Remove first row from data if it was used as headers
        if ($table.find('tr:first-child th').length > 0) {
          // First row had th elements, it's definitely headers
        } else {
          // Ambiguous - keep first row as data too
          const firstRow: string[] = [];
          $table.find('tr:first-child td').each((_, td) => {
            firstRow.push($(td).text().trim());
          });
          if (firstRow.length > 0 && !rows.some(r => r.join('') === firstRow.join(''))) {
            rows.unshift(firstRow);
          }
        }
      }
    }

    tables.push({ headers, rows, caption });
  });

  return tables;
}

/**
 * Extract scripts from HTML
 */
export function extractScripts($: CheerioAPI): ExtractedScript[] {
  const scripts: ExtractedScript[] = [];

  $('script').each((_, element) => {
    const $el = $(element);
    const src = $el.attr('src');
    const inline = !src ? $el.html()?.trim() : undefined;

    // Skip empty inline scripts
    if (!src && !inline) return;

    scripts.push({
      src,
      type: $el.attr('type'),
      async: $el.attr('async') !== undefined,
      defer: $el.attr('defer') !== undefined,
      inline,
    });
  });

  return scripts;
}

/**
 * Extract stylesheets from HTML
 */
export function extractStyles($: CheerioAPI): ExtractedStyle[] {
  const styles: ExtractedStyle[] = [];

  // External stylesheets
  $('link[rel="stylesheet"]').each((_, element) => {
    const $el = $(element);
    styles.push({
      href: $el.attr('href'),
      media: $el.attr('media'),
    });
  });

  // Inline styles
  $('style').each((_, element) => {
    const $el = $(element);
    const inline = $el.html()?.trim();
    if (inline) {
      styles.push({
        media: $el.attr('media'),
        inline,
      });
    }
  });

  return styles;
}
