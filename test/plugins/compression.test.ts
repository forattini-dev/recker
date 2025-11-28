import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisting-safe mock
vi.mock('node:zlib', async () => {
    const gzip = vi.fn((buf: any, cb: any) => cb(null, Buffer.from('gzipped')));
    const deflate = vi.fn((buf: any, cb: any) => cb(null, Buffer.from('deflated')));
    const brotliCompress = vi.fn((buf: any, cb: any) => cb(null, Buffer.from('brotlied')));
    
    return {
        default: { gzip, deflate, brotliCompress }, // For default imports if any
        gzip,
        deflate,
        brotliCompress
    };
});

// Import plugin AFTER mock
import { compression, createCompressionMiddleware } from '../../src/plugins/compression.js';

describe('Compression Plugin', () => {
    let mockNext: any;

    beforeEach(() => {
        mockNext = vi.fn().mockImplementation(req => Promise.resolve({ ok: true, req }));
        vi.clearAllMocks(); // Reset call counts
    });

    it('should compress JSON body (gzip)', async () => {
        const middleware = compression({ threshold: 0 });
        const req = { 
            method: 'POST', 
            body: { foo: 'bar' },
            headers: new Headers({ 'content-type': 'application/json' }) 
        } as any;

        await middleware(req, mockNext);

        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.get('content-encoding')).toBe('gzip');
        expect(lastCall.body.toString()).toBe('gzipped');
    });

    // ... (keep other tests simple) ...

    it('should handle compression errors gracefully', async () => {
        // Access the mocked module to change implementation
        const zlib = await import('node:zlib');
        
        // Force error on next call
        // @ts-ignore
        zlib.gzip.mockImplementationOnce((buf, cb) => {
            cb(new Error('Zip Fail'), null);
        });

        const middleware = compression({ threshold: 0 });
        const req = { method: 'POST', body: 'data', headers: new Headers() } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        
        // Should send uncompressed due to error
        expect(lastCall.headers.has('content-encoding')).toBe(false);
        expect(lastCall.body).toBe('data');
    });
    
    it('should support deflate', async () => {
        const middleware = compression({ algorithm: 'deflate', threshold: 0, force: true });
        const req = { method: 'POST', body: 'test', headers: new Headers() } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.get('content-encoding')).toBe('deflate');
        expect(lastCall.body.toString()).toBe('deflated');
    });

    it('should support brotli', async () => {
        const middleware = compression({ algorithm: 'br', threshold: 0, force: true });
        const req = { method: 'POST', body: 'test', headers: new Headers() } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.get('content-encoding')).toBe('br');
        expect(lastCall.body.toString()).toBe('brotlied');
    });
    
    it('should skip small bodies', async () => {
        const middleware = compression({ threshold: 1000 });
        const req = { method: 'POST', body: 'small', headers: new Headers() } as any;
        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.has('content-encoding')).toBe(false);
    });

    it('helper: createCompressionMiddleware', () => {
        expect(createCompressionMiddleware(false)).toBeNull();
        expect(createCompressionMiddleware(true)).toBeTypeOf('function');
    });

    it('helper: createCompressionMiddleware with options', () => {
        const middleware = createCompressionMiddleware({ algorithm: 'br', threshold: 500 });
        expect(middleware).toBeTypeOf('function');
    });

    it('should skip GET requests by default', async () => {
        const middleware = compression({ threshold: 0 });
        const req = { method: 'GET', body: 'data', headers: new Headers() } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.has('content-encoding')).toBe(false);
    });

    it('should skip when Content-Encoding already set', async () => {
        const middleware = compression({ threshold: 0 });
        const headers = new Headers();
        headers.set('Content-Encoding', 'gzip');
        const req = { method: 'POST', body: 'data', headers } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall).toBe(req); // Should pass through unchanged
    });

    it('should skip when no body', async () => {
        const middleware = compression({ threshold: 0 });
        const req = { method: 'POST', body: null, headers: new Headers() } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.body).toBeNull();
    });

    it('should skip binary content-types', async () => {
        const middleware = compression({ threshold: 0 });
        const headers = new Headers();
        headers.set('Content-Type', 'image/png');
        const req = { method: 'POST', body: 'data', headers } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.has('content-encoding')).toBe(false);
    });

    it('should compress text/* content types', async () => {
        const middleware = compression({ threshold: 0, force: true });
        const headers = new Headers();
        headers.set('Content-Type', 'text/plain');
        const req = { method: 'POST', body: 'plain text content', headers } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.get('content-encoding')).toBe('gzip');
    });

    it('should compress application/xml content types', async () => {
        const middleware = compression({ threshold: 0, force: true });
        const headers = new Headers();
        headers.set('Content-Type', 'application/xml');
        const req = { method: 'POST', body: '<root>data</root>', headers } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.get('content-encoding')).toBe('gzip');
    });

    it('should compress application/javascript content types', async () => {
        const middleware = compression({ threshold: 0, force: true });
        const headers = new Headers();
        headers.set('Content-Type', 'application/javascript');
        const req = { method: 'POST', body: 'console.log("test")', headers } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.get('content-encoding')).toBe('gzip');
    });

    it('should compress application/x-www-form-urlencoded', async () => {
        const middleware = compression({ threshold: 0, force: true });
        const headers = new Headers();
        headers.set('Content-Type', 'application/x-www-form-urlencoded');
        const req = { method: 'POST', body: 'key=value&foo=bar', headers } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.get('content-encoding')).toBe('gzip');
    });

    it('should compress when no content-type (assume compressible)', async () => {
        const middleware = compression({ threshold: 0, force: true });
        const req = { method: 'POST', body: 'data', headers: new Headers() } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.get('content-encoding')).toBe('gzip');
    });

    it('should handle Buffer body', async () => {
        const middleware = compression({ threshold: 0, force: true });
        const req = { method: 'POST', body: Buffer.from('buffer data'), headers: new Headers() } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.get('content-encoding')).toBe('gzip');
    });

    it('should handle ArrayBuffer body', async () => {
        const middleware = compression({ threshold: 0, force: true });
        const arrayBuffer = new ArrayBuffer(8);
        const view = new Uint8Array(arrayBuffer);
        view.set([1, 2, 3, 4, 5, 6, 7, 8]);
        const req = { method: 'POST', body: arrayBuffer, headers: new Headers() } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.get('content-encoding')).toBe('gzip');
    });

    it('should skip compression when compressed is larger than original', async () => {
        // Make compressed larger than original
        const zlib = await import('node:zlib');
        // @ts-ignore
        zlib.gzip.mockImplementationOnce((buf, cb) => {
            cb(null, Buffer.alloc(1000)); // Much larger than original
        });

        const middleware = compression({ threshold: 0 });
        const req = { method: 'POST', body: 'x', headers: new Headers() } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.has('content-encoding')).toBe(false);
    });

    it('should compress even if larger when force=true', async () => {
        // Make compressed larger than original
        const zlib = await import('node:zlib');
        // @ts-ignore
        zlib.gzip.mockImplementationOnce((buf, cb) => {
            cb(null, Buffer.alloc(1000));
        });

        const middleware = compression({ threshold: 0, force: true });
        const req = { method: 'POST', body: 'x', headers: new Headers() } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.get('content-encoding')).toBe('gzip');
    });

    it('should use PUT method by default', async () => {
        const middleware = compression({ threshold: 0, force: true });
        const req = { method: 'PUT', body: 'data', headers: new Headers() } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.get('content-encoding')).toBe('gzip');
    });

    it('should use PATCH method by default', async () => {
        const middleware = compression({ threshold: 0, force: true });
        const req = { method: 'PATCH', body: 'data', headers: new Headers() } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.get('content-encoding')).toBe('gzip');
    });

    it('should respect custom methods array', async () => {
        const middleware = compression({ threshold: 0, methods: ['DELETE'], force: true });
        const req = { method: 'DELETE', body: 'data', headers: new Headers() } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.get('content-encoding')).toBe('gzip');
    });

    it('should set Content-Length header', async () => {
        const middleware = compression({ threshold: 0, force: true });
        const req = { method: 'POST', body: 'test data here', headers: new Headers() } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.get('content-length')).toBe('7'); // 'gzipped' length
    });

    it('should handle Blob body size', async () => {
        const middleware = compression({ threshold: 0, force: true });
        const blob = new Blob(['blob content'], { type: 'text/plain' });
        const req = { method: 'POST', body: blob, headers: new Headers() } as any;

        await middleware(req, mockNext);
        // Blob is passed through since toBuffer doesn't handle it
        expect(mockNext).toHaveBeenCalled();
    });

    it('should handle object body that fails to stringify', async () => {
        const middleware = compression({ threshold: 0 });
        const circular: any = {};
        circular.self = circular;
        const req = { method: 'POST', body: circular, headers: new Headers() } as any;

        await middleware(req, mockNext);
        // Should pass through due to toBuffer returning null
        expect(mockNext).toHaveBeenCalled();
    });
});
