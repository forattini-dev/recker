import { describe, it, expect, vi } from 'vitest';
import { uploadParallel } from '../../src/utils/upload.js';
import { Readable } from 'node:stream';

describe('Upload Utils', () => {
  describe('uploadParallel', () => {
    it('should upload buffer in chunks', async () => {
      const buffer = Buffer.alloc(100);
      const uploadChunk = vi.fn().mockResolvedValue(undefined);
      const onProgress = vi.fn();

      await uploadParallel({
        file: buffer,
        chunkSize: 30,
        uploadChunk,
        onProgress
      });

      // 100 bytes / 30 bytes per chunk = 4 chunks (30 + 30 + 30 + 10)
      expect(uploadChunk).toHaveBeenCalledTimes(4);
      expect(onProgress).toHaveBeenCalled();
    });

    it('should resume buffer upload from specific chunk', async () => {
      const buffer = Buffer.alloc(100);
      const uploadChunk = vi.fn().mockResolvedValue(undefined);

      await uploadParallel({
        file: buffer,
        chunkSize: 30,
        uploadChunk,
        resumeFromChunk: 2 // Skip first 2 chunks (60 bytes)
      });

      // Should start from byte 60, leaving 40 bytes = 2 chunks (30 + 10)
      expect(uploadChunk).toHaveBeenCalledTimes(2);
    });

    it('should handle resume beyond buffer size', async () => {
      const buffer = Buffer.alloc(50);
      const uploadChunk = vi.fn().mockResolvedValue(undefined);

      await uploadParallel({
        file: buffer,
        chunkSize: 30,
        uploadChunk,
        resumeFromChunk: 10 // Way beyond buffer
      });

      // Start is capped at total, so no chunks
      expect(uploadChunk).not.toHaveBeenCalled();
    });

    it('should upload stream in chunks', async () => {
      const stream = Readable.from([
        Buffer.alloc(30),
        Buffer.alloc(30),
        Buffer.alloc(30),
        Buffer.alloc(10)
      ]);
      const uploadChunk = vi.fn().mockResolvedValue(undefined);
      const onProgress = vi.fn();

      await uploadParallel({
        file: stream,
        chunkSize: 30,
        uploadChunk,
        onProgress
      });

      expect(uploadChunk).toHaveBeenCalledTimes(4);
      expect(onProgress).toHaveBeenCalled();
    });

    it('should resume stream upload from specific chunk', async () => {
      const stream = Readable.from([
        Buffer.alloc(30),
        Buffer.alloc(30),
        Buffer.alloc(30),
        Buffer.alloc(10)
      ]);
      const uploadChunk = vi.fn().mockResolvedValue(undefined);

      await uploadParallel({
        file: stream,
        chunkSize: 30,
        uploadChunk,
        resumeFromChunk: 2 // Skip first 60 bytes
      });

      // Should skip first 2 chunks (60 bytes), leaving 40 bytes = 2 chunks
      expect(uploadChunk).toHaveBeenCalledTimes(2);
    });

    it('should handle stream with partial skip', async () => {
      // Create stream with chunks smaller than skip boundary
      const stream = Readable.from([
        Buffer.alloc(20),
        Buffer.alloc(20),
        Buffer.alloc(20),
        Buffer.alloc(40)
      ]);
      const uploadChunk = vi.fn().mockResolvedValue(undefined);

      await uploadParallel({
        file: stream,
        chunkSize: 30,
        uploadChunk,
        resumeFromChunk: 1 // Skip first 30 bytes
      });

      // 100 total bytes, skip 30, process 70 = 3 chunks (30 + 30 + 10)
      expect(uploadChunk).toHaveBeenCalledTimes(3);
    });

    it('should respect concurrency setting', async () => {
      const buffer = Buffer.alloc(100);
      const uploadChunk = vi.fn().mockResolvedValue(undefined);

      await uploadParallel({
        file: buffer,
        chunkSize: 20,
        concurrency: 2, // Use concurrency setting
        uploadChunk
      });

      // 100 / 20 = 5 chunks
      expect(uploadChunk).toHaveBeenCalledTimes(5);
    });

    it('should handle remaining buffer after stream ends', async () => {
      // Stream with chunks that don't align to chunk size
      const stream = Readable.from([
        Buffer.alloc(25),
        Buffer.alloc(25),
        Buffer.alloc(25),
        Buffer.alloc(25) // 100 total
      ]);
      const uploadChunk = vi.fn().mockResolvedValue(undefined);

      await uploadParallel({
        file: stream,
        chunkSize: 30, // Won't divide evenly
        uploadChunk
      });

      // 100 / 30 = 3 chunks + 10 byte remainder = 4 chunks
      expect(uploadChunk).toHaveBeenCalledTimes(4);
    });

    it('should use default values', async () => {
      const buffer = Buffer.alloc(100);
      const uploadChunk = vi.fn().mockResolvedValue(undefined);

      await uploadParallel({
        file: buffer,
        uploadChunk
        // Uses default chunkSize (5MB) and concurrency (3)
      });

      // With 5MB chunk size, 100 bytes is just 1 chunk
      expect(uploadChunk).toHaveBeenCalledTimes(1);
    });
  });
});
