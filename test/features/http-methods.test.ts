import { describe, it, expect } from 'vitest';
import { createClient } from '../../src/index.js';
import { MockTransport } from '../helpers/mock-transport.js';

describe('HTTP Methods', () => {
  describe('Standard HTTP Methods', () => {
    it('should make GET request', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('GET', '/users', 200, { users: [] });

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const data = await client.get('/users').json();
      expect(data).toEqual({ users: [] });
    });

    it('should make POST request with body', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('POST', '/users', 201, { id: 1, name: 'John' });

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const data = await client.post('/users', { name: 'John' }).json();
      expect(data).toEqual({ id: 1, name: 'John' });
    });

    it('should make PUT request with body', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('PUT', '/users/1', 200, { id: 1, name: 'Jane' });

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const data = await client.put('/users/1', { name: 'Jane' }).json();
      expect(data).toEqual({ id: 1, name: 'Jane' });
    });

    it('should make PATCH request with body', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('PATCH', '/users/1', 200, { id: 1, email: 'jane@example.com' });

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const data = await client.patch('/users/1', { email: 'jane@example.com' }).json();
      expect(data).toEqual({ id: 1, email: 'jane@example.com' });
    });

    it('should make DELETE request', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('DELETE', '/users/1', 204, '');

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const response = await client.delete('/users/1');
      expect(response.status).toBe(204);
      expect(response.ok).toBe(true);
    });

    it('should make HEAD request', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('HEAD', '/users/1', 200, '', {
        'content-type': 'application/json',
        'content-length': '42'
      });

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const response = await client.head('/users/1');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/json');
      expect(response.headers.get('content-length')).toBe('42');
    });

    it('should make OPTIONS request', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('OPTIONS', '/users', 200, '', {
        'allow': 'GET, POST, PUT, DELETE, OPTIONS'
      });

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const response = await client.options('/users');
      expect(response.status).toBe(200);
      expect(response.headers.get('allow')).toBe('GET, POST, PUT, DELETE, OPTIONS');
    });
  });

  describe('Diagnostic Methods', () => {
    it('should make TRACE request', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('TRACE', '/api/endpoint', 200, 'TRACE /api/endpoint HTTP/1.1\nHost: example.com');

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const trace = await client.trace('/api/endpoint').text();
      expect(trace).toContain('TRACE');
      expect(trace).toContain('/api/endpoint');
    });

    it('should make CONNECT request', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('CONNECT', '/tunnel', 200, 'Connection established');

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const response = await client.connect('/tunnel');
      expect(response.status).toBe(200);
    });
  });

  describe('CDN/Cache Methods', () => {
    it('should make PURGE request', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('PURGE', '/cached-resource', 200, { status: 'purged' });

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const data = await client.purge('/cached-resource').json();
      expect(data).toEqual({ status: 'purged' });
    });
  });

  describe('WebDAV Methods', () => {
    it('should make PROPFIND request with body', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('PROPFIND', '/webdav/folder', 207, '<?xml version="1.0"?><multistatus/>', {
        'content-type': 'application/xml'
      });

      const xmlBody = `<?xml version="1.0"?>
<propfind xmlns="DAV:">
  <prop>
    <getcontentlength/>
    <getlastmodified/>
  </prop>
</propfind>`;

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const response = await client.propfind('/webdav/folder', xmlBody);
      expect(response.status).toBe(207);
    });

    it('should make PROPPATCH request with body', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('PROPPATCH', '/webdav/file.txt', 207, '<?xml version="1.0"?><multistatus/>');

      const xmlBody = `<?xml version="1.0"?>
<propertyupdate xmlns="DAV:">
  <set>
    <prop>
      <displayname>My Document</displayname>
    </prop>
  </set>
</propertyupdate>`;

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const response = await client.proppatch('/webdav/file.txt', xmlBody);
      expect(response.status).toBe(207);
    });

    it('should make MKCOL request', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('MKCOL', '/webdav/newfolder', 201, '');

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const response = await client.mkcol('/webdav/newfolder');
      expect(response.status).toBe(201);
    });

    it('should make COPY request', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('COPY', '/webdav/source.txt', 201, '');

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const response = await client.copy('/webdav/source.txt', {
        headers: { 'Destination': '/webdav/destination.txt' }
      });
      expect(response.status).toBe(201);
    });

    it('should make MOVE request', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('MOVE', '/webdav/old-name.txt', 201, '');

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const response = await client.move('/webdav/old-name.txt', {
        headers: { 'Destination': '/webdav/new-name.txt' }
      });
      expect(response.status).toBe(201);
    });

    it('should make LOCK request with body', async () => {
      const mockTransport = new MockTransport();
      const lockResponse = `<?xml version="1.0"?>
<prop xmlns="DAV:">
  <lockdiscovery>
    <activelock>
      <locktoken><href>opaquelocktoken:abc123</href></locktoken>
    </activelock>
  </lockdiscovery>
</prop>`;

      mockTransport.setMockResponse('LOCK', '/webdav/document.txt', 200, lockResponse);

      const xmlBody = `<?xml version="1.0"?>
<lockinfo xmlns="DAV:">
  <lockscope><exclusive/></lockscope>
  <locktype><write/></locktype>
</lockinfo>`;

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const response = await client.lock('/webdav/document.txt', xmlBody);
      const lockToken = await response.text();

      expect(response.status).toBe(200);
      expect(lockToken).toContain('locktoken');
    });

    it('should make UNLOCK request', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('UNLOCK', '/webdav/document.txt', 204, '');

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const response = await client.unlock('/webdav/document.txt', {
        headers: { 'Lock-Token': '<opaquelocktoken:abc123>' }
      });
      expect(response.status).toBe(204);
    });
  });

  describe('Link Methods (RFC 2068)', () => {
    it('should make LINK request', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('LINK', '/resource', 200, '');

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const response = await client.link('/resource', null, {
        headers: { 'Link': '</other-resource>; rel="related"' }
      });
      expect(response.status).toBe(200);
    });

    it('should make UNLINK request', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('UNLINK', '/resource', 200, '');

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const response = await client.unlink('/resource', null, {
        headers: { 'Link': '</other-resource>; rel="related"' }
      });
      expect(response.status).toBe(200);
    });
  });

  describe('Request Options', () => {
    it('should support custom headers', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('GET', '/users', 200, { users: [] });

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const data = await client.get('/users', {
        headers: {
          'Authorization': 'Bearer token123',
          'X-Custom': 'value'
        }
      }).json();

      expect(data).toEqual({ users: [] });
    });

    it('should support query parameters', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('GET', '/users?role=admin&limit=10', 200, { users: [] });

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const data = await client.get('/users', {
        params: { role: 'admin', limit: 10 }
      }).json();

      expect(data).toEqual({ users: [] });
    });
  });

  describe('Body Processing', () => {
    it('should handle JSON body in POST', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('POST', '/data', 201, { success: true });

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const data = await client.post('/data', { key: 'value' }).json();
      expect(data).toEqual({ success: true });
    });

    it('should handle text body in POST', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('POST', '/text', 200, { received: true });

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const data = await client.post('/text', 'plain text content').json();
      expect(data).toEqual({ received: true });
    });

    it('should handle XML body in PROPFIND', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('PROPFIND', '/webdav', 207, '<?xml version="1.0"?><multistatus/>');

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      const xmlBody = '<?xml version="1.0"?><propfind/>';
      const response = await client.propfind('/webdav', xmlBody);

      expect(response.status).toBe(207);
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 errors', async () => {
      const { HttpError } = await import('../../src/index.js');

      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('GET', '/not-found', 404, { error: 'Not Found' });

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      await expect(client.get('/not-found')).rejects.toThrow(HttpError);
    });

    it('should handle 500 errors', async () => {
      const { HttpError } = await import('../../src/index.js');

      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('POST', '/error', 500, { error: 'Internal Server Error' });

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport
      });

      await expect(client.post('/error', { data: 'test' })).rejects.toThrow(HttpError);
    });
  });

  describe('Method Existence', () => {
    it('should have all new HTTP methods', () => {
      const client = createClient({ baseUrl: 'https://example.com' });

      // Standard methods
      expect(typeof client.get).toBe('function');
      expect(typeof client.post).toBe('function');
      expect(typeof client.put).toBe('function');
      expect(typeof client.patch).toBe('function');
      expect(typeof client.delete).toBe('function');
      expect(typeof client.head).toBe('function');
      expect(typeof client.options).toBe('function');

      // Diagnostic methods
      expect(typeof client.trace).toBe('function');
      expect(typeof client.connect).toBe('function');

      // CDN/Cache methods
      expect(typeof client.purge).toBe('function');

      // WebDAV methods
      expect(typeof client.propfind).toBe('function');
      expect(typeof client.proppatch).toBe('function');
      expect(typeof client.mkcol).toBe('function');
      expect(typeof client.copy).toBe('function');
      expect(typeof client.move).toBe('function');
      expect(typeof client.lock).toBe('function');
      expect(typeof client.unlock).toBe('function');

      // Link methods
      expect(typeof client.link).toBe('function');
      expect(typeof client.unlink).toBe('function');
    });
  });
});
