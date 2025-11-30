import { describe, it, expect } from 'vitest';
import { HttpResponse } from '../../src/core/response.js';

describe('Response Links Integration', () => {
  it('should parse Link header from response', () => {
    const mockResponse = new Response(null, {
      status: 200,
      headers: {
        'Link': '<https://api.example.com?page=2>; rel="next", <https://api.example.com?page=1>; rel="first"'
      }
    });

    const response = new HttpResponse(mockResponse);
    const links = response.links();

    expect(links).toBeTruthy();
    expect(links?.hasNext()).toBe(true);
    expect(links?.getPagination().next).toBe('https://api.example.com?page=2');
    expect(links?.getPagination().first).toBe('https://api.example.com?page=1');
  });

  it('should return null if no Link header', () => {
    const mockResponse = new Response(null, {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const response = new HttpResponse(mockResponse);
    const links = response.links();

    expect(links).toBeNull();
  });

  it('should handle full pagination scenario', () => {
    const mockResponse = new Response(null, {
      status: 200,
      headers: {
        'Link': [
          '<https://api.example.com/users?page=3>; rel="next"',
          '<https://api.example.com/users?page=1>; rel="prev"',
          '<https://api.example.com/users?page=1>; rel="first"',
          '<https://api.example.com/users?page=10>; rel="last"'
        ].join(', ')
      }
    });

    const response = new HttpResponse(mockResponse);
    const links = response.links();

    expect(links?.hasNext()).toBe(true);
    expect(links?.hasPrev()).toBe(true);

    const pagination = links?.getPagination();
    expect(pagination?.next).toContain('page=3');
    expect(pagination?.prev).toContain('page=1');
    expect(pagination?.first).toContain('page=1');
    expect(pagination?.last).toContain('page=10');
  });

  it('should parse resource hints', () => {
    const mockResponse = new Response(null, {
      status: 200,
      headers: {
        'Link': [
          '<https://cdn.example.com/app.js>; rel="preload"; as="script"',
          '<https://api.example.com>; rel="preconnect"',
          '<https://cdn.example.com/style.css>; rel="prefetch"'
        ].join(', ')
      }
    });

    const response = new HttpResponse(mockResponse);
    const links = response.links();
    const hints = links?.getResourceHints();

    expect(hints?.preload).toHaveLength(1);
    expect(hints?.preconnect).toHaveLength(1);
    expect(hints?.prefetch).toHaveLength(1);
  });

  it('should parse language alternates', () => {
    const mockResponse = new Response(null, {
      status: 200,
      headers: {
        'Link': [
          '<https://example.com/en>; rel="alternate"; hreflang="en"',
          '<https://example.com/fr>; rel="alternate"; hreflang="fr"',
          '<https://example.com/de>; rel="alternate"; hreflang="de"'
        ].join(', ')
      }
    });

    const response = new HttpResponse(mockResponse);
    const links = response.links();
    const alternates = links?.getAlternates();

    expect(alternates).toHaveLength(3);
    expect(alternates?.map(link => link.hreflang)).toEqual(['en', 'fr', 'de']);
  });

  it('should get canonical URL', () => {
    const mockResponse = new Response(null, {
      status: 200,
      headers: {
        'Link': '<https://example.com/canonical-url>; rel="canonical"'
      }
    });

    const response = new HttpResponse(mockResponse);
    const links = response.links();

    expect(links?.getCanonical()).toBe('https://example.com/canonical-url');
  });

  it('should handle empty Link header gracefully', () => {
    const mockResponse = new Response(null, {
      status: 200,
      headers: {
        'Link': ''
      }
    });

    const response = new HttpResponse(mockResponse);
    const links = response.links();

    expect(links).toBeNull();
  });
});
