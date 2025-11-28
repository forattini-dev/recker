import { describe, it, expect } from 'vitest';
import { createClient } from '../src/index.js';
import { MockTransport } from './helpers/mock-transport.js';
import { ReckerRequest } from '../src/types/index.js';

describe('Pagination', () => {
  const baseUrl = 'https://api.example.com';

  it('should paginate using Link header (Standard Item Iteration)', async () => {
    const mockTransport = new MockTransport();

    mockTransport.setMockResponse(
      'GET',
      '/items',
      200,
      [{ id: 1 }],
      { 'link': `<${baseUrl}/items?page=2>; rel="next"` }
    );

    mockTransport.setMockResponse(
      'GET',
      '/items?page=2',
      200,
      [{ id: 2 }]
    );

    const client = createClient({
      baseUrl,
      transport: mockTransport
    });

    const items: any[] = [];

    for await (const item of client.paginate('/items')) {
      items.push(item);
    }

    expect(items).toHaveLength(2);
    expect(items[0].id).toBe(1);
    expect(items[1].id).toBe(2);
  });

  it('should support client.page() for specific page', async () => {
    const mockTransport = new MockTransport();

    mockTransport.setMockResponse(
      'GET',
      '/users?page=5',
      200,
      { page: 5, data: ['User 5'] }
    );

    const client = createClient({
      baseUrl,
      transport: mockTransport
    });

    const res = await client.page('/users', 5).json<any>();
    expect(res.page).toBe(5);
    expect(res.data).toEqual(['User 5']);
  });

  it('should support client.pages() for response iteration', async () => {
    const mockTransport = new MockTransport();

    // Page 1
    mockTransport.setMockResponse(
      'GET',
      '/logs?p=1',
      200,
      { meta: { total: 20 }, items: [1, 2] }
    );

    // Page 2
    mockTransport.setMockResponse(
      'GET',
      '/logs?p=2',
      200,
      { meta: { total: 20 }, items: [3, 4] }
    );

    const client = createClient({
      baseUrl,
      transport: mockTransport
    });

    const pages = [];
    for await (const page of client.pages('/logs?p=1', { pageParam: 'p', maxPages: 2 })) {
      pages.push(page);
    }

    expect(pages).toHaveLength(2);
    expect(pages[0].pageNumber).toBe(1);
    expect(pages[0].data.items).toEqual([1, 2]);
    expect(pages[1].pageNumber).toBe(2);
    expect(pages[1].data.items).toEqual([3, 4]);
  });

  it('should support Cursor Path logic (Custom Transport)', async () => {
    class CursorTransport {
      async dispatch(req: ReckerRequest) {
        const url = req.url;
        if (url.endsWith('/feed')) {
          return {
            ok: true, status: 200, headers: new Headers(),
            json: async () => ({ items: [1], meta: { next: 'abc' } })
          } as any;
        }
        if (url.includes('cursor=abc')) {
          return {
            ok: true, status: 200, headers: new Headers(),
            json: async () => ({ items: [2], meta: { next: 'def' } })
          } as any;
        }
        if (url.includes('cursor=def')) {
          return {
            ok: true, status: 200, headers: new Headers(),
            json: async () => ({ items: [3], meta: { next: null } })
          } as any;
        }
        return { ok: false, status: 404 } as any;
      }
    }

    const client = createClient({
      baseUrl: 'http://test.local',
      transport: new CursorTransport()
    });

    // DEBUG: Check first page data directly
    const iterator = client.pages('/feed', { nextCursorPath: 'meta.next' });
    const first = await iterator.next();

    if (first.value) {
      // Check if data is correct
      if (first.value.data.meta.next !== 'abc') {
        throw new Error(`Data mismatch: ${JSON.stringify(first.value.data)}`);
      }
    } else {
      throw new Error('First page yield failed');
    }

    const items: any[] = [];
    // Reset and run full pagination
    for await (const item of client.paginate('/feed', { nextCursorPath: 'meta.next' })) {
      items.push(item);
    }

    expect(items).toEqual([1, 2, 3]);
  });
});
