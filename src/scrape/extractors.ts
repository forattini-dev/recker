/**
 * Built-in Extractors
 *
 * Modular functions for extracting structured data from HTML.
 */

import { HTMLElement, NodeType } from './parser/index.js';
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
    if (
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('//')
    ) {
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
function classifyLinkType(
  href: string,
  baseUrl?: string
): ExtractedLink['type'] {
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
  if (
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('//')
  ) {
    return 'external';
  }

  return 'internal';
}

/**
 * Extract all links from HTML
 */
export function extractLinks(
  root: HTMLElement,
  options?: LinkExtractionOptions & { baseUrl?: string }
): ExtractedLink[] {
  const selector = options?.selector || 'a[href]';
  const links: ExtractedLink[] = [];

  root.querySelectorAll(selector).forEach((element) => {
    let href = element.getAttribute('href') || '';

    // Resolve to absolute if requested
    if (options?.absolute && options?.baseUrl) {
      href = resolveUrl(href, options.baseUrl);
    }

    const imgs = element.querySelectorAll('img');
    const svgs = element.querySelectorAll('svg');

    links.push({
      href,
      text: element.text.trim(),
      rel: element.getAttribute('rel'),
      target: element.getAttribute('target'),
      title: element.getAttribute('title'),
      type: classifyLinkType(href, options?.baseUrl),
      hasImage: imgs.length > 0,
      hasImageWithAlt:
        imgs.filter((img) => !!img.getAttribute('alt')?.trim()).length > 0,
      hasSvg: svgs.length > 0,
      hasSvgWithTitle:
        svgs.filter(
          (svg) =>
            svg.querySelectorAll('title').length > 0 ||
            !!svg.getAttribute('aria-label')
        ).length > 0,
      ariaLabel: element.getAttribute('aria-label'),
    });
  });

  return links;
}

/**
 * Extract all images from HTML
 */
export function extractImages(
  root: HTMLElement,
  options?: ImageExtractionOptions & { baseUrl?: string }
): ExtractedImage[] {
  const selector = options?.selector || 'img[src]';
  const images: ExtractedImage[] = [];

  root.querySelectorAll(selector).forEach((element) => {
    let src = element.getAttribute('src') || '';

    // Resolve to absolute if requested
    if (options?.absolute && options?.baseUrl) {
      src = resolveUrl(src, options.baseUrl);
    }

    const width = element.getAttribute('width');
    const height = element.getAttribute('height');

    images.push({
      src,
      alt: element.getAttribute('alt'),
      title: element.getAttribute('title'),
      width: width ? parseInt(width, 10) : undefined,
      height: height ? parseInt(height, 10) : undefined,
      srcset: element.getAttribute('srcset'),
      loading: element.getAttribute('loading') as
        | 'lazy'
        | 'eager'
        | undefined,
      decoding: element.getAttribute('decoding') as
        | 'async'
        | 'auto'
        | 'sync'
        | undefined,
    });
  });

  return images;
}

/**
 * Extract meta tags from HTML
 */
export function extractMeta(root: HTMLElement): ExtractedMeta {
  const meta: ExtractedMeta = {};

  // Get title from <title> tag
  const titleEl = root.querySelector('title');
  meta.title = titleEl ? titleEl.text.trim() || undefined : undefined;

  // Get charset
  const charsetMeta = root.querySelector('meta[charset]');
  if (charsetMeta) {
    meta.charset = charsetMeta.getAttribute('charset');
  } else {
    // Try Content-Type charset
    const contentTypeMeta = root.querySelector('meta[http-equiv="Content-Type"]');
    const contentType = contentTypeMeta
      ? contentTypeMeta.getAttribute('content')
      : null;
    if (contentType) {
      const charsetMatch = contentType.match(/charset=([^;]+)/i);
      if (charsetMatch) {
        meta.charset = charsetMatch[1].trim();
      }
    }
  }

  // Get canonical URL
  const canonicalEl = root.querySelector('link[rel="canonical"]');
  if (canonicalEl) {
    meta.canonical = canonicalEl.getAttribute('href');
  }

  // Get common meta tags
  root.querySelectorAll('meta[name]').forEach((element) => {
    const name = element.getAttribute('name')?.toLowerCase();
    const content = element.getAttribute('content');

    if (!name || !content) return;

    switch (name) {
      case 'description':
        meta.description = content;
        break;
      case 'keywords':
        meta.keywords = content
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean);
        break;
      case 'author':
        meta.author = content;
        break;
      case 'robots':
        meta.robots = content.split(',').map((r) => r.trim().toLowerCase());
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
export function extractOpenGraph(root: HTMLElement): OpenGraphData {
  const og: OpenGraphData = {};
  const images: string[] = [];

  root.querySelectorAll('meta[property^="og:"]').forEach((element) => {
    const property = element.getAttribute('property');
    const content = element.getAttribute('content');

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
export function extractTwitterCard(root: HTMLElement): TwitterCardData {
  const twitter: TwitterCardData = {};

  root.querySelectorAll('meta[name^="twitter:"]').forEach((element) => {
    const name = element.getAttribute('name');
    const content = element.getAttribute('content');

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
export function extractJsonLd(root: HTMLElement): JsonLdData[] {
  const results: JsonLdData[] = [];

  root.querySelectorAll('script[type="application/ld+json"]').forEach((element) => {
    const content = element.innerHTML;
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
export function extractForms(
  root: HTMLElement,
  selector?: string
): ExtractedForm[] {
  const forms: ExtractedForm[] = [];
  const formSelector = selector || 'form';

  root.querySelectorAll(formSelector).forEach((formElement) => {
    const fields: ExtractedFormField[] = [];

    // Extract input fields
    // querySelectorAll supports comma separated? Yes, css-select supports it.
    formElement.querySelectorAll('input, select, textarea').forEach((fieldElement) => {
      const tagName = fieldElement.tagName?.toLowerCase();
      const type =
        fieldElement.getAttribute('type') ||
        (tagName === 'textarea'
          ? 'textarea'
          : tagName === 'select'
          ? 'select'
          : 'text');
          
      let value: string | undefined = fieldElement.getAttribute('value');
      // For textarea, value is content
      if (tagName === 'textarea') {
          value = fieldElement.text;
      }

      const field: ExtractedFormField = {
        name: fieldElement.getAttribute('name'),
        type,
        value: value,
        placeholder: fieldElement.getAttribute('placeholder'),
        required: fieldElement.hasAttribute('required'),
      };

      // For select elements, extract options
      if (tagName === 'select') {
        field.options = [];
        fieldElement.querySelectorAll('option').forEach((optionElement) => {
          field.options!.push({
            value: optionElement.getAttribute('value') || optionElement.text,
            text: optionElement.text.trim(),
          });
        });
        // Update value if selected
        const selected = fieldElement.querySelector('option[selected]');
        if (selected) {
            field.value = selected.getAttribute('value') || selected.text;
        }
      }

      fields.push(field);
    });

    forms.push({
      action: formElement.getAttribute('action'),
      method: formElement.getAttribute('method')?.toUpperCase(),
      name: formElement.getAttribute('name'),
      id: formElement.getAttribute('id'),
      fields,
    });
  });

  return forms;
}

/**
 * Extract tables from HTML
 */
export function extractTables(
  root: HTMLElement,
  selector?: string
): ExtractedTable[] {
  const tables: ExtractedTable[] = [];
  const tableSelector = selector || 'table';

  root.querySelectorAll(tableSelector).forEach((tableElement) => {
    const headers: string[] = [];
    const rows: string[][] = [];

    // Get caption
    const captionEl = tableElement.querySelector('caption');
    const caption = captionEl ? captionEl.text.trim() || undefined : undefined;

    let headerRow: HTMLElement | null = null;

    // 1. Try Headers from THEAD
    const thead = tableElement.querySelector('thead');
    if (thead) {
        thead.querySelectorAll('th, td').forEach(cell => {
            headers.push(cell.text.trim());
        });
    }

    // 2. If no headers, try first TR (heuristic)
    if (headers.length === 0) {
        const tr = tableElement.querySelector('tr');
        if (tr) {
             // Use children (th or td)
             tr.childNodes.forEach(child => {
                 if (child.nodeType === NodeType.ELEMENT_NODE) {
                     const el = child as HTMLElement;
                     if (['TH', 'TD'].includes(el.tagName)) {
                        headers.push(el.text.trim());
                     }
                 }
             });
             if (headers.length > 0) {
                 headerRow = tr;
             }
        }
    }

    // Extract rows
    const allRows = tableElement.querySelectorAll('tr');
    
    allRows.forEach((tr) => {
        // Skip if inside THEAD
        if (tr.parentNode && (tr.parentNode as HTMLElement).tagName === 'THEAD') {
            return;
        }
        
        // Skip if it is the heuristically identified header row
        if (tr === headerRow) {
            return;
        }
        
        const row: string[] = [];
        tr.querySelectorAll('td, th').forEach(cell => {
            row.push(cell.text.trim());
        });
        
        if (row.length > 0) {
            rows.push(row);
        }
    });

    if (headers.length > 0 || rows.length > 0) {
      tables.push({
        caption,
        headers,
        rows,
      });
    }
  });

  return tables;
}

/**
 * Extract scripts from HTML
 */
export function extractScripts(root: HTMLElement): ExtractedScript[] {
  const scripts: ExtractedScript[] = [];

  root.querySelectorAll('script').forEach((element) => {
    const src = element.getAttribute('src');
    const inline = !src ? element.innerHTML?.trim() : undefined;

    // Skip empty inline scripts
    if (!src && !inline) return;

    scripts.push({
      src,
      type: element.getAttribute('type'),
      async: element.hasAttribute('async'),
      defer: element.hasAttribute('defer'),
      inline,
    });
  });

  return scripts;
}

/**
 * Extract stylesheets from HTML
 */
export function extractStyles(root: HTMLElement): ExtractedStyle[] {
  const styles: ExtractedStyle[] = [];

  // External stylesheets
  root.querySelectorAll('link[rel="stylesheet"]').forEach((element) => {
    styles.push({
      href: element.getAttribute('href'),
      media: element.getAttribute('media'),
    });
  });

  // Inline styles
  root.querySelectorAll('style').forEach((element) => {
    const inline = element.innerHTML?.trim();
    if (inline) {
      styles.push({
        media: element.getAttribute('media'),
        inline,
      });
    }
  });

  return styles;
}