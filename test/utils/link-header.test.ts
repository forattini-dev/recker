import { describe, it, expect } from 'vitest';
import {
  parseLink,
  parseLinkHeader,
  LinkHeaderParser,
  LinkRel,
  type Link,
  type LinkCollection
} from '../../src/utils/link-header.js';

describe('Link Header Parser (RFC-8288)', () => {
  describe('parseLink', () => {
    it('should parse a single link', () => {
      const header = '<https://api.example.com?page=2>; rel="next"';
      const result = parseLink(header);

      expect(result.all).toHaveLength(1);
      expect(result.all[0]).toEqual({
        uri: 'https://api.example.com?page=2',
        rel: 'next'
      });
      expect(result.next).toEqual(result.all[0]);
    });

    it('should parse multiple links', () => {
      const header = '<https://api.example.com?page=2>; rel="next", <https://api.example.com?page=1>; rel="prev"';
      const result = parseLink(header);

      expect(result.all).toHaveLength(2);
      expect(result.next).toEqual({ uri: 'https://api.example.com?page=2', rel: 'next' });
      expect(result.prev).toEqual({ uri: 'https://api.example.com?page=1', rel: 'prev' });
    });

    it('should parse full pagination links', () => {
      const header = [
        '<https://api.example.com?page=2>; rel="next"',
        '<https://api.example.com?page=1>; rel="prev"',
        '<https://api.example.com?page=1>; rel="first"',
        '<https://api.example.com?page=10>; rel="last"'
      ].join(', ');

      const result = parseLink(header);

      expect(result.all).toHaveLength(4);
      expect(result.next).toBeTruthy();
      expect(result.prev).toBeTruthy();
      expect(result.first).toBeTruthy();
      expect(result.last).toBeTruthy();
    });

    it('should handle multiple rels in one link', () => {
      const header = '<https://example.com>; rel="alternate canonical"';
      const result = parseLink(header);

      expect(result.all).toHaveLength(1);
      expect(result.alternate).toEqual({ uri: 'https://example.com', rel: 'alternate canonical' });
      expect(result.canonical).toEqual(result.alternate);
    });

    it('should handle multiple links with same rel', () => {
      const header = [
        '<https://example.com/en>; rel="alternate"; hreflang="en"',
        '<https://example.com/fr>; rel="alternate"; hreflang="fr"',
        '<https://example.com/es>; rel="alternate"; hreflang="es"'
      ].join(', ');

      const result = parseLink(header);

      expect(result.all).toHaveLength(3);
      expect(Array.isArray(result.alternate)).toBe(true);
      expect((result.alternate as Link[]).length).toBe(3);
    });

    it('should parse link parameters', () => {
      const header = '<https://example.com/style.css>; rel="stylesheet"; type="text/css"; media="screen"';
      const result = parseLink(header);

      expect(result.all[0]).toEqual({
        uri: 'https://example.com/style.css',
        rel: 'stylesheet',
        type: 'text/css',
        media: 'screen'
      });
    });

    it('should handle quoted parameter values', () => {
      const header = '<https://example.com>; rel="next"; title="Next Page"';
      const result = parseLink(header);

      expect(result.all[0]).toEqual({
        uri: 'https://example.com',
        rel: 'next',
        title: 'Next Page'
      });
    });

    it('should handle escaped quotes in parameters', () => {
      const header = '<https://example.com>; rel="next"; title="The \\"Next\\" Page"';
      const result = parseLink(header);

      expect(result.all[0].title).toBe('The "Next" Page');
    });

    it('should handle single quotes', () => {
      const header = "<https://example.com>; rel='next'; title='Next Page'";
      const result = parseLink(header);

      expect(result.all[0]).toEqual({
        uri: 'https://example.com',
        rel: 'next',
        title: 'Next Page'
      });
    });

    it('should handle anchor parameter', () => {
      const header = '<https://example.com/style.css>; rel="stylesheet"; anchor="#header"';
      const result = parseLink(header);

      expect(result.all[0]).toEqual({
        uri: 'https://example.com/style.css',
        rel: 'stylesheet',
        anchor: '#header'
      });
    });

    it('should return empty collection for empty string', () => {
      const result = parseLink('');
      expect(result.all).toEqual([]);
    });

    it('should return empty collection for invalid input', () => {
      expect(parseLink(null as any).all).toEqual([]);
      expect(parseLink(undefined as any).all).toEqual([]);
      expect(parseLink(123 as any).all).toEqual([]);
    });

    it('should skip malformed links', () => {
      const header = 'not-a-link, <https://example.com>; rel="next"';
      const result = parseLink(header);

      expect(result.all).toHaveLength(1);
      expect(result.next).toBeTruthy();
    });

    it('should handle URIs with commas in query params', () => {
      const header = '<https://api.example.com?tags=a,b,c>; rel="next"';
      const result = parseLink(header);

      expect(result.all[0].uri).toBe('https://api.example.com?tags=a,b,c');
    });
  });

  describe('LinkHeaderParser', () => {
    describe('getAll', () => {
      it('should return all links', () => {
        const parser = new LinkHeaderParser('<https://example.com/1>; rel="next", <https://example.com/2>; rel="prev"');
        const links = parser.getAll();

        expect(links).toHaveLength(2);
      });
    });

    describe('getRel', () => {
      it('should get link by rel', () => {
        const parser = new LinkHeaderParser('<https://example.com>; rel="next"');
        const link = parser.getRel('next');

        expect(link).toEqual({ uri: 'https://example.com', rel: 'next' });
      });

      it('should return undefined for missing rel', () => {
        const parser = new LinkHeaderParser('<https://example.com>; rel="next"');
        expect(parser.getRel('prev')).toBeUndefined();
      });

      it('should return array for multiple links with same rel', () => {
        const parser = new LinkHeaderParser(
          '<https://example.com/en>; rel="alternate", <https://example.com/fr>; rel="alternate"'
        );
        const links = parser.getRel('alternate');

        expect(Array.isArray(links)).toBe(true);
        expect((links as Link[]).length).toBe(2);
      });
    });

    describe('getFirst', () => {
      it('should get first link with rel', () => {
        const parser = new LinkHeaderParser(
          '<https://example.com/1>; rel="next", <https://example.com/2>; rel="next"'
        );
        const link = parser.getFirst('next');

        expect(link?.uri).toBe('https://example.com/1');
      });

      it('should return single link if not array', () => {
        const parser = new LinkHeaderParser('<https://example.com>; rel="next"');
        const link = parser.getFirst('next');

        expect(link?.uri).toBe('https://example.com');
      });

      it('should return undefined for missing rel', () => {
        const parser = new LinkHeaderParser('<https://example.com>; rel="next"');
        expect(parser.getFirst('prev')).toBeUndefined();
      });
    });

    describe('has', () => {
      it('should return true if rel exists', () => {
        const parser = new LinkHeaderParser('<https://example.com>; rel="next"');
        expect(parser.has('next')).toBe(true);
      });

      it('should return false if rel does not exist', () => {
        const parser = new LinkHeaderParser('<https://example.com>; rel="next"');
        expect(parser.has('prev')).toBe(false);
      });
    });

    describe('getPagination', () => {
      it('should extract all pagination links', () => {
        const parser = new LinkHeaderParser([
          '<https://api.example.com?page=2>; rel="next"',
          '<https://api.example.com?page=1>; rel="prev"',
          '<https://api.example.com?page=1>; rel="first"',
          '<https://api.example.com?page=10>; rel="last"'
        ].join(', '));

        const pagination = parser.getPagination();

        expect(pagination).toEqual({
          next: 'https://api.example.com?page=2',
          prev: 'https://api.example.com?page=1',
          first: 'https://api.example.com?page=1',
          last: 'https://api.example.com?page=10'
        });
      });

      it('should handle missing pagination links', () => {
        const parser = new LinkHeaderParser('<https://api.example.com?page=2>; rel="next"');
        const pagination = parser.getPagination();

        expect(pagination.next).toBe('https://api.example.com?page=2');
        expect(pagination.prev).toBeUndefined();
        expect(pagination.first).toBeUndefined();
        expect(pagination.last).toBeUndefined();
      });

      it('should support "previous" as alias for "prev"', () => {
        const parser = new LinkHeaderParser('<https://api.example.com?page=1>; rel="previous"');
        const pagination = parser.getPagination();

        expect(pagination.prev).toBe('https://api.example.com?page=1');
      });
    });

    describe('hasNext', () => {
      it('should return true if next link exists', () => {
        const parser = new LinkHeaderParser('<https://example.com>; rel="next"');
        expect(parser.hasNext()).toBe(true);
      });

      it('should return false if next link does not exist', () => {
        const parser = new LinkHeaderParser('<https://example.com>; rel="prev"');
        expect(parser.hasNext()).toBe(false);
      });
    });

    describe('hasPrev', () => {
      it('should return true if prev link exists', () => {
        const parser = new LinkHeaderParser('<https://example.com>; rel="prev"');
        expect(parser.hasPrev()).toBe(true);
      });

      it('should return true if previous link exists', () => {
        const parser = new LinkHeaderParser('<https://example.com>; rel="previous"');
        expect(parser.hasPrev()).toBe(true);
      });

      it('should return false if no prev link exists', () => {
        const parser = new LinkHeaderParser('<https://example.com>; rel="next"');
        expect(parser.hasPrev()).toBe(false);
      });
    });

    describe('getCanonical', () => {
      it('should return canonical URL', () => {
        const parser = new LinkHeaderParser('<https://example.com/canonical>; rel="canonical"');
        expect(parser.getCanonical()).toBe('https://example.com/canonical');
      });

      it('should return undefined if no canonical link', () => {
        const parser = new LinkHeaderParser('<https://example.com>; rel="next"');
        expect(parser.getCanonical()).toBeUndefined();
      });
    });

    describe('getAlternates', () => {
      it('should return alternate links as array', () => {
        const parser = new LinkHeaderParser([
          '<https://example.com/en>; rel="alternate"; hreflang="en"',
          '<https://example.com/fr>; rel="alternate"; hreflang="fr"'
        ].join(', '));

        const alternates = parser.getAlternates();
        expect(alternates).toHaveLength(2);
        expect(alternates[0].hreflang).toBe('en');
        expect(alternates[1].hreflang).toBe('fr');
      });

      it('should return single alternate as array', () => {
        const parser = new LinkHeaderParser('<https://example.com/en>; rel="alternate"');
        const alternates = parser.getAlternates();

        expect(Array.isArray(alternates)).toBe(true);
        expect(alternates).toHaveLength(1);
      });

      it('should return empty array if no alternates', () => {
        const parser = new LinkHeaderParser('<https://example.com>; rel="next"');
        expect(parser.getAlternates()).toEqual([]);
      });
    });

    describe('getResourceHints', () => {
      it('should extract all resource hints', () => {
        const parser = new LinkHeaderParser([
          '<https://cdn.example.com/app.js>; rel="preload"; as="script"',
          '<https://cdn.example.com/style.css>; rel="prefetch"; as="style"',
          '<https://api.example.com>; rel="preconnect"',
          '<https://analytics.example.com>; rel="dns-prefetch"'
        ].join(', '));

        const hints = parser.getResourceHints();

        expect(hints.preload).toHaveLength(1);
        expect(hints.prefetch).toHaveLength(1);
        expect(hints.preconnect).toHaveLength(1);
        expect(hints.dnsPrefetch).toHaveLength(1);
      });

      it('should return empty arrays if no hints', () => {
        const parser = new LinkHeaderParser('<https://example.com>; rel="next"');
        const hints = parser.getResourceHints();

        expect(hints.preload).toEqual([]);
        expect(hints.prefetch).toEqual([]);
        expect(hints.preconnect).toEqual([]);
        expect(hints.dnsPrefetch).toEqual([]);
      });
    });

    describe('toJSON', () => {
      it('should return link collection', () => {
        const parser = new LinkHeaderParser('<https://example.com>; rel="next"');
        const json = parser.toJSON();

        expect(json.all).toHaveLength(1);
        expect(json.next).toBeTruthy();
      });
    });
  });

  describe('parseLinkHeader', () => {
    it('should parse Link header from Headers object', () => {
      const headers = new Headers({
        'Link': '<https://api.example.com?page=2>; rel="next"'
      });

      const parser = parseLinkHeader(headers);

      expect(parser).toBeInstanceOf(LinkHeaderParser);
      expect(parser?.hasNext()).toBe(true);
    });

    it('should return null if no Link header', () => {
      const headers = new Headers({
        'Content-Type': 'application/json'
      });

      const parser = parseLinkHeader(headers);
      expect(parser).toBeNull();
    });

    it('should handle empty Link header', () => {
      const headers = new Headers({
        'Link': ''
      });

      const parser = parseLinkHeader(headers);
      expect(parser).toBeNull();
    });
  });

  describe('LinkRel constants', () => {
    it('should export common relation types', () => {
      expect(LinkRel.NEXT).toBe('next');
      expect(LinkRel.PREV).toBe('prev');
      expect(LinkRel.FIRST).toBe('first');
      expect(LinkRel.LAST).toBe('last');
      expect(LinkRel.CANONICAL).toBe('canonical');
      expect(LinkRel.ALTERNATE).toBe('alternate');
      expect(LinkRel.PRELOAD).toBe('preload');
      expect(LinkRel.PREFETCH).toBe('prefetch');
      expect(LinkRel.SELF).toBe('self');
    });
  });

  describe('Real-world scenarios', () => {
    it('should parse GitHub API pagination', () => {
      const header = [
        '<https://api.github.com/repositories/123/issues?page=2>; rel="next"',
        '<https://api.github.com/repositories/123/issues?page=50>; rel="last"',
        '<https://api.github.com/repositories/123/issues?page=1>; rel="first"'
      ].join(', ');

      const parser = new LinkHeaderParser(header);
      const pagination = parser.getPagination();

      expect(pagination.next).toContain('page=2');
      expect(pagination.last).toContain('page=50');
      expect(pagination.first).toContain('page=1');
    });

    it('should parse preload hints', () => {
      const header = [
        '<https://cdn.example.com/font.woff2>; rel="preload"; as="font"; type="font/woff2"; crossorigin',
        '<https://cdn.example.com/critical.css>; rel="preload"; as="style"'
      ].join(', ');

      const parser = new LinkHeaderParser(header);
      const hints = parser.getResourceHints();

      expect(hints.preload).toHaveLength(2);
      expect(hints.preload[0].uri).toContain('font.woff2');
      expect(hints.preload[1].uri).toContain('critical.css');
    });

    it('should parse language alternates', () => {
      const header = [
        '<https://example.com/en/page>; rel="alternate"; hreflang="en"; title="English"',
        '<https://example.com/fr/page>; rel="alternate"; hreflang="fr"; title="Français"',
        '<https://example.com/de/page>; rel="alternate"; hreflang="de"; title="Deutsch"'
      ].join(', ');

      const parser = new LinkHeaderParser(header);
      const alternates = parser.getAlternates();

      expect(alternates).toHaveLength(3);
      const languages = alternates.map(link => link.hreflang);
      expect(languages).toEqual(['en', 'fr', 'de']);
    });
  });
});
