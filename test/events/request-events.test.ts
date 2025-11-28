import { describe, it, expect, vi } from 'vitest';
import {
  createRequestEvents,
  createEventStream,
  RequestEventEmitter,
  type ProgressEvent,
} from '../../src/events/request-events.js';

describe('Request Events API', () => {
  describe('createRequestEvents', () => {
    it('should create an event emitter', () => {
      const events = createRequestEvents();
      expect(events).toBeInstanceOf(RequestEventEmitter);
    });

    it('should emit and receive events', () => {
      const events = createRequestEvents();
      const callback = vi.fn();

      events.on('downloadProgress', callback);
      events.emit('downloadProgress', {
        loaded: 100,
        transferred: 100,
        total: 1000,
        percent: 10,
        rate: 1000,
        direction: 'download',
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          loaded: 100,
          transferred: 100,
          total: 1000,
          percent: 10,
        })
      );
    });

    it('should support once listener', () => {
      const events = createRequestEvents();
      const callback = vi.fn();

      events.once('response', callback);

      events.emit('response', { status: 200, statusText: 'OK', headers: new Headers(), url: 'https://example.com' });
      events.emit('response', { status: 201, statusText: 'Created', headers: new Headers(), url: 'https://example.com' });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should support off to remove listener', () => {
      const events = createRequestEvents();
      const callback = vi.fn();

      events.on('downloadProgress', callback);
      events.off('downloadProgress', callback);

      events.emit('downloadProgress', { loaded: 100, transferred: 100 });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should support all event types', () => {
      const events = createRequestEvents();

      const handlers = {
        request: vi.fn(),
        response: vi.fn(),
        downloadProgress: vi.fn(),
        uploadProgress: vi.fn(),
        retry: vi.fn(),
        redirect: vi.fn(),
        complete: vi.fn(),
        error: vi.fn(),
      };

      events.on('request', handlers.request);
      events.on('response', handlers.response);
      events.on('downloadProgress', handlers.downloadProgress);
      events.on('uploadProgress', handlers.uploadProgress);
      events.on('retry', handlers.retry);
      events.on('redirect', handlers.redirect);
      events.on('complete', handlers.complete);
      events.on('error', handlers.error);

      // Emit all events
      events.emit('request', {} as any);
      events.emit('response', { status: 200, statusText: 'OK', headers: new Headers(), url: '' });
      events.emit('downloadProgress', { loaded: 0, transferred: 0 });
      events.emit('uploadProgress', { loaded: 0, transferred: 0 });
      events.emit('retry', { attempt: 1, maxAttempts: 3, error: new Error(''), delay: 1000 });
      events.emit('redirect', { from: 'a', to: 'b', status: 302 });
      events.emit('complete', {} as any);
      events.emit('error', new Error('test'));

      Object.values(handlers).forEach((handler) => {
        expect(handler).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('createEventStream', () => {
    it('should wrap stream and emit progress events', async () => {
      const events = createRequestEvents();
      const progressEvents: ProgressEvent[] = [];

      events.on('downloadProgress', (progress) => {
        progressEvents.push(progress);
      });

      const data = new TextEncoder().encode('x'.repeat(1000));
      const sourceStream = new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      });

      const eventStream = createEventStream(sourceStream, events, {
        total: data.length,
        direction: 'download',
      });

      // Consume the stream
      const reader = eventStream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      // Should have emitted progress events
      expect(progressEvents.length).toBeGreaterThan(0);

      // Last event should be 100%
      const lastEvent = progressEvents[progressEvents.length - 1];
      expect(lastEvent.percent).toBe(100);
      expect(lastEvent.direction).toBe('download');
    });

    it('should emit upload progress events', async () => {
      const events = createRequestEvents();
      const progressEvents: ProgressEvent[] = [];

      events.on('uploadProgress', (progress) => {
        progressEvents.push(progress);
      });

      const data = new TextEncoder().encode('upload data');
      const sourceStream = new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      });

      const eventStream = createEventStream(sourceStream, events, {
        total: data.length,
        direction: 'upload',
      });

      // Consume the stream
      const reader = eventStream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(progressEvents.length).toBeGreaterThan(0);

      // All events should have direction 'upload'
      progressEvents.forEach((event) => {
        expect(event.direction).toBe('upload');
      });
    });

    it('should pass through stream data unchanged', async () => {
      const events = createRequestEvents();

      const originalData = new TextEncoder().encode('Hello, World!');
      const sourceStream = new ReadableStream({
        start(controller) {
          controller.enqueue(originalData);
          controller.close();
        },
      });

      const eventStream = createEventStream(sourceStream, events, {
        total: originalData.length,
        direction: 'download',
      });

      // Consume and collect data
      const chunks: Uint8Array[] = [];
      const reader = eventStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }

      // Combine chunks
      const receivedData = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        receivedData.set(chunk, offset);
        offset += chunk.length;
      }

      // Verify data is unchanged
      expect(receivedData).toEqual(originalData);
    });

    it('should handle chunked streams', async () => {
      const events = createRequestEvents();
      const progressEvents: ProgressEvent[] = [];

      events.on('downloadProgress', (progress) => {
        progressEvents.push(progress);
      });

      // Create a stream with multiple chunks
      let chunkIndex = 0;
      const chunks = [
        new TextEncoder().encode('chunk1'),
        new TextEncoder().encode('chunk2'),
        new TextEncoder().encode('chunk3'),
      ];
      const totalSize = chunks.reduce((acc, c) => acc + c.length, 0);

      const sourceStream = new ReadableStream({
        pull(controller) {
          if (chunkIndex < chunks.length) {
            controller.enqueue(chunks[chunkIndex]);
            chunkIndex++;
          } else {
            controller.close();
          }
        },
      });

      const eventStream = createEventStream(sourceStream, events, {
        total: totalSize,
        direction: 'download',
        throttleMs: 0, // Disable throttling for test
      });

      // Consume the stream
      const reader = eventStream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      // Should have emitted progress events
      expect(progressEvents.length).toBeGreaterThan(0);

      // Last event should indicate completion
      const lastEvent = progressEvents[progressEvents.length - 1];
      expect(lastEvent.loaded).toBe(totalSize);
    });

    it('should work without total size (unknown content-length)', async () => {
      const events = createRequestEvents();
      const progressEvents: ProgressEvent[] = [];

      events.on('downloadProgress', (progress) => {
        progressEvents.push(progress);
      });

      const data = new TextEncoder().encode('streaming data');
      const sourceStream = new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      });

      // No total specified
      const eventStream = createEventStream(sourceStream, events, {
        direction: 'download',
      });

      // Consume the stream
      const reader = eventStream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(progressEvents.length).toBeGreaterThan(0);

      // Percent should be undefined when total is unknown
      const midEvent = progressEvents[0];
      expect(midEvent.total).toBeUndefined();
    });
  });
});
