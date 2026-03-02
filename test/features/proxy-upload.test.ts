import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../../src/core/client.js';
import { proxyRotatorPlugin } from '../../src/plugins/proxy-rotator.js';
import { uploadParallel } from '../../src/utils/upload.js';
import { ReckerRequest } from '../../src/types/index.js';
import { Readable } from 'node:stream';

describe('Advanced Utils', () => {
    it('Proxy Rotator: should set proxy list on client defaults', () => {
        const proxies = ['http://proxy1.com', 'http://proxy2.com'];
        const client = createClient({
            baseUrl: 'http://test.com',
            plugins: [proxyRotatorPlugin({ proxies, strategy: 'round-robin' })]
        });

        // proxyRotatorPlugin sets client.defaults.proxy to the proxy list;
        // the actual round-robin rotation is handled by the transport layer.
        expect((client as any).defaults.proxy).toEqual(proxies);
    });

    it('Upload Parallel: should chunk buffer', async () => {
        const buffer = Buffer.alloc(15 * 1024 * 1024); // 15MB
        const uploadedChunks: number[] = [];
        
        await uploadParallel({
            file: buffer,
            chunkSize: 5 * 1024 * 1024, // 5MB chunks
            concurrency: 2,
            uploadChunk: async (chunk, index) => {
                uploadedChunks.push(index);
                await new Promise(r => setTimeout(r, 10));
            }
        });

        expect(uploadedChunks.length).toBe(3);
        expect(uploadedChunks).toContain(0);
        expect(uploadedChunks).toContain(1);
        expect(uploadedChunks).toContain(2);
    });

    it('Upload Parallel: should chunk stream', async () => {
        // Create a stream of 3 chunks
        const chunks = [Buffer.from('1'), Buffer.from('2'), Buffer.from('3')];
        const stream = Readable.from(chunks);
        
        const uploaded: string[] = [];

        await uploadParallel({
            file: stream,
            chunkSize: 1, // 1 byte chunks
            concurrency: 1,
            uploadChunk: async (chunk, index) => {
                uploaded.push(chunk.toString());
            }
        });

        expect(uploaded).toEqual(['1', '2', '3']);
    });
});
