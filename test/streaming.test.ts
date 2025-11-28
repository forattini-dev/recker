import { describe, it, expect, vi } from 'vitest';
import { 
    webToNodeStream, 
    nodeToWebStream, 
    trackStreamProgress, 
    pipeStream, 
    createUploadStream 
} from '../src/utils/streaming.js';
import { Readable, PassThrough } from 'node:stream';
import { ReadableStream } from 'node:stream/web';

describe('Streaming Utils', () => {
    describe('webToNodeStream', () => {
        it('should convert Web ReadableStream to Node Readable', async () => {
            const webStream = new ReadableStream({
                start(controller) {
                    controller.enqueue(Buffer.from('chunk1'));
                    controller.enqueue(Buffer.from('chunk2'));
                    controller.close();
                }
            });

            const nodeStream = webToNodeStream(webStream as any);
            const chunks: Buffer[] = [];

            for await (const chunk of nodeStream) {
                chunks.push(Buffer.from(chunk));
            }

            expect(Buffer.concat(chunks).toString()).toBe('chunk1chunk2');
        });
    });

    describe('nodeToWebStream', () => {
        it('should convert Node Readable to Web ReadableStream', async () => {
            const nodeStream = Readable.from([Buffer.from('a'), Buffer.from('b'), Buffer.from('c')]);
            const webStream = nodeToWebStream(nodeStream);
            const reader = webStream.getReader();

            let result = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) result += Buffer.from(value).toString();
            }

            expect(result).toBe('abc');
        });
    });

    describe('trackStreamProgress', () => {
        it('should emit progress events', async () => {
            const source = Readable.from([Buffer.alloc(100), Buffer.alloc(100)]);
            const onProgress = vi.fn();

            const tracked = trackStreamProgress(source, { 
                onProgress, 
                total: 200 
            });

            for await (const _ of tracked) {}

            expect(onProgress).toHaveBeenCalled();
            const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1][0];
            expect(lastCall.loaded).toBe(200);
        });
    });

    describe('pipeStream', () => {
        it('should pipe data correctly', async () => {
            const source = Readable.from([Buffer.from('hello')]);
            const dest = new PassThrough();
            const chunks: any[] = [];
            dest.on('data', c => chunks.push(c));

            await pipeStream(source, dest);
            
            expect(Buffer.concat(chunks).toString()).toBe('hello');
        });
    });

    describe('createUploadStream', () => {
        it('should create a stream and promise', async () => {
            const source = Readable.from([Buffer.from('upload')]);
            const { stream, promise } = createUploadStream(source);

            const reader = stream.getReader();
            while (true) {
                const { done } = await reader.read();
                if (done) break;
            }

            await expect(promise).resolves.toBeUndefined();
        });
        
        it('should handle errors', async () => {
             const source = new Readable({
                 read() { 
                     this.destroy(new Error('Upload Fail')); 
                 }
             });
             const { stream, promise } = createUploadStream(source);
             
             const reader = stream.getReader();
             try {
                 while(true) await reader.read();
             } catch {}
             
             await expect(promise).rejects.toThrow('Upload Fail');
        });
    });
});
