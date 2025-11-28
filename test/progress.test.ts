import { describe, it, expect } from 'vitest';
import { ProgressEvent } from '../src/index.js';
import { createProgressStream, calculateProgress } from '../src/utils/progress.js';

describe('Progress Tracking', () => {
  describe('createProgressStream', () => {
    it('should emit progress events with transferred field (got compatibility)', async () => {
      const data = new TextEncoder().encode('x'.repeat(1000));
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        }
      });

      const progressEvents: ProgressEvent[] = [];
      const progressStream = createProgressStream(stream, (event) => {
        progressEvents.push(event);
      }, { total: data.length, direction: 'download' });

      // Consume the stream
      const reader = progressStream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      // Verify we got progress events
      expect(progressEvents.length).toBeGreaterThan(0);

      // Verify each event has both loaded and transferred
      for (const event of progressEvents) {
        expect(event.loaded).toBeDefined();
        expect(event.transferred).toBeDefined();
        expect(event.loaded).toBe(event.transferred);
      }
    });

    it('should include direction field', async () => {
      const data = new TextEncoder().encode('test data');
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        }
      });

      const progressEvents: ProgressEvent[] = [];
      const progressStream = createProgressStream(stream, (event) => {
        progressEvents.push(event);
      }, { total: data.length, direction: 'download' });

      // Consume the stream
      const reader = progressStream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      // Verify direction is set
      const downloadEvents = progressEvents.filter(e => e.direction === 'download');
      expect(downloadEvents.length).toBeGreaterThan(0);
    });

    it('should emit initial 0% and final 100% events', async () => {
      const data = new TextEncoder().encode('x'.repeat(500));
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        }
      });

      const progressEvents: ProgressEvent[] = [];
      const progressStream = createProgressStream(stream, (event) => {
        progressEvents.push(event);
      }, { total: data.length, direction: 'download' });

      // Consume the stream
      const reader = progressStream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      // First event should be 0%
      expect(progressEvents[0].loaded).toBe(0);

      // Last event should be 100%
      const lastEvent = progressEvents[progressEvents.length - 1];
      expect(lastEvent.percent).toBe(100);
    });

    it('should calculate rate', async () => {
      const data = new TextEncoder().encode('x'.repeat(1000));
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        }
      });

      const progressEvents: ProgressEvent[] = [];
      const progressStream = createProgressStream(stream, (event) => {
        progressEvents.push(event);
      }, { total: data.length, direction: 'download' });

      // Consume the stream
      const reader = progressStream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      // Verify rate is calculated
      expect(progressEvents.length).toBeGreaterThan(0);
      const lastEvent = progressEvents[progressEvents.length - 1];
      expect(lastEvent.rate).toBeDefined();
    });

    it('should support backward compatible total as number', async () => {
      const data = new TextEncoder().encode('test');
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        }
      });

      const progressEvents: ProgressEvent[] = [];
      // Using old signature (total as number)
      const progressStream = createProgressStream(stream, (event) => {
        progressEvents.push(event);
      }, data.length);

      // Consume the stream
      const reader = progressStream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(progressEvents.length).toBeGreaterThan(0);
      // When using old signature, direction should be undefined
      expect(progressEvents[0].direction).toBeUndefined();
      // But total should be set
      expect(progressEvents[0].total).toBe(data.length);
    });
  });

  describe('calculateProgress', () => {
    it('should calculate progress with transferred field', () => {
      const progress = calculateProgress(500, 1000, 'download');

      expect(progress.loaded).toBe(500);
      expect(progress.transferred).toBe(500);
      expect(progress.total).toBe(1000);
      expect(progress.percent).toBe(50);
      expect(progress.direction).toBe('download');
    });

    it('should handle unknown total', () => {
      const progress = calculateProgress(500, undefined, 'upload');

      expect(progress.loaded).toBe(500);
      expect(progress.transferred).toBe(500);
      expect(progress.total).toBeUndefined();
      expect(progress.percent).toBeUndefined();
      expect(progress.direction).toBe('upload');
    });

    it('should work without direction', () => {
      const progress = calculateProgress(100, 200);

      expect(progress.loaded).toBe(100);
      expect(progress.transferred).toBe(100);
      expect(progress.percent).toBe(50);
      expect(progress.direction).toBeUndefined();
    });
  });

  describe('ProgressEvent interface', () => {
    it('should have all required and optional fields', () => {
      // Test that the interface has the expected shape
      const event: ProgressEvent = {
        loaded: 100,
        transferred: 100,
        total: 1000,
        percent: 10,
        rate: 1000,
        estimated: 900,
        direction: 'download'
      };

      expect(event.loaded).toBe(100);
      expect(event.transferred).toBe(100); // got compatibility
      expect(event.total).toBe(1000);
      expect(event.percent).toBe(10);
      expect(event.rate).toBe(1000);
      expect(event.estimated).toBe(900);
      expect(event.direction).toBe('download');
    });

    it('should allow optional fields to be undefined', () => {
      const event: ProgressEvent = {
        loaded: 50,
        transferred: 50
      };

      expect(event.loaded).toBe(50);
      expect(event.transferred).toBe(50);
      expect(event.total).toBeUndefined();
      expect(event.percent).toBeUndefined();
      expect(event.rate).toBeUndefined();
      expect(event.estimated).toBeUndefined();
      expect(event.direction).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should propagate stream errors', async () => {
      const error = new Error('Stream error');
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data'));
        },
        pull() {
          throw error;
        }
      });

      const progressStream = createProgressStream(stream, () => {}, { total: 100 });
      const reader = progressStream.getReader();

      await expect((async () => {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      })()).rejects.toThrow('Stream error');
    });
  });
});
