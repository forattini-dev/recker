import { describe, it, expect, beforeAll } from 'vitest';
import { BrowserCrypto } from '../../src/browser/crypto.js';

describe('BrowserCrypto', () => {
  let crypto: BrowserCrypto;

  beforeAll(() => {
    crypto = new BrowserCrypto();
  });

  describe('hash', () => {
    it('should compute SHA-256 hash', async () => {
      const result = await crypto.hash('SHA-256', 'hello');
      expect(result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('should compute SHA-1 hash', async () => {
      const result = await crypto.hash('SHA-1', 'hello');
      expect(result).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
    });
  });

  describe('randomUUID', () => {
    it('should generate valid UUID v4', () => {
      const uuid = crypto.randomUUID();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('should generate unique UUIDs', () => {
      const uuid1 = crypto.randomUUID();
      const uuid2 = crypto.randomUUID();
      expect(uuid1).not.toBe(uuid2);
    });
  });

  describe('randomBytes', () => {
    it('should generate bytes of specified length', () => {
      const bytes = crypto.randomBytes(16);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(16);
    });

    it('should generate random bytes', () => {
      const bytes1 = crypto.randomBytes(32);
      const bytes2 = crypto.randomBytes(32);
      // Extremely unlikely to be equal
      expect(bytes1).not.toEqual(bytes2);
    });
  });

  describe('randomHex', () => {
    it('should generate hex string of specified byte length', () => {
      const hex = crypto.randomHex(16);
      expect(hex).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe('base64', () => {
    it('should encode and decode strings', () => {
      const original = 'Hello, World!';
      const encoded = crypto.base64Encode(original);
      const decoded = crypto.base64Decode(encoded);
      expect(decoded).toBe(original);
    });

    it('should handle UTF-8 characters', () => {
      const original = 'Olá, Mundo! 你好世界 🌍';
      const encoded = crypto.base64Encode(original);
      const decoded = crypto.base64Decode(encoded);
      expect(decoded).toBe(original);
    });
  });
});
