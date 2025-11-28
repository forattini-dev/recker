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
});
