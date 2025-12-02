/**
 * Tests for HTTP status utilities
 */

import { describe, it, expect } from 'vitest';
import {
  HttpStatus,
  HttpStatusText,
  isSuccess,
  isRedirect,
  isClientError,
  isServerError,
  isError,
  isRetryable,
  getStatusText,
} from '../src/constants/http-status.js';

describe('HTTP Status Utilities', () => {
  describe('HttpStatus constants', () => {
    it('should have correct status codes', () => {
      expect(HttpStatus.OK).toBe(200);
      expect(HttpStatus.NOT_FOUND).toBe(404);
      expect(HttpStatus.INTERNAL_SERVER_ERROR).toBe(500);
    });
  });

  describe('HttpStatusText', () => {
    it('should have correct status text', () => {
      expect(HttpStatusText[200]).toBe('OK');
      expect(HttpStatusText[404]).toBe('Not Found');
      expect(HttpStatusText[500]).toBe('Internal Server Error');
    });
  });

  describe('isSuccess', () => {
    it('should return true for 2xx status codes', () => {
      expect(isSuccess(200)).toBe(true);
      expect(isSuccess(201)).toBe(true);
      expect(isSuccess(299)).toBe(true);
    });

    it('should return false for non-2xx status codes', () => {
      expect(isSuccess(100)).toBe(false);
      expect(isSuccess(300)).toBe(false);
    });
  });

  describe('isRedirect', () => {
    it('should return true for 3xx status codes', () => {
      expect(isRedirect(300)).toBe(true);
      expect(isRedirect(301)).toBe(true);
      expect(isRedirect(399)).toBe(true);
    });

    it('should return false for non-3xx status codes', () => {
      expect(isRedirect(200)).toBe(false);
      expect(isRedirect(400)).toBe(false);
    });
  });

  describe('isClientError', () => {
    it('should return true for 4xx status codes', () => {
      expect(isClientError(400)).toBe(true);
      expect(isClientError(404)).toBe(true);
      expect(isClientError(499)).toBe(true);
    });

    it('should return false for non-4xx status codes', () => {
      expect(isClientError(300)).toBe(false);
      expect(isClientError(500)).toBe(false);
    });
  });

  describe('isServerError', () => {
    it('should return true for 5xx status codes', () => {
      expect(isServerError(500)).toBe(true);
      expect(isServerError(503)).toBe(true);
      expect(isServerError(599)).toBe(true);
    });

    it('should return false for non-5xx status codes', () => {
      expect(isServerError(400)).toBe(false);
      expect(isServerError(200)).toBe(false);
    });
  });

  describe('isError', () => {
    it('should return true for 4xx and 5xx status codes', () => {
      expect(isError(400)).toBe(true);
      expect(isError(404)).toBe(true);
      expect(isError(500)).toBe(true);
      expect(isError(503)).toBe(true);
    });

    it('should return false for non-error status codes', () => {
      expect(isError(200)).toBe(false);
      expect(isError(301)).toBe(false);
      expect(isError(399)).toBe(false);
    });
  });

  describe('isRetryable', () => {
    it('should return true for retryable status codes', () => {
      expect(isRetryable(429)).toBe(true);
      expect(isRetryable(500)).toBe(true);
      expect(isRetryable(502)).toBe(true);
      expect(isRetryable(503)).toBe(true);
      expect(isRetryable(504)).toBe(true);
    });

    it('should return false for non-retryable status codes', () => {
      expect(isRetryable(400)).toBe(false);
      expect(isRetryable(404)).toBe(false);
      expect(isRetryable(501)).toBe(false);
    });
  });

  describe('getStatusText', () => {
    it('should return correct status text for known codes', () => {
      expect(getStatusText(200)).toBe('OK');
      expect(getStatusText(404)).toBe('Not Found');
      expect(getStatusText(500)).toBe('Internal Server Error');
    });

    it('should return "Unknown Status" for unknown codes', () => {
      expect(getStatusText(999)).toBe('Unknown Status');
      expect(getStatusText(0)).toBe('Unknown Status');
    });
  });
});
