import { describe, it, expect, vi } from 'vitest';
import { 
    webToNodeStream, 
    nodeToWebStream, 
    trackStreamProgress, 
    pipeStream, 
    createUploadStream 
} from '../../src/utils/streaming.js';
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

    describe('pipeStream with progress', () => {
        it('should track progress when onProgress is provided', async () => {
            const source = Readable.from([Buffer.from('hello world')]);
            const dest = new PassThrough();
            const onProgress = vi.fn();

            await pipeStream(source, dest, { onProgress, total: 11 });

            expect(onProgress).toHaveBeenCalled();
        });
    });

    describe('trackStreamProgress throttling', () => {
        it('should track progress without total', async () => {
            const source = Readable.from([Buffer.alloc(100), Buffer.alloc(100)]);
            const onProgress = vi.fn();

            const tracked = trackStreamProgress(source, { onProgress });

            for await (const _ of tracked) {}

            expect(onProgress).toHaveBeenCalled();
            const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1][0];
            expect(lastCall.percent).toBeUndefined();
        });

        it('should throttle progress updates when chunks arrive faster than 100ms', async () => {
            const progressCalls: Array<{loaded: number; percent?: number}> = [];
            const onProgress = vi.fn((p) => progressCalls.push(p));

            // Create a stream that emits data slowly enough for throttling to kick in
            const source = new Readable({
                read() {}
            });

            const tracked = trackStreamProgress(source, { onProgress, total: 300 });

            // Consume the stream asynchronously
            const chunks: Buffer[] = [];
            tracked.on('data', chunk => chunks.push(chunk));

            // Push data and wait for throttle window
            source.push(Buffer.alloc(100));
            await new Promise(r => setTimeout(r, 150)); // Wait > 100ms
            source.push(Buffer.alloc(100));
            await new Promise(r => setTimeout(r, 150));
            source.push(Buffer.alloc(100));
            source.push(null); // End stream

            // Wait for stream to finish
            await new Promise(r => tracked.on('end', r));

            // onProgress should have been called with percent values
            expect(onProgress).toHaveBeenCalled();
            const callsWithPercent = progressCalls.filter(p => p.percent !== undefined);
            expect(callsWithPercent.length).toBeGreaterThan(0);
        });
    });

    describe('webToNodeStream error handling', () => {
        it('should handle destroy with cancel', async () => {
            const cancelFn = vi.fn();
            const webStream = new ReadableStream({
                start(controller) {
                    controller.enqueue(Buffer.from('data'));
                },
                cancel: cancelFn
            });

            const nodeStream = webToNodeStream(webStream as any);

            // Read first chunk then destroy
            for await (const chunk of nodeStream) {
                nodeStream.destroy();
                break;
            }

            // Give time for cancel to be called
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(cancelFn).toHaveBeenCalled();
        });

    });

    describe('nodeToWebStream error and cancel', () => {
        it('should propagate errors from node stream', async () => {
            const nodeStream = new Readable({
                read() {
                    this.destroy(new Error('Node stream error'));
                }
            });

            const webStream = nodeToWebStream(nodeStream);
            const reader = webStream.getReader();

            await expect(reader.read()).rejects.toThrow('Node stream error');
        });

        it('should cancel node stream when web stream is cancelled', async () => {
            const destroyFn = vi.fn();
            let pushCount = 0;
            const nodeStream = new Readable({
                read() {
                    if (pushCount < 2) {
                        this.push(Buffer.from('data'));
                        pushCount++;
                    }
                },
                destroy(err, cb) {
                    destroyFn();
                    cb(err);
                }
            });

            const webStream = nodeToWebStream(nodeStream);
            const reader = webStream.getReader();

            // Read one chunk then cancel
            await reader.read();
            await reader.cancel();

            expect(destroyFn).toHaveBeenCalled();
        });
    });
});
