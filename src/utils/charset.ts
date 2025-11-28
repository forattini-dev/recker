/**
 * Charset Detection and Encoding Utilities
 *
 * Detects and handles character encoding from:
 * - Content-Type header
 * - BOM (Byte Order Mark)
 * - XML declaration
 * - HTML meta tags
 */

export interface CharsetInfo {
  /** Detected charset name (normalized to lowercase) */
  charset: string;
  /** Source of detection */
  source: 'header' | 'bom' | 'xml' | 'html-meta' | 'default';
  /** Confidence level */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Common charset aliases (maps to standard names)
 */
const charsetAliases: Record<string, string> = {
  // UTF-8 variants
  'utf8': 'utf-8',
  'utf_8': 'utf-8',

  // UTF-16 variants
  'utf16': 'utf-16',
  'utf_16': 'utf-16',
  'utf16le': 'utf-16le',
  'utf16be': 'utf-16be',

  // ISO-8859 variants
  'latin1': 'iso-8859-1',
  'latin-1': 'iso-8859-1',
  'iso8859-1': 'iso-8859-1',
  'iso_8859-1': 'iso-8859-1',

  // Windows code pages
  'cp1252': 'windows-1252',
  'win1252': 'windows-1252',

  // ASCII
  'us-ascii': 'ascii',
  'usascii': 'ascii',

  // Chinese
  'gbk': 'gbk',
  'gb2312': 'gb2312',
  'gb18030': 'gb18030',

  // Japanese
  'shift-jis': 'shift_jis',
  'shiftjis': 'shift_jis',
  'sjis': 'shift_jis',
  'euc-jp': 'euc-jp',
  'eucjp': 'euc-jp',
  'iso-2022-jp': 'iso-2022-jp',

  // Korean
  'euc-kr': 'euc-kr',
  'euckr': 'euc-kr',
};

/**
 * Normalize charset name to standard form
 */
export function normalizeCharset(charset: string): string {
  const lower = charset.toLowerCase().trim();
  return charsetAliases[lower] || lower;
}

/**
 * Detect charset from Content-Type header
 *
 * @example
 * detectFromContentType('text/html; charset=utf-8') // 'utf-8'
 * detectFromContentType('application/json') // null
 */
export function detectFromContentType(contentType: string | null): string | null {
  if (!contentType) return null;

  // Match charset parameter
  const charsetMatch = contentType.match(/charset=["']?([^"';\s]+)["']?/i);
  if (charsetMatch) {
    return normalizeCharset(charsetMatch[1]);
  }

  return null;
}

/**
 * Detect charset from BOM (Byte Order Mark)
 *
 * BOM signatures:
 * - UTF-8: EF BB BF
 * - UTF-16 BE: FE FF
 * - UTF-16 LE: FF FE
 * - UTF-32 BE: 00 00 FE FF
 * - UTF-32 LE: FF FE 00 00
 */
export function detectFromBOM(buffer: Uint8Array): CharsetInfo | null {
  if (buffer.length < 2) return null;

  // UTF-32 BE
  if (buffer.length >= 4 && buffer[0] === 0x00 && buffer[1] === 0x00 &&
      buffer[2] === 0xFE && buffer[3] === 0xFF) {
    return { charset: 'utf-32be', source: 'bom', confidence: 'high' };
  }

  // UTF-32 LE (check before UTF-16 LE since it starts with same bytes)
  if (buffer.length >= 4 && buffer[0] === 0xFF && buffer[1] === 0xFE &&
      buffer[2] === 0x00 && buffer[3] === 0x00) {
    return { charset: 'utf-32le', source: 'bom', confidence: 'high' };
  }

  // UTF-8
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return { charset: 'utf-8', source: 'bom', confidence: 'high' };
  }

  // UTF-16 BE
  if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return { charset: 'utf-16be', source: 'bom', confidence: 'high' };
  }

  // UTF-16 LE
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return { charset: 'utf-16le', source: 'bom', confidence: 'high' };
  }

  return null;
}

/**
 * Strip BOM from buffer and return the stripped buffer
 */
export function stripBOM(buffer: Uint8Array): Uint8Array {
  const bomInfo = detectFromBOM(buffer);
  if (!bomInfo) return buffer;

  switch (bomInfo.charset) {
    case 'utf-8':
      return buffer.slice(3);
    case 'utf-16le':
    case 'utf-16be':
      return buffer.slice(2);
    case 'utf-32le':
    case 'utf-32be':
      return buffer.slice(4);
    default:
      return buffer;
  }
}

/**
 * Detect charset from XML declaration
 *
 * @example
 * detectFromXMLDeclaration('<?xml version="1.0" encoding="ISO-8859-1"?>...') // 'iso-8859-1'
 */
export function detectFromXMLDeclaration(content: string): string | null {
  // Match XML declaration encoding
  const xmlMatch = content.match(/<\?xml[^?]*encoding=["']([^"']+)["'][^?]*\?>/i);
  if (xmlMatch) {
    return normalizeCharset(xmlMatch[1]);
  }
  return null;
}

/**
 * Detect charset from HTML meta tags
 *
 * Supports:
 * - <meta charset="utf-8">
 * - <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
 */
export function detectFromHTMLMeta(html: string): string | null {
  // Look in the first 1024 bytes (common location for meta tags)
  const head = html.slice(0, 1024);

  // Try <meta charset="...">
  const charsetMeta = head.match(/<meta[^>]+charset=["']?([^"'>\s]+)["']?/i);
  if (charsetMeta) {
    return normalizeCharset(charsetMeta[1]);
  }

  // Try <meta http-equiv="Content-Type" content="...; charset=...">
  const httpEquiv = head.match(/<meta[^>]+http-equiv=["']?Content-Type["']?[^>]+content=["']?[^"'>]*charset=([^"'>\s;]+)/i);
  if (httpEquiv) {
    return normalizeCharset(httpEquiv[1]);
  }

  // Try reverse order (content before http-equiv)
  const httpEquivReverse = head.match(/<meta[^>]+content=["']?[^"'>]*charset=([^"'>\s;]+)[^>]+http-equiv=["']?Content-Type["']?/i);
  if (httpEquivReverse) {
    return normalizeCharset(httpEquivReverse[1]);
  }

  return null;
}

/**
 * Detect charset from response data using multiple methods
 *
 * Priority:
 * 1. Content-Type header
 * 2. BOM
 * 3. XML declaration (for XML content)
 * 4. HTML meta tags (for HTML content)
 * 5. Default (utf-8)
 */
export function detectCharset(
  buffer: Uint8Array,
  contentType?: string | null
): CharsetInfo {
  // 1. Try Content-Type header
  const headerCharset = detectFromContentType(contentType || null);
  if (headerCharset) {
    return { charset: headerCharset, source: 'header', confidence: 'high' };
  }

  // 2. Try BOM
  const bomResult = detectFromBOM(buffer);
  if (bomResult) {
    return bomResult;
  }

  // 3. Decode as ASCII/UTF-8 to check content
  const textDecoder = new TextDecoder('utf-8', { fatal: false });
  const text = textDecoder.decode(buffer.slice(0, 1024));

  // 4. Try XML declaration
  if (text.trimStart().startsWith('<?xml')) {
    const xmlCharset = detectFromXMLDeclaration(text);
    if (xmlCharset) {
      return { charset: xmlCharset, source: 'xml', confidence: 'medium' };
    }
  }

  // 5. Try HTML meta tags
  if (text.toLowerCase().includes('<html') || text.toLowerCase().includes('<!doctype html')) {
    const htmlCharset = detectFromHTMLMeta(text);
    if (htmlCharset) {
      return { charset: htmlCharset, source: 'html-meta', confidence: 'medium' };
    }
  }

  // 6. Default to UTF-8
  return { charset: 'utf-8', source: 'default', confidence: 'low' };
}

/**
 * Decode buffer to string using detected or specified charset
 */
export function decodeText(
  buffer: Uint8Array,
  charsetOrInfo?: string | CharsetInfo
): string {
  let charset = 'utf-8';

  if (typeof charsetOrInfo === 'string') {
    charset = normalizeCharset(charsetOrInfo);
  } else if (charsetOrInfo) {
    charset = charsetOrInfo.charset;
  }

  // Strip BOM if present
  const cleanBuffer = stripBOM(buffer);

  try {
    const decoder = new TextDecoder(charset);
    return decoder.decode(cleanBuffer);
  } catch {
    // Fall back to UTF-8 if charset is not supported
    const decoder = new TextDecoder('utf-8', { fatal: false });
    return decoder.decode(cleanBuffer);
  }
}

/**
 * Get the supported encodings from TextDecoder
 */
export function getSupportedEncodings(): string[] {
  // List of common encodings supported by TextDecoder in most browsers/Node.js
  return [
    'utf-8', 'utf-16le', 'utf-16be',
    'iso-8859-1', 'iso-8859-2', 'iso-8859-3', 'iso-8859-4', 'iso-8859-5',
    'iso-8859-6', 'iso-8859-7', 'iso-8859-8', 'iso-8859-9', 'iso-8859-10',
    'iso-8859-11', 'iso-8859-13', 'iso-8859-14', 'iso-8859-15', 'iso-8859-16',
    'windows-1250', 'windows-1251', 'windows-1252', 'windows-1253',
    'windows-1254', 'windows-1255', 'windows-1256', 'windows-1257', 'windows-1258',
    'koi8-r', 'koi8-u',
    'gbk', 'gb2312', 'gb18030',
    'big5', 'big5-hkscs',
    'shift_jis', 'euc-jp', 'iso-2022-jp',
    'euc-kr',
  ];
}

/**
 * Check if a charset is supported
 */
export function isCharsetSupported(charset: string): boolean {
  try {
    new TextDecoder(normalizeCharset(charset));
    return true;
  } catch {
    return false;
  }
}
