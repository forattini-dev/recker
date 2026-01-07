import { describe, it, expect } from 'vitest';
import { Http2Error, parseHttp2Error, Http2ErrorCode } from '../../src/core/errors.js';

describe('HTTP/2 Error Handling', () => {
  describe('Http2Error class', () => {
    it('should create Http2Error with basic properties', () => {
      const error = new Http2Error('Test HTTP/2 error', 'PROTOCOL_ERROR');

      expect(error.name).toBe('Http2Error');
      expect(error.message).toBe('Test HTTP/2 error');
      expect(error.errorCode).toBe('PROTOCOL_ERROR');
      expect(error.level).toBe('stream');
      expect(error.streamId).toBeUndefined();
    });

    it('should set session level', () => {
      const error = new Http2Error('Session error', 'GOAWAY', { level: 'session' });

      expect(error.level).toBe('session');
    });

    it('should include stream ID for stream-level errors', () => {
      const error = new Http2Error('Stream error', 'CANCEL', {
        level: 'stream',
        streamId: 123,
      });

      expect(error.level).toBe('stream');
      expect(error.streamId).toBe(123);
    });

    it('should mark retriable errors correctly', () => {
      // Retriable: NO_ERROR, INTERNAL_ERROR, REFUSED_STREAM, ENHANCE_YOUR_CALM, CANCEL
      const retriableCodes: Http2ErrorCode[] = ['NO_ERROR', 'INTERNAL_ERROR', 'REFUSED_STREAM', 'ENHANCE_YOUR_CALM', 'CANCEL'];
      for (const code of retriableCodes) {
        const error = new Http2Error(`Error: ${code}`, code);
        expect(error.retriable).toBe(true);
      }

      // Non-retriable
      const nonRetriable: Http2ErrorCode[] = ['PROTOCOL_ERROR', 'FLOW_CONTROL_ERROR', 'HTTP_1_1_REQUIRED'];
      for (const code of nonRetriable) {
        const error = new Http2Error(`Error: ${code}`, code);
        expect(error.retriable).toBe(false);
      }
    });

    it('should suggest fallback for appropriate errors', () => {
      const fallbackCodes: Http2ErrorCode[] = ['HTTP_1_1_REQUIRED', 'INADEQUATE_SECURITY', 'PROTOCOL_ERROR', 'COMPRESSION_ERROR'];
      for (const code of fallbackCodes) {
        const error = new Http2Error(`Error: ${code}`, code);
        expect(error.suggestFallback).toBe(true);
      }

      const noFallbackCodes: Http2ErrorCode[] = ['NO_ERROR', 'INTERNAL_ERROR', 'CANCEL'];
      for (const code of noFallbackCodes) {
        const error = new Http2Error(`Error: ${code}`, code);
        expect(error.suggestFallback).toBe(false);
      }
    });

    it('should provide relevant suggestions', () => {
      const error = new Http2Error('Rate limited', 'ENHANCE_YOUR_CALM');
      expect(error.suggestions).toContain('Server is rate limiting. Implement exponential backoff.');

      const refusedError = new Http2Error('Refused', 'REFUSED_STREAM');
      expect(refusedError.suggestions).toContain('Server is overloaded. Retry with backoff.');

      const h1RequiredError = new Http2Error('HTTP/1.1 required', 'HTTP_1_1_REQUIRED');
      expect(h1RequiredError.suggestions).toContain('Server requires HTTP/1.1 for this request.');
    });
  });

  describe('parseHttp2Error', () => {
    it('should return null for non-HTTP/2 errors', () => {
      const error = new Error('Connection refused');
      expect(parseHttp2Error(error)).toBeNull();

      const networkError = new Error('Network error');
      (networkError as any).code = 'ECONNREFUSED';
      expect(parseHttp2Error(networkError)).toBeNull();
    });

    it('should parse GOAWAY errors', () => {
      const error = new Error('GOAWAY received');
      const parsed = parseHttp2Error(error);

      expect(parsed).not.toBeNull();
      expect(parsed!.errorCode).toBe('NO_ERROR');
      expect(parsed!.level).toBe('session');
      expect(parsed!.message).toContain('GOAWAY');
    });

    it('should parse GOAWAY from error code', () => {
      const error = new Error('Connection closed');
      (error as any).code = 'ERR_HTTP2_GOAWAY';
      const parsed = parseHttp2Error(error);

      expect(parsed).not.toBeNull();
      expect(parsed!.level).toBe('session');
    });

    it('should parse RST_STREAM errors', () => {
      const error = new Error('RST_STREAM received');
      const parsed = parseHttp2Error(error);

      expect(parsed).not.toBeNull();
      expect(parsed!.level).toBe('stream');
    });

    it('should extract error code from RST_STREAM message', () => {
      const error = new Error('RST_STREAM code: REFUSED_STREAM');
      const parsed = parseHttp2Error(error);

      expect(parsed).not.toBeNull();
      expect(parsed!.errorCode).toBe('REFUSED_STREAM');
    });

    it('should parse specific HTTP/2 error codes in message', () => {
      const codes: Http2ErrorCode[] = [
        'PROTOCOL_ERROR',
        'INTERNAL_ERROR',
        'FLOW_CONTROL_ERROR',
        'REFUSED_STREAM',
        'ENHANCE_YOUR_CALM',
        'HTTP_1_1_REQUIRED',
      ];

      for (const code of codes) {
        const error = new Error(`HTTP/2 error: ${code} occurred`);
        const parsed = parseHttp2Error(error);

        expect(parsed).not.toBeNull();
        expect(parsed!.errorCode).toBe(code);
      }
    });

    it('should parse ERR_HTTP2_* Node.js error codes', () => {
      const error = new Error('Stream was destroyed');
      (error as any).code = 'ERR_HTTP2_STREAM_ERROR';
      const parsed = parseHttp2Error(error);

      expect(parsed).not.toBeNull();
      expect(parsed!.errorCode).toBe('STREAM_ERROR');
      expect(parsed!.level).toBe('session');
    });

    it('should detect session-level errors from message context', () => {
      const error = new Error('session error: PROTOCOL_ERROR');
      const parsed = parseHttp2Error(error);

      expect(parsed).not.toBeNull();
      expect(parsed!.level).toBe('session');
    });
  });

  describe('Integration with transport', () => {
    it('should export parseHttp2Error function', async () => {
      const { parseHttp2Error: importedFn } = await import('../../src/core/errors.js');
      expect(typeof importedFn).toBe('function');
    });

    it('should be importable from main entry', async () => {
      const { Http2Error: ImportedError, parseHttp2Error: importedFn } = await import('../../src/index.js');
      expect(ImportedError).toBeDefined();
      expect(typeof importedFn).toBe('function');
    });
  });
});
