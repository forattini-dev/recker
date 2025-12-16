/**
 * sitemap.xml Parser and Validator
 *
 * Parses and validates sitemap files according to the sitemaps.org protocol.
 * @see https://www.sitemaps.org/protocol.html
 */

import { parse } from '../../scrape/parser/index.js';

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
  /** Images associated with this URL */
  images?: Array <{
    loc: string;
    caption?: string;
    title?: string;
  }>;
  /** Videos associated with this URL */
  videos?: Array <{
    thumbnailLoc: string;
    title: string;
    description: string;
    contentLoc?: string;
    playerLoc?: string;
  }>;
  /** News metadata */
  news?: {
    publicationName: string;
    publicationLanguage: string;
    publicationDate: string;
    title: string;
  };
  /** Alternate language versions */
  alternates?: Array <{
    hreflang: string;
    href: string;
  }>;
}

export interface SitemapIndex {
  loc: string;
  lastmod?: string;
}

export interface SitemapParseResult {
  /** Type of sitemap */
  type: 'urlset' | 'sitemapindex' | 'unknown';
  /** Successfully parsed */
  valid: boolean;
  /** Parse errors */
  errors: string[];
  /** Parse warnings */
  warnings: string[];
  /** URLs in sitemap (for urlset) */
  urls: SitemapUrl[];
  /** Child sitemaps (for sitemapindex) */
  sitemaps: SitemapIndex[];
  /** Total URL count */
  urlCount: number;
  /** File size in bytes */
  size: number;
  /** Whether sitemap is compressed */
  compressed: boolean;
}

export interface SitemapValidationIssue {
  type: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  url?: string;
  recommendation?: string;
}

export interface SitemapValidationResult {
  valid: boolean;
  issues: SitemapValidationIssue[];
  parseResult: SitemapParseResult;
}

const VALID_CHANGEFREQ = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
const MAX_URLS_PER_SITEMAP = 50000;
const MAX_SITEMAP_SIZE = 50 * 1024 * 1024; // 50MB uncompressed

/**
 * Parse sitemap XML content
 */
export function parseSitemap(content: string, compressed = false): SitemapParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const urls: SitemapUrl[] = [];
  const sitemaps: SitemapIndex[] = [];

  let type: 'urlset' | 'sitemapindex' | 'unknown' = 'unknown';

  try {
    const root = parse(content, { lowerCaseTagName: false }); // Preserve case for XML tags
    // sitemap tags are usually lowercase.
    
    // Determine sitemap type
    if (root.querySelectorAll('urlset').length > 0) {
      type = 'urlset';

      // Parse URLs
      root.querySelectorAll('url').forEach((urlElem) => {
        const locElem = urlElem.querySelector('loc');
        const loc = locElem ? locElem.text.trim() : '';

        if (!loc) {
          errors.push('URL entry missing <loc> element');
          return;
        }

        // Validate URL
        try {
          new URL(loc);
        } catch {
          errors.push(`Invalid URL: ${loc}`);
          return;
        }

        const url: SitemapUrl = { loc };

        // Optional fields
        const lastmodElem = urlElem.querySelector('lastmod');
        const lastmod = lastmodElem ? lastmodElem.text.trim() : '';
        if (lastmod) {
          if (isValidDate(lastmod)) {
            url.lastmod = lastmod;
          } else {
            warnings.push(`Invalid lastmod date for ${loc}: ${lastmod}`);
          }
        }

        const changefreqElem = urlElem.querySelector('changefreq');
        const changefreq = changefreqElem ? changefreqElem.text.trim().toLowerCase() : '';
        if (changefreq) {
          if (VALID_CHANGEFREQ.includes(changefreq)) {
            url.changefreq = changefreq as SitemapUrl['changefreq'];
          } else {
            warnings.push(`Invalid changefreq for ${loc}: ${changefreq}`);
          }
        }

        const priorityElem = urlElem.querySelector('priority');
        const priority = priorityElem ? priorityElem.text.trim() : '';
        if (priority) {
          const p = parseFloat(priority);
          if (isNaN(p) || p < 0 || p > 1) {
            warnings.push(`Invalid priority for ${loc}: ${priority} (must be 0.0-1.0)`);
          } else {
            url.priority = p;
          }
        }

        // Parse images
        const images: SitemapUrl['images'] = [];
        // Namespaced tags like image:image might be parsed as 'image:image' or 'image' depending on parser
        // We'll try querySelectorAll with namespaces.
        // CSS selectors with namespaces usually need escaping: 'image\:image'
        
        const imageElems = urlElem.querySelectorAll('image\:image, image');
        imageElems.forEach((imgElem) => {
          const locEl = imgElem.querySelector('image\:loc, loc');
          const imgLoc = locEl ? locEl.text.trim() : '';
          
          if (imgLoc) {
            const captionEl = imgElem.querySelector('image\:caption, caption');
            const titleEl = imgElem.querySelector('image\:title, title');
            
            images.push({
              loc: imgLoc,
              caption: captionEl ? captionEl.text.trim() || undefined : undefined,
              title: titleEl ? titleEl.text.trim() || undefined : undefined,
            });
          }
        });
        if (images.length > 0) {
          url.images = images;
        }

        // Parse xhtml:link alternates
        const alternates: SitemapUrl['alternates'] = [];
        const linkElems = urlElem.querySelectorAll('xhtml\:link[rel="alternate"], link[rel="alternate"]');
        linkElems.forEach((linkElem) => {
          const hreflang = linkElem.getAttribute('hreflang');
          const href = linkElem.getAttribute('href');
          if (hreflang && href) {
            alternates.push({ hreflang, href });
          }
        });
        if (alternates.length > 0) {
          url.alternates = alternates;
        }

        urls.push(url);
      });

    } else if (root.querySelectorAll('sitemapindex').length > 0) {
      type = 'sitemapindex';

      // Parse sitemap index
      root.querySelectorAll('sitemap').forEach((sitemapElem) => {
        const locElem = sitemapElem.querySelector('loc');
        const loc = locElem ? locElem.text.trim() : '';

        if (!loc) {
          errors.push('Sitemap entry missing <loc> element');
          return;
        }

        const sitemap: SitemapIndex = { loc };

        const lastmodElem = sitemapElem.querySelector('lastmod');
        const lastmod = lastmodElem ? lastmodElem.text.trim() : '';
        if (lastmod) {
          if (isValidDate(lastmod)) {
            sitemap.lastmod = lastmod;
          } else {
            warnings.push(`Invalid lastmod date for sitemap ${loc}: ${lastmod}`);
          }
        }

        sitemaps.push(sitemap);
      });

    } else {
      errors.push('Invalid sitemap: must contain <urlset> or <sitemapindex>');
    }

  } catch (e) {
    errors.push(`XML parsing error: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }

  return {
    type,
    valid: errors.length === 0,
    errors,
    warnings,
    urls,
    sitemaps,
    urlCount: type === 'urlset' ? urls.length : sitemaps.reduce((sum, s) => sum + 1, 0),
    size: content.length,
    compressed,
  };
}

/**
 * Validate sitemap content
 */
export function validateSitemap(content: string, baseUrl?: string): SitemapValidationResult {
  const parseResult = parseSitemap(content);
  const issues: SitemapValidationIssue[] = [];

  // Convert parse errors
  for (const error of parseResult.errors) {
    issues.push({
      type: 'error',
      code: 'PARSE_ERROR',
      message: error,
    });
  }

  // Convert parse warnings
  for (const warning of parseResult.warnings) {
    issues.push({
      type: 'warning',
      code: 'PARSE_WARNING',
      message: warning,
    });
  }

  // Check URL count limit
  if (parseResult.urls.length > MAX_URLS_PER_SITEMAP) {
    issues.push({
      type: 'error',
      code: 'TOO_MANY_URLS',
      message: `Sitemap has ${parseResult.urls.length} URLs (max: ${MAX_URLS_PER_SITEMAP})`,
      recommendation: 'Split into multiple sitemaps and use a sitemap index',
    });
  }

  // Check file size
  if (parseResult.size > MAX_SITEMAP_SIZE) {
    issues.push({
      type: 'error',
      code: 'FILE_TOO_LARGE',
      message: `Sitemap is ${Math.round(parseResult.size / (1024 * 1024))}MB (max: 50MB)`,
      recommendation: 'Split into multiple sitemaps or compress with gzip',
    });
  }

  // Check for empty sitemap
  if (parseResult.type === 'urlset' && parseResult.urls.length === 0) {
    issues.push({
      type: 'warning',
      code: 'EMPTY_SITEMAP',
      message: 'Sitemap contains no URLs',
      recommendation: 'Add URLs to your sitemap for search engines to discover',
    });
  }

  if (parseResult.type === 'sitemapindex' && parseResult.sitemaps.length === 0) {
    issues.push({
      type: 'warning',
      code: 'EMPTY_INDEX',
      message: 'Sitemap index contains no sitemaps',
      recommendation: 'Add sitemap references to your sitemap index',
    });
  }

  // Check for duplicate URLs
  const seenUrls = new Set<string>();
  const duplicates: string[] = [];
  for (const url of parseResult.urls) {
    const normalized = normalizeUrl(url.loc);
    if (seenUrls.has(normalized)) {
      duplicates.push(url.loc);
    } else {
      seenUrls.add(normalized);
    }
  }
  if (duplicates.length > 0) {
    issues.push({
      type: 'warning',
      code: 'DUPLICATE_URLS',
      message: `${duplicates.length} duplicate URL(s) found`,
      recommendation: 'Remove duplicate URLs from sitemap',
    });
  }

  // Check base URL matching
  if (baseUrl) {
    const baseHost = new URL(baseUrl).hostname;
    for (const url of parseResult.urls) {
      try {
        const urlHost = new URL(url.loc).hostname;
        if (urlHost !== baseHost && !urlHost.endsWith(`.${baseHost}`)) {
          issues.push({
            type: 'warning',
            code: 'CROSS_DOMAIN_URL',
            message: `URL belongs to different domain: ${url.loc}`,
            url: url.loc,
            recommendation: 'Sitemaps should only contain URLs from the same domain',
          });
        }
      } catch {
        // Already caught in parse
      }
    }
  }

  // Check for very old lastmod dates
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  let oldDateCount = 0;
  for (const url of parseResult.urls) {
    if (url.lastmod) {
      const date = new Date(url.lastmod);
      if (!isNaN(date.getTime()) && date < oneYearAgo) {
        oldDateCount++;
      }
    }
  }
  if (oldDateCount > parseResult.urls.length * 0.5) {
    issues.push({
      type: 'info',
      code: 'OLD_LASTMOD',
      message: `${oldDateCount} URLs have lastmod dates over 1 year old`,
      recommendation: 'Consider updating lastmod dates when content changes',
    });
  }

  // Check for missing lastmod (recommended)
  const missingLastmod = parseResult.urls.filter(u => !u.lastmod).length;
  if (missingLastmod > 0 && missingLastmod === parseResult.urls.length) {
    issues.push({
      type: 'info',
      code: 'NO_LASTMOD',
      message: 'No URLs have lastmod dates',
      recommendation: 'Add lastmod dates to help search engines prioritize crawling',
    });
  }

  // Check priority distribution
  const priorities = parseResult.urls.filter(u => u.priority !== undefined).map(u => u.priority!)
  if (priorities.length > 0) {
    const allSamePriority = priorities.every(p => p === priorities[0]);
    if (allSamePriority && parseResult.urls.length > 10) {
      issues.push({
        type: 'info',
        code: 'UNIFORM_PRIORITY',
        message: `All ${priorities.length} URLs have the same priority (${priorities[0]})`,
        recommendation: 'Vary priority values to indicate relative page importance',
      });
    }
  }

  return {
    valid: issues.filter(i => i.type === 'error').length === 0,
    issues,
    parseResult,
  };
}

/**
 * Discover sitemaps from common locations and robots.txt
 */
export async function discoverSitemaps(
  baseUrl: string,
  robotsTxtContent?: string,
  fetcher?: (url: string) => Promise<{ status: number; text: string }>
): Promise<string[]> {
  const discovered: Set<string> = new Set();
  const base = new URL(baseUrl);

  // Common sitemap locations
  const commonLocations = [
    '/sitemap.xml',
    '/sitemap_index.xml',
    '/sitemap-index.xml',
    '/sitemaps.xml',
    '/sitemap1.xml',
    '/post-sitemap.xml', // WordPress
    '/page-sitemap.xml', // WordPress
  ];

  // Extract from robots.txt
  if (robotsTxtContent) {
    const lines = robotsTxtContent.split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^sitemap:\s*(.+)$/i);
      if (match) {
        try {
          const url = new URL(match[1].trim(), baseUrl).href;
          discovered.add(url);
        } catch {
          // Invalid URL
        }
      }
    }
  }

  // Optimization: If sitemaps were found in robots.txt, treat them as the authoritative source
  // and skip brute-force guessing of common filenames.
  if (discovered.size > 0) {
    return Array.from(discovered);
  }

  // Check common locations
  for (const path of commonLocations) {
    const url = new URL(path, base).href;
    try {
      let response: { status: number; text: string };
      if (fetcher) {
        response = await fetcher(url);
      } else {
        const fetchResponse = await fetch(url, { method: 'HEAD' });
        response = { status: fetchResponse.status, text: '' };
      }

      if (response.status === 200) {
        discovered.add(url);
      }
    } catch {
      // Network error, skip
    }
  }

  return Array.from(discovered);
}

/**
 * Fetch and validate a sitemap from URL
 */
export async function fetchAndValidateSitemap(
  url: string,
  fetcher?: (url: string) => Promise<{ status: number; text: string; headers?: Record<string, string> }>
): Promise<SitemapValidationResult & { exists: boolean; status?: number }> {
  try {
    let response: { status: number; text: string; headers?: Record<string, string> };

    if (fetcher) {
      response = await fetcher(url);
    } else {
      const fetchResponse = await fetch(url);
      response = {
        status: fetchResponse.status,
        text: await fetchResponse.text(),
        headers: Object.fromEntries(fetchResponse.headers.entries()),
      };
    }

    if (response.status === 404) {
      return {
        exists: false,
        status: 404,
        valid: false,
        issues: [{
          type: 'warning',
          code: 'NOT_FOUND',
          message: 'Sitemap not found (404)',
          recommendation: 'Create a sitemap.xml to help search engines discover your content',
        }],
        parseResult: {
          type: 'unknown',
          valid: false,
          errors: [],
          warnings: [],
          urls: [],
          sitemaps: [],
          urlCount: 0,
          size: 0,
          compressed: false,
        },
      };
    }

    if (response.status >= 400) {
      return {
        exists: false,
        status: response.status,
        valid: false,
        issues: [{
          type: 'error',
          code: 'FETCH_ERROR',
          message: `Failed to fetch sitemap (HTTP ${response.status})`,
        }],
        parseResult: {
          type: 'unknown',
          valid: false,
          errors: [],
          warnings: [],
          urls: [],
          sitemaps: [],
          urlCount: 0,
          size: 0,
          compressed: false,
        },
      };
    }

    const baseUrl = new URL(url).origin;
    const validation = validateSitemap(response.text, baseUrl);

    return {
      ...validation,
      exists: true,
      status: response.status,
    };
  } catch (error) {
    return {
      exists: false,
      valid: false,
      issues: [{
        type: 'error',
        code: 'FETCH_ERROR',
        message: `Failed to fetch sitemap: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }],
      parseResult: {
        type: 'unknown',
        valid: false,
        errors: [],
        warnings: [],
        urls: [],
        sitemaps: [],
        urlCount: 0,
        size: 0,
        compressed: false,
      },
    };
  }
}

// Helper functions
function isValidDate(dateString: string): boolean {
  // W3C Datetime format: YYYY-MM-DD or YYYY-MM-DDThh:mm:ssTZD
  const patterns = [
    /\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/, // Full datetime
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/, // Without seconds
  ];

  if (!patterns.some(p => p.test(dateString))) {
    return false;
  }

  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove trailing slash for comparison
    let path = parsed.pathname;
    if (path !== '/' && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return `${parsed.protocol}//${parsed.host}${path}${parsed.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}