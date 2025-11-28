import { describe, it, expect } from 'vitest';
import { Readable, Writable } from 'node:stream';
import {
  webToNodeStream,
  nodeToWebStream,
  trackStreamProgress,
  pipeStream,
  createUploadStream
} from '../src/utils/streaming.js';

describe('Streaming Utilities', () => {
  describe('webToNodeStream', () => {
    it('should convert Web ReadableStream to Node.js Readable', async () => {
      const webStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        }
      });

      const nodeStream = webToNodeStream(webStream);
      const chunks: Buffer[] = [];

      for await (const chunk of nodeStream) {
        chunks.push(chunk);
      }

      expect(Buffer.concat(chunks)).toEqual(Buffer.from([1, 2, 3]));
    });

    it('should handle empty stream', async () => {
      const webStream = new ReadableStream({
        start(controller) {
          controller.close();
        }
      });

      const nodeStream = webToNodeStream(webStream);
      const chunks: Buffer[] = [];

      for await (const chunk of nodeStream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(0);
    });
  });

  describe('nodeToWebStream', () => {
    it('should convert Node.js Readable to Web ReadableStream', async () => {
      const nodeStream = Readable.from([Buffer.from([1, 2, 3])]);
      const webStream = nodeToWebStream(nodeStream);
      const reader = webStream.getReader();

      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      expect(Buffer.concat(chunks.map(c => Buffer.from(c)))).toEqual(Buffer.from([1, 2, 3]));
    });

    it('should handle empty stream', async () => {
      const nodeStream = Readable.from([]);
      const webStream = nodeToWebStream(nodeStream);
      const reader = webStream.getReader();

      const { done } = await reader.read();
      expect(done).toBe(true);
    });
  });

  describe('trackStreamProgress', () => {
    it('should track progress with total size', async () => {
      const nodeStream = Readable.from([Buffer.from('x'.repeat(1000))]);

      const progressUpdates: Array<{ loaded: number; percent?: number }> = [];

      const tracked = trackStreamProgress(nodeStream, {
        total: 1000,
        onProgress: (progress) => {
          progressUpdates.push({ loaded: progress.loaded, percent: progress.percent });
        }
      });

      for await (const chunk of tracked) {
        // Consume
      }

      expect(progressUpdates.length).toBeGreaterThan(0);
      const lastUpdate = progressUpdates[progressUpdates.length - 1];
      expect(lastUpdate.loaded).toBe(1000);
      expect(lastUpdate.percent).toBe(100);
    });

    it('should work without progress callback', async () => {
      const nodeStream = Readable.from([Buffer.from('test')]);
      const tracked = trackStreamProgress(nodeStream);

      const chunks: Buffer[] = [];
      for await (const chunk of tracked) {
        chunks.push(chunk);
      }

      expect(Buffer.concat(chunks).toString()).toBe('test');
    });
  });

  describe('pipeStream', () => {
    it('should pipe from source to destination', async () => {
      const source = Readable.from([Buffer.from('Hello ')]);

      const chunks: Buffer[] = [];
      const destination = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(chunk);
          callback();
        }
      });

      await pipeStream(source, destination);

      expect(Buffer.concat(chunks).toString()).toBe('Hello ');
    });

    it('should pipe with progress tracking', async () => {
      const source = Readable.from([Buffer.from('x'.repeat(500))]);

      const progressUpdates: number[] = [];
      const chunks: Buffer[] = [];

      const destination = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(chunk);
          callback();
        }
      });

      await pipeStream(source, destination, {
        total: 500,
        onProgress: (progress) => {
          progressUpdates.push(progress.loaded);
        }
      });

      expect(Buffer.concat(chunks).length).toBe(500);
      expect(progressUpdates.length).toBeGreaterThan(0);
    });
  });

  describe('createUploadStream', () => {
    it('should create upload stream', async () => {
      const source = Readable.from([Buffer.from('upload')]);

      const { stream, promise } = createUploadStream(source);

      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      await promise;

      const result = Buffer.concat(chunks.map(c => Buffer.from(c))).toString();
      expect(result).toBe('upload');
    });
  });
});
