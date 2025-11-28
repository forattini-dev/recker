/**
 * XML Plugin for Recker
 * Provides XML serialization and parsing capabilities
 *
 * Native XML support is built into the client via the `xml` request option.
 * This module exports parsing and serialization utilities for working with XML responses.
 */

import { ReckerResponse } from '../types/index.js';

export interface XMLPluginOptions {
  /**
   * Custom XML parser function
   * By default uses a simple object parser
   */
  parser?: (xml: string) => any;

  /**
   * Custom XML serializer function
   * By default uses a simple object-to-XML serializer
   */
  serializer?: (obj: any) => string;
}

/**
 * Simple XML to object parser
 * Handles common XML structures without external dependencies
 * For complex XML, consider using fast-xml-parser or xml2js
 */
export function parseXML(xml: string): any {
  // Remove XML declaration and comments
  const cleanXml = xml
    .replace(/<\?xml[^?]*\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  return parseElement(cleanXml);
}

function parseElement(xml: string): any {
  // Match root element
  const rootMatch = xml.match(/^<(\w+)([^>]*)>([\s\S]*)<\/\1>$/);
  if (!rootMatch) {
    // Try self-closing tag
    const selfClosingMatch = xml.match(/^<(\w+)([^/>]*)\/>$/);
    if (selfClosingMatch) {
      const [, tagName, attrs] = selfClosingMatch;
      const attributes = parseAttributes(attrs);
      return Object.keys(attributes).length > 0 ? { [tagName]: attributes } : { [tagName]: null };
    }
    // Plain text content
    return decodeXMLEntities(xml.trim());
  }

  const [, tagName, attrs, content] = rootMatch;
  const attributes = parseAttributes(attrs);
  const children = parseChildren(content);

  // Build result
  const result: any = {};

  if (Object.keys(attributes).length > 0) {
    result['@attributes'] = attributes;
  }

  if (typeof children === 'string') {
    if (Object.keys(attributes).length > 0) {
      result['#text'] = children;
      return { [tagName]: result };
    }
    return { [tagName]: children };
  }

  if (Array.isArray(children)) {
    // Merge children into result
    for (const child of children) {
      for (const [key, value] of Object.entries(child)) {
        if (result[key] !== undefined) {
          // Multiple same-named children become an array
          if (!Array.isArray(result[key])) {
            result[key] = [result[key]];
          }
          result[key].push(value);
        } else {
          result[key] = value;
        }
      }
    }
  }

  return { [tagName]: Object.keys(result).length > 0 ? result : null };
}

function parseAttributes(attrs: string): Record<string, string> {
  const result: Record<string, string> = {};
  const attrRegex = /(\w+)=["']([^"']*)["']/g;
  let match;
  while ((match = attrRegex.exec(attrs)) !== null) {
    result[match[1]] = decodeXMLEntities(match[2]);
  }
  return result;
}

function parseChildren(content: string): string | any[] {
  const trimmed = content.trim();
  if (!trimmed) return '';

  // Check if content has child elements
  if (!trimmed.startsWith('<')) {
    return decodeXMLEntities(trimmed);
  }

  const children: any[] = [];
  let remaining = trimmed;

  while (remaining.length > 0) {
    remaining = remaining.trim();
    if (!remaining) break;

    // Match opening tag
    const tagMatch = remaining.match(/^<(\w+)([^>]*)>/);
    if (!tagMatch) {
      // Text content before next tag
      const textEnd = remaining.indexOf('<');
      if (textEnd > 0) {
        const text = remaining.substring(0, textEnd).trim();
        if (text) {
          children.push({ '#text': decodeXMLEntities(text) });
        }
        remaining = remaining.substring(textEnd);
        continue;
      }
      break;
    }

    const [fullMatch, tagName, attrs] = tagMatch;

    // Check for self-closing
    if (attrs.endsWith('/') || remaining.substring(fullMatch.length - 1, fullMatch.length + 1) === '/>') {
      const selfMatch = remaining.match(/^<(\w+)([^/>]*)\/?>/);
      if (selfMatch) {
        const selfAttrs = parseAttributes(selfMatch[2]);
        children.push({ [tagName]: Object.keys(selfAttrs).length > 0 ? { '@attributes': selfAttrs } : null });
        remaining = remaining.substring(selfMatch[0].length);
        continue;
      }
    }

    // Find closing tag
    const closingTag = `</${tagName}>`;
    let depth = 1;
    let pos = fullMatch.length;

    while (depth > 0 && pos < remaining.length) {
      const nextOpen = remaining.indexOf(`<${tagName}`, pos);
      const nextClose = remaining.indexOf(closingTag, pos);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        // Check if it's a self-closing tag
        const afterOpen = remaining.substring(nextOpen);
        const selfCloseMatch = afterOpen.match(/^<\w+[^>]*\/>/);
        if (!selfCloseMatch) {
          depth++;
        }
        pos = nextOpen + 1;
      } else {
        depth--;
        if (depth === 0) {
          const elementXml = remaining.substring(0, nextClose + closingTag.length);
          children.push(parseElement(elementXml));
          remaining = remaining.substring(nextClose + closingTag.length);
        } else {
          pos = nextClose + 1;
        }
      }
    }

    if (depth > 0) {
      // Malformed XML, break
      break;
    }
  }

  return children;
}

function decodeXMLEntities(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

/**
 * Simple object to XML serializer
 *
 * @example
 * ```typescript
 * const xml = serializeXML({
 *   user: {
 *     '@attributes': { id: '123' },
 *     name: 'John',
 *     email: 'john@example.com'
 *   }
 * });
 * // Output: <user id="123"><name>John</name><email>john@example.com</email></user>
 * ```
 */
export function serializeXML(obj: any, rootName?: string): string {
  if (obj === null || obj === undefined) {
    return rootName ? `<${rootName}/>` : '';
  }

  if (typeof obj !== 'object') {
    return rootName ? `<${rootName}>${encodeXMLEntities(String(obj))}</${rootName}>` : encodeXMLEntities(String(obj));
  }

  const keys = Object.keys(obj);

  // If object has single key, use it as root
  if (keys.length === 1 && !rootName) {
    const key = keys[0];
    return serializeXML(obj[key], key);
  }

  let xml = '';
  let attributes = '';
  let textContent = '';

  for (const key of keys) {
    const value = obj[key];

    if (key === '@attributes') {
      for (const [attrName, attrValue] of Object.entries(value as Record<string, any>)) {
        attributes += ` ${attrName}="${encodeXMLEntities(String(attrValue))}"`;
      }
    } else if (key === '#text') {
      textContent = encodeXMLEntities(String(value));
    } else if (Array.isArray(value)) {
      for (const item of value) {
        xml += serializeXML(item, key);
      }
    } else {
      xml += serializeXML(value, key);
    }
  }

  if (rootName) {
    if (xml || textContent) {
      return `<${rootName}${attributes}>${textContent}${xml}</${rootName}>`;
    }
    return `<${rootName}${attributes}/>`;
  }

  return xml;
}

function encodeXMLEntities(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Helper to parse XML response
 *
 * @example
 * ```typescript
 * import { createClient, xmlResponse } from 'recker';
 *
 * const client = createClient({ baseUrl: 'https://api.example.com' });
 * const data = await xmlResponse(client.get('/data.xml'));
 * ```
 */
export async function xmlResponse<T = any>(
  promise: Promise<ReckerResponse>,
  parser: (xml: string) => any = parseXML
): Promise<T> {
  const response = await promise;
  const text = await response.text();
  return parser(text) as T;
}

// Export utilities for standalone use
export { parseXML as parse, serializeXML as serialize };
