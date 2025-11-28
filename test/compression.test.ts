import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compression, createCompressionMiddleware } from '../src/plugins/compression.js';

// Create mock functions using vi.hoisted to ensure they're available before vi.mock
const { mockGzip, mockDeflate, mockBrotli } = vi.hoisted(() => ({
    mockGzip: vi.fn((buf: any, cb: any) => cb(null, Buffer.from('gzipped'))),
    mockDeflate: vi.fn((buf: any, cb: any) => cb(null, Buffer.from('deflated'))),
    mockBrotli: vi.fn((buf: any, cb: any) => cb(null, Buffer.from('brotlied')))
}));

// Mock zlib
vi.mock('node:zlib', () => ({
    gzip: mockGzip,
    deflate: mockDeflate,
    brotliCompress: mockBrotli
}));

describe('Compression Plugin', () => {
    let mockNext: any;

    beforeEach(() => {
        mockNext = vi.fn().mockImplementation(req => Promise.resolve({ ok: true, req }));
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

    it('should skip small bodies', async () => {
        const middleware = compression({ threshold: 1000 });
        const req = { 
            method: 'POST', 
            body: 'small', 
            headers: new Headers() 
        } as any;

        await middleware(req, mockNext);
        
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.has('content-encoding')).toBe(false);
    });

    it('should force compression if configured', async () => {
        const middleware = compression({ threshold: 1000, force: true });
        const req = { method: 'POST', body: 'small', headers: new Headers() } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.get('content-encoding')).toBe('gzip');
    });

    it('should support deflate', async () => {
        // force: true to bypass size check (mock returns larger data)
        const middleware = compression({ algorithm: 'deflate', threshold: 0, force: true });
        const req = { method: 'POST', body: 'test', headers: new Headers() } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.get('content-encoding')).toBe('deflate');
        expect(lastCall.body.toString()).toBe('deflated');
    });

    it('should support brotli', async () => {
        // force: true to bypass size check (mock returns larger data)
        const middleware = compression({ algorithm: 'br', threshold: 0, force: true });
        const req = { method: 'POST', body: 'test', headers: new Headers() } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];
        expect(lastCall.headers.get('content-encoding')).toBe('br');
        expect(lastCall.body.toString()).toBe('brotlied');
    });

    it('should handle compression errors gracefully', async () => {
        // Make the mock fail once
        mockGzip.mockImplementationOnce((buf: any, cb: any) => {
            cb(new Error('Zip Fail'), null);
        });

        const middleware = compression({ threshold: 0 });
        const req = { method: 'POST', body: 'data', headers: new Headers() } as any;

        await middleware(req, mockNext);
        const lastCall = mockNext.mock.calls[0][0];

        // Should send uncompressed
        expect(lastCall.headers.has('content-encoding')).toBe(false);
        expect(lastCall.body).toBe('data');
    });

    it('helper: createCompressionMiddleware', () => {
        expect(createCompressionMiddleware(false)).toBeNull();
        expect(createCompressionMiddleware(true)).toBeTypeOf('function');
        expect(createCompressionMiddleware({})).toBeTypeOf('function');
    });
});