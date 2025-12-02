import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '../../src/core/client.js';
import { MockTransport, MockClient, createMockClient } from '../../src/testing/index.js';
import { parseXML, serializeXML, xmlResponse } from '../../src/plugins/xml.js';

describe('XML Plugin', () => {
  describe('parseXML', () => {
    it('should parse simple element', () => {
      const result = parseXML('<root>hello</root>');
      expect(result).toEqual({ root: 'hello' });
    });

    it('should parse nested elements', () => {
      const result = parseXML('<user><name>John</name><age>30</age></user>');
      expect(result).toEqual({
        user: {
          name: 'John',
          age: '30'
        }
      });
    });

    it('should parse attributes', () => {
      const result = parseXML('<user id="123" type="admin">John</user>');
      expect(result).toEqual({
        user: {
          '@attributes': { id: '123', type: 'admin' },
          '#text': 'John'
        }
      });
    });

    it('should parse self-closing tags without attributes', () => {
      const result = parseXML('<empty/>');
      expect(result).toEqual({ empty: null });
    });

    it('should parse self-closing tags with attributes', () => {
      // Self-closing tags place attributes directly on the element (not under @attributes)
      const result = parseXML('<user name="John"/>');
      expect(result).toEqual({ user: { name: 'John' } });
    });

    it('should parse multiple same-named children as array', () => {
      const result = parseXML('<users><user>John</user><user>Jane</user></users>');
      expect(result).toEqual({
        users: {
          user: ['John', 'Jane']
        }
      });
    });

    it('should decode XML entities', () => {
      const result = parseXML('<text>&lt;hello&gt; &amp; &quot;world&quot;</text>');
      expect(result).toEqual({ text: '<hello> & "world"' });
    });

    it('should decode numeric entities', () => {
      const result = parseXML('<text>&#65;&#66;&#67;</text>');
      expect(result).toEqual({ text: 'ABC' });
    });

    it('should decode hex entities', () => {
      const result = parseXML('<text>&#x41;&#x42;&#x43;</text>');
      expect(result).toEqual({ text: 'ABC' });
    });

    it('should strip XML declaration', () => {
      const result = parseXML('<?xml version="1.0" encoding="UTF-8"?><root>test</root>');
      expect(result).toEqual({ root: 'test' });
    });

    it('should strip comments', () => {
      const result = parseXML('<root><!-- comment -->test</root>');
      expect(result).toEqual({ root: 'test' });
    });

    it('should handle empty elements', () => {
      const result = parseXML('<root></root>');
      expect(result).toEqual({ root: '' });
    });

    it('should handle deeply nested structures', () => {
      const xml = '<a><b><c><d>deep</d></c></b></a>';
      const result = parseXML(xml);
      expect(result).toEqual({
        a: {
          b: {
            c: {
              d: 'deep'
            }
          }
        }
      });
    });
  });

  describe('serializeXML', () => {
    it('should serialize simple object', () => {
      const result = serializeXML({ root: 'hello' });
      expect(result).toBe('<root>hello</root>');
    });

    it('should serialize nested objects', () => {
      const result = serializeXML({
        user: {
          name: 'John',
          age: 30
        }
      });
      expect(result).toBe('<user><name>John</name><age>30</age></user>');
    });

    it('should serialize attributes', () => {
      const result = serializeXML({
        user: {
          '@attributes': { id: '123' },
          '#text': 'John'
        }
      });
      expect(result).toBe('<user id="123">John</user>');
    });

    it('should serialize arrays', () => {
      const result = serializeXML({
        users: {
          user: ['John', 'Jane']
        }
      });
      expect(result).toBe('<users><user>John</user><user>Jane</user></users>');
    });

    it('should serialize null as self-closing', () => {
      const result = serializeXML({ empty: null });
      expect(result).toBe('<empty/>');
    });

    it('should encode XML entities', () => {
      const result = serializeXML({ text: '<hello> & "world"' });
      expect(result).toBe('<text>&lt;hello&gt; &amp; &quot;world&quot;</text>');
    });

    it('should handle empty object', () => {
      const result = serializeXML({});
      expect(result).toBe('');
    });

    it('should serialize with explicit root name', () => {
      const result = serializeXML('hello', 'greeting');
      expect(result).toBe('<greeting>hello</greeting>');
    });
  });

  describe('roundtrip', () => {
    it('should parse and serialize back to equivalent structure', () => {
      const original = {
        user: {
          '@attributes': { id: '123' },
          name: 'John',
          email: 'john@example.com'
        }
      };
      const serialized = serializeXML(original);
      const parsed = parseXML(serialized);
      expect(parsed).toEqual(original);
    });
  });

  describe('native xml option in client', () => {
    let mock: MockClient;
    let client: ReturnType<typeof createClient>;

    beforeEach(() => {
      const result = createMockClient();
      mock = result.mock;
      client = createClient({
        baseUrl: 'https://api.example.com',
        transport: result.transport
      });
    });

    it('should send XML body with xml option', async () => {
      mock.post('/user').reply(201, '<result>ok</result>');

      const response = await client.post('/user', undefined, {
        xml: { user: { name: 'Jane' } }
      });

      expect(response.status).toBe(201);
      const history = mock.history();
      expect(history[0].body).toContain('<?xml version="1.0"');
      expect(history[0].body).toContain('<user><name>Jane</name></user>');
      expect(history[0].headers.get('Content-Type')).toBe('application/xml');
    });

    it('should parse XML response using xmlResponse helper', async () => {
      const xmlContent = '<user><name>John</name><age>30</age></user>';
      mock.get('/user').reply(200, xmlContent, { 'Content-Type': 'application/xml' });

      const data = await xmlResponse(client.get('/user'));
      expect(data).toEqual({
        user: {
          name: 'John',
          age: '30'
        }
      });
    });

    it('should handle complex nested XML', async () => {
      mock.post('/data').reply(200, '<ok/>');

      await client.post('/data', undefined, {
        xml: {
          order: {
            '@attributes': { id: 'ORD-001' },
            customer: {
              name: 'Alice',
              email: 'alice@example.com'
            },
            items: {
              item: [
                { name: 'Widget', qty: '2' },
                { name: 'Gadget', qty: '1' }
              ]
            }
          }
        }
      });

      const history = mock.history();
      const body = history[0].body as string;
      expect(body).toContain('<order id="ORD-001">');
      expect(body).toContain('<customer>');
      expect(body).toContain('<name>Alice</name>');
      expect(body).toContain('<item><name>Widget</name><qty>2</qty></item>');
    });

    it('should use custom parser with xmlResponse', async () => {
      const customParser = (xml: string) => ({ custom: 'parsed', length: xml.length });
      mock.get('/data').reply(200, '<anything>content</anything>');

      const data = await xmlResponse(client.get('/data'), customParser);
      expect(data.custom).toBe('parsed');
      expect(data.length).toBeGreaterThan(0);
    });
  });

  describe('SOAP example', () => {
    it('should handle SOAP envelope structure', async () => {
      const soapEnvelope = {
        'soap:Envelope': {
          '@attributes': {
            'xmlns:soap': 'http://schemas.xmlsoap.org/soap/envelope/'
          },
          'soap:Body': {
            GetUser: {
              userId: '123'
            }
          }
        }
      };

      const serialized = serializeXML(soapEnvelope);
      expect(serialized).toContain('soap:Envelope');
      expect(serialized).toContain('xmlns:soap=');
      expect(serialized).toContain('soap:Body');
      expect(serialized).toContain('<GetUser>');
      expect(serialized).toContain('<userId>123</userId>');
    });

    it('should send SOAP request via client', async () => {
      const { mock, transport } = createMockClient();
      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport
      });

      mock.post('/soap').reply(200, `
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <GetUserResponse>
              <user>
                <id>123</id>
                <name>John</name>
              </user>
            </GetUserResponse>
          </soap:Body>
        </soap:Envelope>
      `);

      const response = await client.post('/soap', undefined, {
        xml: {
          'soap:Envelope': {
            '@attributes': {
              'xmlns:soap': 'http://schemas.xmlsoap.org/soap/envelope/'
            },
            'soap:Body': {
              GetUser: { userId: '123' }
            }
          }
        }
      });

      expect(response.status).toBe(200);
      const history = mock.history();
      expect(history[0].headers.get('Content-Type')).toBe('application/xml');
    });
  });

  describe('edge cases', () => {
    it('should handle malformed XML with unclosed tags', () => {
      // Malformed XML - missing closing tag
      const result = parseXML('<root><child>content');
      // Should still return whatever it could parse
      expect(result).toBeDefined();
    });

    it('should handle empty XML', () => {
      const result = parseXML('');
      // Empty XML returns empty string after trimming
      expect(result).toBe('');
    });

    it('should handle whitespace-only XML', () => {
      const result = parseXML('   \n\t  ');
      expect(result).toBe('');
    });
  });
});
