import { describe, it, expect } from 'vitest';
import {
  normalizeCharset,
  detectFromContentType,
  detectFromBOM,
  stripBOM,
  detectFromXMLDeclaration,
  detectFromHTMLMeta,
  detectCharset,
  decodeText,
  isCharsetSupported,
  getSupportedEncodings,
} from '../../src/utils/charset.js';

describe('Charset Detection', () => {
  describe('normalizeCharset', () => {
    it('should normalize common aliases', () => {
      expect(normalizeCharset('UTF8')).toBe('utf-8');
      expect(normalizeCharset('utf_8')).toBe('utf-8');
      expect(normalizeCharset('LATIN1')).toBe('iso-8859-1');
      expect(normalizeCharset('cp1252')).toBe('windows-1252');
    });

    it('should lowercase unknown charsets', () => {
      expect(normalizeCharset('SomeCharset')).toBe('somecharset');
    });

    it('should trim whitespace', () => {
      expect(normalizeCharset('  utf-8  ')).toBe('utf-8');
    });
  });

  describe('detectFromContentType', () => {
    it('should extract charset from Content-Type header', () => {
      expect(detectFromContentType('text/html; charset=utf-8')).toBe('utf-8');
      expect(detectFromContentType('text/html; charset="UTF-8"')).toBe('utf-8');
      expect(detectFromContentType("text/html; charset='ISO-8859-1'")).toBe('iso-8859-1');
    });

    it('should return null if no charset', () => {
      expect(detectFromContentType('application/json')).toBe(null);
      expect(detectFromContentType('text/html')).toBe(null);
      expect(detectFromContentType(null)).toBe(null);
    });

    it('should handle complex Content-Type values', () => {
      expect(detectFromContentType('text/html; charset=utf-8; boundary=something')).toBe('utf-8');
    });
  });

  describe('detectFromBOM', () => {
    it('should detect UTF-8 BOM', () => {
      const buffer = new Uint8Array([0xEF, 0xBB, 0xBF, 0x48, 0x65, 0x6C, 0x6C, 0x6F]);
      const result = detectFromBOM(buffer);
      expect(result).toEqual({ charset: 'utf-8', source: 'bom', confidence: 'high' });
    });

    it('should detect UTF-16 LE BOM', () => {
      const buffer = new Uint8Array([0xFF, 0xFE, 0x48, 0x00]);
      const result = detectFromBOM(buffer);
      expect(result).toEqual({ charset: 'utf-16le', source: 'bom', confidence: 'high' });
    });

    it('should detect UTF-16 BE BOM', () => {
      const buffer = new Uint8Array([0xFE, 0xFF, 0x00, 0x48]);
      const result = detectFromBOM(buffer);
      expect(result).toEqual({ charset: 'utf-16be', source: 'bom', confidence: 'high' });
    });

    it('should detect UTF-32 LE BOM', () => {
      const buffer = new Uint8Array([0xFF, 0xFE, 0x00, 0x00, 0x48, 0x00, 0x00, 0x00]);
      const result = detectFromBOM(buffer);
      expect(result).toEqual({ charset: 'utf-32le', source: 'bom', confidence: 'high' });
    });

    it('should detect UTF-32 BE BOM', () => {
      const buffer = new Uint8Array([0x00, 0x00, 0xFE, 0xFF, 0x00, 0x00, 0x00, 0x48]);
      const result = detectFromBOM(buffer);
      expect(result).toEqual({ charset: 'utf-32be', source: 'bom', confidence: 'high' });
    });

    it('should return null if no BOM', () => {
      const buffer = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]);
      expect(detectFromBOM(buffer)).toBe(null);
    });

    it('should return null for empty buffer', () => {
      const buffer = new Uint8Array([]);
      expect(detectFromBOM(buffer)).toBe(null);
    });
  });

  describe('stripBOM', () => {
    it('should strip UTF-8 BOM', () => {
      const buffer = new Uint8Array([0xEF, 0xBB, 0xBF, 0x48, 0x65, 0x6C, 0x6C, 0x6F]);
      const result = stripBOM(buffer);
      expect(result).toEqual(new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]));
    });

    it('should strip UTF-16 LE BOM', () => {
      const buffer = new Uint8Array([0xFF, 0xFE, 0x48, 0x00]);
      const result = stripBOM(buffer);
      expect(result).toEqual(new Uint8Array([0x48, 0x00]));
    });

    it('should not modify buffer without BOM', () => {
      const buffer = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]);
      const result = stripBOM(buffer);
      expect(result).toEqual(buffer);
    });
  });

  describe('detectFromXMLDeclaration', () => {
    it('should detect encoding from XML declaration', () => {
      expect(detectFromXMLDeclaration('<?xml version="1.0" encoding="ISO-8859-1"?><root/>')).toBe('iso-8859-1');
      expect(detectFromXMLDeclaration("<?xml encoding='UTF-8' version='1.0'?><root/>")).toBe('utf-8');
    });

    it('should return null if no encoding', () => {
      expect(detectFromXMLDeclaration('<?xml version="1.0"?><root/>')).toBe(null);
      expect(detectFromXMLDeclaration('<root/>')).toBe(null);
    });
  });

  describe('detectFromHTMLMeta', () => {
    it('should detect charset from meta tag', () => {
      expect(detectFromHTMLMeta('<html><head><meta charset="utf-8"></head></html>')).toBe('utf-8');
      expect(detectFromHTMLMeta('<html><head><meta charset="ISO-8859-1" /></head></html>')).toBe('iso-8859-1');
    });

    it('should detect charset from http-equiv meta tag', () => {
      // Make sure this doesn't match the simple <meta charset="..."> pattern by not having charset= at the start
      const html = '<html><head><meta http-equiv="Content-Type" content="text/html; charset=windows-1252"></head></html>';
      expect(detectFromHTMLMeta(html)).toBe('windows-1252');
    });

    it('should detect charset with reversed attribute order (content before http-equiv)', () => {
      // This tests the reverse pattern where content comes before http-equiv
      const html = '<html><head><meta content="text/html; charset=iso-8859-15" http-equiv="Content-Type"></head></html>';
      expect(detectFromHTMLMeta(html)).toBe('iso-8859-15');
    });

    it('should return null if no charset meta', () => {
      expect(detectFromHTMLMeta('<html><head><title>Test</title></head></html>')).toBe(null);
      expect(detectFromHTMLMeta('Plain text')).toBe(null);
    });
  });

  describe('detectCharset', () => {
    it('should prioritize Content-Type header', () => {
      const buffer = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]);
      const result = detectCharset(buffer, 'text/html; charset=iso-8859-1');
      expect(result).toEqual({ charset: 'iso-8859-1', source: 'header', confidence: 'high' });
    });

    it('should use BOM if no Content-Type charset', () => {
      const buffer = new Uint8Array([0xEF, 0xBB, 0xBF, 0x48, 0x65, 0x6C, 0x6C, 0x6F]);
      const result = detectCharset(buffer, 'text/html');
      expect(result).toEqual({ charset: 'utf-8', source: 'bom', confidence: 'high' });
    });

    it('should detect from XML declaration', () => {
      const xml = '<?xml version="1.0" encoding="windows-1252"?><root/>';
      const buffer = new TextEncoder().encode(xml);
      const result = detectCharset(buffer, 'application/xml');
      expect(result).toEqual({ charset: 'windows-1252', source: 'xml', confidence: 'medium' });
    });

    it('should detect from HTML meta', () => {
      const html = '<!DOCTYPE html><html><head><meta charset="iso-8859-1"></head></html>';
      const buffer = new TextEncoder().encode(html);
      const result = detectCharset(buffer, 'text/html');
      expect(result).toEqual({ charset: 'iso-8859-1', source: 'html-meta', confidence: 'medium' });
    });

    it('should default to utf-8', () => {
      const buffer = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]);
      const result = detectCharset(buffer);
      expect(result).toEqual({ charset: 'utf-8', source: 'default', confidence: 'low' });
    });
  });

  describe('decodeText', () => {
    it('should decode UTF-8 text', () => {
      const buffer = new TextEncoder().encode('Hello, World! 你好世界');
      const result = decodeText(buffer, 'utf-8');
      expect(result).toBe('Hello, World! 你好世界');
    });

    it('should decode with CharsetInfo object', () => {
      const buffer = new TextEncoder().encode('Hello');
      const result = decodeText(buffer, { charset: 'utf-8', source: 'header', confidence: 'high' });
      expect(result).toBe('Hello');
    });

    it('should strip BOM when decoding', () => {
      const buffer = new Uint8Array([0xEF, 0xBB, 0xBF, 0x48, 0x65, 0x6C, 0x6C, 0x6F]);
      const result = decodeText(buffer, 'utf-8');
      expect(result).toBe('Hello');
    });

    it('should fall back to UTF-8 for unsupported charsets', () => {
      const buffer = new TextEncoder().encode('Hello');
      // This should not throw, even with an invalid charset
      const result = decodeText(buffer, 'nonexistent-charset');
      expect(result).toBe('Hello');
    });

    it('should default to UTF-8 if no charset specified', () => {
      const buffer = new TextEncoder().encode('Test');
      const result = decodeText(buffer);
      expect(result).toBe('Test');
    });
  });

  describe('isCharsetSupported', () => {
    it('should return true for supported charsets', () => {
      expect(isCharsetSupported('utf-8')).toBe(true);
      expect(isCharsetSupported('iso-8859-1')).toBe(true);
      expect(isCharsetSupported('windows-1252')).toBe(true);
    });

    it('should return false for unsupported charsets', () => {
      expect(isCharsetSupported('nonexistent-charset')).toBe(false);
    });

    it('should normalize charset before checking', () => {
      expect(isCharsetSupported('UTF8')).toBe(true);
      expect(isCharsetSupported('latin1')).toBe(true);
    });
  });

  describe('getSupportedEncodings', () => {
    it('should return array of supported encodings', () => {
      const encodings = getSupportedEncodings();
      expect(Array.isArray(encodings)).toBe(true);
      expect(encodings.length).toBeGreaterThan(0);
      expect(encodings).toContain('utf-8');
      expect(encodings).toContain('iso-8859-1');
      expect(encodings).toContain('windows-1252');
    });
  });

  describe('stripBOM edge cases', () => {
    it('should strip UTF-16 BE BOM', () => {
      const buffer = new Uint8Array([0xFE, 0xFF, 0x00, 0x48]);
      const result = stripBOM(buffer);
      expect(result).toEqual(new Uint8Array([0x00, 0x48]));
    });

    it('should strip UTF-32 LE BOM', () => {
      const buffer = new Uint8Array([0xFF, 0xFE, 0x00, 0x00, 0x48, 0x00, 0x00, 0x00]);
      const result = stripBOM(buffer);
      expect(result).toEqual(new Uint8Array([0x48, 0x00, 0x00, 0x00]));
    });

    it('should strip UTF-32 BE BOM', () => {
      const buffer = new Uint8Array([0x00, 0x00, 0xFE, 0xFF, 0x00, 0x00, 0x00, 0x48]);
      const result = stripBOM(buffer);
      expect(result).toEqual(new Uint8Array([0x00, 0x00, 0x00, 0x48]));
    });
  });
});
