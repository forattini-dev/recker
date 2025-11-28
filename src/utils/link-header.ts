/**
 * RFC-8288 Link Header Parser
 * Parses HTTP Link headers for pagination, relationships, and resource hints
 *
 * @see https://www.rfc-editor.org/rfc/rfc8288.html
 */

/**
 * Represents a single link from a Link header
 */
export interface Link {
  /** The URI of the link */
  uri: string;
  /** Link relation type (e.g., "next", "prev", "canonical") */
  rel?: string;
  /** Optional anchor for the link */
  anchor?: string;
  /** Media type hint */
  type?: string;
  /** Media query for responsive hints */
  media?: string;
  /** Title for the link */
  title?: string;
  /** Language of the linked resource */
  hreflang?: string;
  /** Additional parameters */
  [key: string]: string | undefined;
}

/**
 * Collection of parsed links indexed by relation type
 */
export interface LinkCollection {
  /** All parsed links */
  all: Link[];
  /** Links indexed by rel type */
  [rel: string]: Link | Link[] | undefined;
}

/**
 * Parse a Link header value into structured Link objects
 *
 * @param headerValue - The value of the Link header
 * @returns Collection of parsed links
 *
 * @example
 * ```typescript
 * const links = parseLink('<https://api.example.com?page=2>; rel="next"');
 * console.log(links.next); // { uri: 'https://api.example.com?page=2', rel: 'next' }
 * ```
 */
export function parseLink(headerValue: string): LinkCollection {
  if (!headerValue || typeof headerValue !== 'string') {
    return { all: [] };
  }

  const links: Link[] = [];
  const collection: LinkCollection = { all: links };

  // Split by comma, but not commas inside quotes
  const linkStrings = splitLinkHeader(headerValue);

  for (const linkString of linkStrings) {
    const link = parseSingleLink(linkString.trim());
    if (link) {
      links.push(link);

      // Index by rel for easy access
      if (link.rel) {
        const relTypes = link.rel.split(/\s+/);
        for (const rel of relTypes) {
          const existing = collection[rel];
          if (existing) {
            // Multiple links with same rel
            if (Array.isArray(existing)) {
              existing.push(link);
            } else {
              collection[rel] = [existing, link];
            }
          } else {
            collection[rel] = link;
          }
        }
      }
    }
  }

  return collection;
}

/**
 * Split Link header by commas, respecting quoted strings
 */
function splitLinkHeader(header: string): string[] {
  const result: string[] = [];
  let current = '';
  let inBrackets = false;
  let inQuotes = false;

  for (let i = 0; i < header.length; i++) {
    const char = header[i];
    const prevChar = i > 0 ? header[i - 1] : '';

    if (char === '<' && !inQuotes) {
      inBrackets = true;
    } else if (char === '>' && !inQuotes) {
      inBrackets = false;
    } else if (char === '"' && prevChar !== '\\') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inBrackets && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

/**
 * Parse a single link entry
 */
function parseSingleLink(linkString: string): Link | null {
  // Extract URI: <https://example.com>
  const uriMatch = linkString.match(/^<([^>]+)>/);
  if (!uriMatch) {
    return null;
  }

  const uri = uriMatch[1];
  const link: Link = { uri };

  // Extract parameters: ; rel="next"; title="Next Page"
  const paramsString = linkString.slice(uriMatch[0].length);
  const params = parseParameters(paramsString);

  // Assign known parameters
  for (const [key, value] of Object.entries(params)) {
    link[key] = value;
  }

  return link;
}

/**
 * Parse link parameters (; key="value" or ; key=token)
 */
function parseParameters(paramsString: string): Record<string, string> {
  const params: Record<string, string> = {};

  // Split by semicolon, but not inside quotes
  const paramStrings = paramsString.split(/;/).filter(s => s.trim());

  for (const paramString of paramStrings) {
    const equalIndex = paramString.indexOf('=');
    if (equalIndex === -1) continue;

    const key = paramString.slice(0, equalIndex).trim();
    let value = paramString.slice(equalIndex + 1).trim();

    // Remove quotes if present
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }

    // Unescape quoted characters
    value = value.replace(/\\(.)/g, '$1');

    params[key] = value;
  }

  return params;
}

/**
 * Common link relation types from RFC-8288 and web standards
 */
export const LinkRel = {
  // Navigation
  NEXT: 'next',
  PREV: 'prev',
  PREVIOUS: 'previous',
  FIRST: 'first',
  LAST: 'last',

  // Resource relationships
  ALTERNATE: 'alternate',
  CANONICAL: 'canonical',
  AUTHOR: 'author',
  LICENSE: 'license',
  STYLESHEET: 'stylesheet',
  ICON: 'icon',

  // Resource hints
  PRELOAD: 'preload',
  PREFETCH: 'prefetch',
  PRECONNECT: 'preconnect',
  DNS_PREFETCH: 'dns-prefetch',
  PRERENDER: 'prerender',

  // HATEOAS
  SELF: 'self',
  EDIT: 'edit',
  COLLECTION: 'collection',
  ITEM: 'item',

  // Documentation
  HELP: 'help',
  DESCRIBEDBY: 'describedby',

  // Other common relations
  UP: 'up',
  RELATED: 'related',
  REPLIES: 'replies',
  VIA: 'via',
} as const;

/**
 * Helper class for working with Link headers
 */
export class LinkHeaderParser {
  private links: LinkCollection;

  constructor(headerValue: string) {
    this.links = parseLink(headerValue);
  }

  /**
   * Get all parsed links
   */
  getAll(): Link[] {
    return this.links.all;
  }

  /**
   * Get link(s) by relation type
   */
  getRel(rel: string): Link | Link[] | undefined {
    return this.links[rel];
  }

  /**
   * Get the first link with specified relation
   */
  getFirst(rel: string): Link | undefined {
    const links = this.links[rel];
    if (!links) return undefined;
    return Array.isArray(links) ? links[0] : links;
  }

  /**
   * Check if a relation type exists
   */
  has(rel: string): boolean {
    return rel in this.links;
  }

  /**
   * Get pagination links
   */
  getPagination(): {
    next?: string;
    prev?: string;
    first?: string;
    last?: string;
  } {
    return {
      next: this.getFirst(LinkRel.NEXT)?.uri,
      prev: this.getFirst(LinkRel.PREV)?.uri || this.getFirst(LinkRel.PREVIOUS)?.uri,
      first: this.getFirst(LinkRel.FIRST)?.uri,
      last: this.getFirst(LinkRel.LAST)?.uri,
    };
  }

  /**
   * Check if there's a next page
   */
  hasNext(): boolean {
    return this.has(LinkRel.NEXT);
  }

  /**
   * Check if there's a previous page
   */
  hasPrev(): boolean {
    return this.has(LinkRel.PREV) || this.has(LinkRel.PREVIOUS);
  }

  /**
   * Get canonical URL
   */
  getCanonical(): string | undefined {
    return this.getFirst(LinkRel.CANONICAL)?.uri;
  }

  /**
   * Get alternate versions (e.g., different languages, formats)
   */
  getAlternates(): Link[] {
    const alts = this.getRel(LinkRel.ALTERNATE);
    if (!alts) return [];
    return Array.isArray(alts) ? alts : [alts];
  }

  /**
   * Get resource hints for preloading
   */
  getResourceHints(): {
    preload: Link[];
    prefetch: Link[];
    preconnect: Link[];
    dnsPrefetch: Link[];
  } {
    const getLinks = (rel: string): Link[] => {
      const links = this.getRel(rel);
      if (!links) return [];
      return Array.isArray(links) ? links : [links];
    };

    return {
      preload: getLinks(LinkRel.PRELOAD),
      prefetch: getLinks(LinkRel.PREFETCH),
      preconnect: getLinks(LinkRel.PRECONNECT),
      dnsPrefetch: getLinks(LinkRel.DNS_PREFETCH),
    };
  }

  /**
   * Convert to plain object
   */
  toJSON(): LinkCollection {
    return this.links;
  }
}

/**
 * Quick helper to parse Link header from response headers
 */
export function parseLinkHeader(headers: Headers): LinkHeaderParser | null {
  const linkHeader = headers.get('Link');
  if (!linkHeader) return null;
  return new LinkHeaderParser(linkHeader);
}
