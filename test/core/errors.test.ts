import { describe, it, expect } from 'vitest';
import {
  ReckerError,
  HttpError,
  TimeoutError,
  NetworkError,
  MaxSizeExceededError,
  AbortError,
  ConnectionError,
  AuthenticationError,
  ProtocolError,
  NotFoundError,
  StateError,
  ValidationError,
  ConfigurationError,
  UnsupportedError,
  ParseError,
  QueueCancelledError,
  StreamError,
  DownloadError,
} from '../../src/core/errors.js';

describe('Error Classes', () => {
  describe('AuthenticationError', () => {
    it('should create with message only', () => {
      const error = new AuthenticationError('Invalid credentials');
      expect(error.message).toBe('Invalid credentials');
      expect(error.name).toBe('AuthenticationError');
      expect(error.authType).toBeUndefined();
      expect(error.retriable).toBe(false);
      expect(error.suggestions).toContain('Verify credentials (username/password, API key, or certificate).');
    });

    it('should create with authType option', () => {
      const error = new AuthenticationError('Token expired', { authType: 'bearer' });
      expect(error.authType).toBe('bearer');
      expect(error.suggestions).toContain('Check if the account is active and has proper permissions.');
    });

    it('should create with request option', () => {
      const mockRequest = { url: 'https://api.example.com/protected' } as any;
      const error = new AuthenticationError('Access denied', { request: mockRequest });
      expect(error.request).toBe(mockRequest);
    });
  });

  describe('ProtocolError', () => {
    it('should create with FTP protocol', () => {
      const error = new ProtocolError('FTP connection failed', { protocol: 'ftp' });
      expect(error.message).toBe('FTP connection failed');
      expect(error.name).toBe('ProtocolError');
      expect(error.protocol).toBe('ftp');
      expect(error.suggestions).toContain('Ensure the FTP server is running and accessible.');
    });

    it('should create with SFTP protocol', () => {
      const error = new ProtocolError('SFTP key rejected', { protocol: 'sftp', code: 'AUTH_FAILED' });
      expect(error.protocol).toBe('sftp');
      expect(error.code).toBe('AUTH_FAILED');
      expect(error.suggestions).toContain('Verify SSH credentials and key permissions.');
    });

    it('should create with Telnet protocol', () => {
      const error = new ProtocolError('Telnet timeout', { protocol: 'telnet', phase: 'login' });
      expect(error.protocol).toBe('telnet');
      expect(error.phase).toBe('login');
      expect(error.suggestions).toContain('Verify the Telnet service is running on the target host.');
    });

    it('should create with UDP protocol', () => {
      const error = new ProtocolError('UDP send failed', { protocol: 'udp' });
      expect(error.protocol).toBe('udp');
      expect(error.suggestions).toContain('UDP is connectionless - verify the target is listening.');
    });

    it('should create with WebRTC protocol', () => {
      const error = new ProtocolError('ICE negotiation failed', { protocol: 'webrtc' });
      expect(error.protocol).toBe('webrtc');
      expect(error.suggestions).toContain('Verify the signaling server is reachable.');
    });

    it('should create with DNS protocol', () => {
      const error = new ProtocolError('DNS resolution failed', { protocol: 'dns' });
      expect(error.protocol).toBe('dns');
      expect(error.suggestions).toContain('Verify the DNS server is reachable.');
    });

    it('should create with TLS protocol', () => {
      const error = new ProtocolError('Certificate expired', { protocol: 'tls' });
      expect(error.protocol).toBe('tls');
      expect(error.suggestions).toContain('Verify the certificate is valid and not expired.');
    });

    it('should use generic suggestions for unknown protocol', () => {
      const error = new ProtocolError('Unknown protocol error', { protocol: 'custom' });
      expect(error.protocol).toBe('custom');
      expect(error.suggestions).toContain('Check the protocol-specific documentation.');
    });

    it('should respect retriable option', () => {
      const retriableError = new ProtocolError('Retry me', { protocol: 'dns', retriable: true });
      expect(retriableError.retriable).toBe(true);

      const nonRetriableError = new ProtocolError('No retry', { protocol: 'dns', retriable: false });
      expect(nonRetriableError.retriable).toBe(false);
    });

    it('should default retriable to false', () => {
      const error = new ProtocolError('Default', { protocol: 'ftp' });
      expect(error.retriable).toBe(false);
    });
  });

  describe('QueueCancelledError', () => {
    it('should create with default message', () => {
      const error = new QueueCancelledError();
      expect(error.message).toBe('Queue operation was cancelled');
      expect(error.name).toBe('QueueCancelledError');
      expect(error.queueName).toBeUndefined();
      expect(error.retriable).toBe(true);
      expect(error.suggestions).toContain('This is typically expected during shutdown.');
    });

    it('should create with custom message', () => {
      const error = new QueueCancelledError('Request queue aborted');
      expect(error.message).toBe('Request queue aborted');
    });

    it('should create with queueName option', () => {
      const error = new QueueCancelledError('Cancelled', { queueName: 'download-queue' });
      expect(error.queueName).toBe('download-queue');
    });

    it('should create with request option', () => {
      const mockRequest = { url: 'https://example.com' } as any;
      const error = new QueueCancelledError('Cancelled', { request: mockRequest });
      expect(error.request).toBe(mockRequest);
    });
  });

  describe('StreamError', () => {
    it('should create with message only', () => {
      const error = new StreamError('Stream closed unexpectedly');
      expect(error.message).toBe('Stream closed unexpectedly');
      expect(error.name).toBe('StreamError');
      expect(error.streamType).toBeUndefined();
      expect(error.retriable).toBe(false);
      expect(error.suggestions).toContain('Check if the stream was prematurely closed.');
    });

    it('should create with streamType option', () => {
      const error = new StreamError('Read error', { streamType: 'readable' });
      expect(error.streamType).toBe('readable');
    });

    it('should create with retriable option', () => {
      const error = new StreamError('Transient error', { retriable: true });
      expect(error.retriable).toBe(true);
    });

    it('should create with request option', () => {
      const mockRequest = { url: 'https://example.com/stream' } as any;
      const error = new StreamError('Error', { request: mockRequest });
      expect(error.request).toBe(mockRequest);
    });
  });

  describe('DownloadError', () => {
    it('should create with message only', () => {
      const error = new DownloadError('Download failed');
      expect(error.message).toBe('Download failed');
      expect(error.name).toBe('DownloadError');
      expect(error.url).toBeUndefined();
      expect(error.statusCode).toBeUndefined();
      expect(error.retriable).toBe(true); // Default is true for downloads
      expect(error.suggestions).toContain('Verify the URL is correct and accessible.');
    });

    it('should create with url option', () => {
      const error = new DownloadError('Not found', { url: 'https://example.com/file.zip' });
      expect(error.url).toBe('https://example.com/file.zip');
    });

    it('should create with statusCode option and include it in suggestions', () => {
      const error = new DownloadError('Server error', { statusCode: 500 });
      expect(error.statusCode).toBe(500);
      expect(error.suggestions).toContain('HTTP 500 - check server response.');
    });

    it('should use default suggestion without statusCode', () => {
      const error = new DownloadError('Network issue');
      expect(error.suggestions).toContain('Retry the download if the error is transient.');
    });

    it('should override default retriable', () => {
      const error = new DownloadError('Permanent error', { retriable: false });
      expect(error.retriable).toBe(false);
    });
  });

  describe('ParseError', () => {
    it('should create with message only', () => {
      const error = new ParseError('Invalid JSON');
      expect(error.message).toBe('Invalid JSON');
      expect(error.name).toBe('ParseError');
      expect(error.format).toBeUndefined();
      expect(error.position).toBeUndefined();
      expect(error.retriable).toBe(false);
    });

    it('should create with format option', () => {
      const error = new ParseError('Invalid XML', { format: 'xml' });
      expect(error.format).toBe('xml');
    });

    it('should create with position option', () => {
      const error = new ParseError('Syntax error', { position: 42 });
      expect(error.position).toBe(42);
    });
  });

  describe('StateError', () => {
    it('should create with message and states', () => {
      const error = new StateError('Invalid transition', { expectedState: 'running', actualState: 'idle' });
      expect(error.message).toBe('Invalid transition');
      expect(error.name).toBe('StateError');
      expect(error.actualState).toBe('idle');
      expect(error.expectedState).toBe('running');
      expect(error.suggestions).toContain('Ensure the required setup/initialization step was performed.');
    });
  });

  describe('ValidationError', () => {
    it('should create with field and value', () => {
      const error = new ValidationError('Invalid email', { field: 'email', value: 'not-an-email' });
      expect(error.message).toBe('Invalid email');
      expect(error.name).toBe('ValidationError');
      expect(error.field).toBe('email');
      expect(error.value).toBe('not-an-email');
      expect(error.suggestions).toContain('Check the input format and constraints.');
    });
  });

  describe('ConfigurationError', () => {
    it('should create with configKey', () => {
      const error = new ConfigurationError('Missing API key', { configKey: 'apiKey' });
      expect(error.message).toBe('Missing API key');
      expect(error.name).toBe('ConfigurationError');
      expect(error.configKey).toBe('apiKey');
      expect(error.suggestions).toContain('Check the configuration file or environment variables.');
    });
  });

  describe('UnsupportedError', () => {
    it('should create with feature', () => {
      const error = new UnsupportedError('WebSocket not supported', { feature: 'websocket' });
      expect(error.message).toBe('WebSocket not supported');
      expect(error.name).toBe('UnsupportedError');
      expect(error.feature).toBe('websocket');
      expect(error.suggestions).toContain('Check if this feature is supported in the current context.');
    });
  });

  describe('NotFoundError', () => {
    it('should create with resource', () => {
      const error = new NotFoundError('User not found', { resource: 'user:123' });
      expect(error.message).toBe('User not found');
      expect(error.name).toBe('NotFoundError');
      expect(error.resource).toBe('user:123');
      expect(error.suggestions).toContain('Verify the resource path or identifier is correct.');
    });
  });

  describe('ConnectionError', () => {
    it('should create with host and port', () => {
      const error = new ConnectionError('Connection refused', { host: 'localhost', port: 8080 });
      expect(error.message).toBe('Connection refused');
      expect(error.name).toBe('ConnectionError');
      expect(error.host).toBe('localhost');
      expect(error.port).toBe(8080);
      expect(error.suggestions).toContain('Verify the host and port are correct and the service is running.');
    });

    it('should include code option', () => {
      const error = new ConnectionError('Connection reset', { code: 'ECONNRESET' });
      expect(error.code).toBe('ECONNRESET');
    });

    it('should default retriable to true', () => {
      const error = new ConnectionError('Network error');
      expect(error.retriable).toBe(true);
    });
  });

  describe('AbortError', () => {
    it('should create with reason string', () => {
      const error = new AbortError('User cancelled');
      expect(error.message).toBe('User cancelled');
      expect(error.name).toBe('AbortError');
      expect(error.reason).toBe('User cancelled');
      expect(error.retriable).toBe(true);
    });

    it('should use default message', () => {
      const error = new AbortError();
      expect(error.message).toBe('Request was aborted');
    });
  });

  describe('MaxSizeExceededError', () => {
    it('should create with limit and actual size', () => {
      const error = new MaxSizeExceededError(1000, 5000);
      expect(error.message).toBe('Response size exceeded maximum allowed: 5000 bytes (max: 1000 bytes)');
      expect(error.name).toBe('MaxSizeExceededError');
      expect(error.maxSize).toBe(1000);
      expect(error.actualSize).toBe(5000);
    });

    it('should create without actual size', () => {
      const error = new MaxSizeExceededError(2000);
      expect(error.message).toBe('Response size exceeded maximum allowed: 2000 bytes');
      expect(error.maxSize).toBe(2000);
      expect(error.actualSize).toBeUndefined();
    });
  });
});
