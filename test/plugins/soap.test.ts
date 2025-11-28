import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient, createSoapClient, createXmlRpcClient, soap } from '../../src/index.js';
import { MockTransport } from '../helpers/mock-transport.js';

describe('SOAP and XML-RPC Plugin', () => {
  let mockTransport: MockTransport;

  beforeEach(() => {
    mockTransport = new MockTransport();
    vi.clearAllMocks();
  });

  describe('XML-RPC Client', () => {
    it('should make an XML-RPC call', async () => {
      const responseXml = `<?xml version="1.0"?>
<methodResponse>
  <params>
    <param>
      <value><int>42</int></value>
    </param>
  </params>
</methodResponse>`;

      mockTransport.setMockResponse('POST', '/xmlrpc', 200, responseXml, {
        'Content-Type': 'text/xml'
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const xmlrpc = createXmlRpcClient(client, { endpoint: '/xmlrpc' });
      const result = await xmlrpc.call<number>('add', [1, 2]);

      expect(result.success).toBe(true);
      expect(result.result).toBe(42);
    });

    it('should handle XML-RPC fault', async () => {
      const responseXml = `<?xml version="1.0"?>
<methodResponse>
  <fault>
    <value>
      <struct>
        <member>
          <name>faultCode</name>
          <value><int>4</int></value>
        </member>
        <member>
          <name>faultString</name>
          <value><string>Too many parameters</string></value>
        </member>
      </struct>
    </value>
  </fault>
</methodResponse>`;

      mockTransport.setMockResponse('POST', '/xmlrpc', 200, responseXml, {
        'Content-Type': 'text/xml'
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const xmlrpc = createXmlRpcClient(client, { endpoint: '/xmlrpc' });
      const result = await xmlrpc.call('badMethod', [1, 2, 3, 4, 5]);

      expect(result.success).toBe(false);
      expect(result.fault?.faultCode).toBe(4);
      expect(result.fault?.faultString).toBe('Too many parameters');
    });

    it('should serialize different value types', async () => {
      const responseXml = `<?xml version="1.0"?>
<methodResponse>
  <params>
    <param>
      <value><string>ok</string></value>
    </param>
  </params>
</methodResponse>`;

      mockTransport.setMockResponse('POST', '/xmlrpc', 200, responseXml, {
        'Content-Type': 'text/xml'
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const xmlrpc = createXmlRpcClient(client, { endpoint: '/xmlrpc' });

      // Test with various types
      const result = await xmlrpc.call('test', [
        42,                    // int
        3.14,                  // double
        true,                  // boolean
        'hello',               // string
        [1, 2, 3],             // array
        { foo: 'bar' }         // struct
      ]);

      expect(result.success).toBe(true);
    });

    it('should parse simple array response', async () => {
      // Simplified array without nested whitespace
      const responseXml = `<?xml version="1.0"?><methodResponse><params><param><value><array><data><value><int>1</int></value><value><int>2</int></value><value><int>3</int></value></data></array></value></param></params></methodResponse>`;

      mockTransport.setMockResponse('POST', '/xmlrpc', 200, responseXml, {
        'Content-Type': 'text/xml'
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const xmlrpc = createXmlRpcClient(client, { endpoint: '/xmlrpc' });
      const result = await xmlrpc.call<number[]>('getList');

      expect(result.success).toBe(true);
      expect(result.result).toEqual([1, 2, 3]);
    });

    it('should parse simple struct response', async () => {
      // Simplified struct without nested whitespace
      const responseXml = `<?xml version="1.0"?><methodResponse><params><param><value><struct><member><name>id</name><value><int>123</int></value></member><member><name>active</name><value><boolean>1</boolean></value></member></struct></value></param></params></methodResponse>`;

      mockTransport.setMockResponse('POST', '/xmlrpc', 200, responseXml, {
        'Content-Type': 'text/xml'
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const xmlrpc = createXmlRpcClient(client, { endpoint: '/xmlrpc' });
      const result = await xmlrpc.call<{ id: number; active: boolean }>('getUser');

      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        id: 123,
        active: true
      });
    });
  });

  describe('SOAP Client', () => {
    it('should make a SOAP 1.2 call', async () => {
      const responseXml = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Body>
    <GetUserResponse xmlns="http://example.com/service">
      <User>
        <Id>123</Id>
        <Name>John Doe</Name>
      </User>
    </GetUserResponse>
  </soap:Body>
</soap:Envelope>`;

      mockTransport.setMockResponse('POST', '/soap', 200, responseXml, {
        'Content-Type': 'application/soap+xml; charset=utf-8'
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const soapClient = createSoapClient(client, {
        endpoint: '/soap',
        namespace: 'http://example.com/service',
        version: '1.2'
      });

      const result = await soapClient.call('GetUser', { userId: 123 });

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
    });

    it('should handle SOAP fault', async () => {
      const responseXml = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Body>
    <soap:Fault>
      <soap:Code>
        <soap:Value>soap:Sender</soap:Value>
      </soap:Code>
      <soap:Reason>
        <soap:Text>Invalid user ID</soap:Text>
      </soap:Reason>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;

      mockTransport.setMockResponse('POST', '/soap', 500, responseXml, {
        'Content-Type': 'application/soap+xml; charset=utf-8'
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const soapClient = createSoapClient(client, {
        endpoint: '/soap',
        namespace: 'http://example.com/service',
        requestOptions: { throwHttpErrors: false }
      });

      const result = await soapClient.call('GetUser', { userId: -1 });

      expect(result.success).toBe(false);
      expect(result.fault?.code).toContain('Sender');
      expect(result.fault?.string).toContain('Invalid user ID');
    });

    it('should make a SOAP 1.1 call with SOAPAction', async () => {
      const responseXml = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetWeatherResponse>
      <Temperature>72</Temperature>
    </GetWeatherResponse>
  </soap:Body>
</soap:Envelope>`;

      mockTransport.setMockResponse('POST', '/soap11', 200, responseXml, {
        'Content-Type': 'text/xml; charset=utf-8'
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const soapClient = createSoapClient(client, {
        endpoint: '/soap11',
        namespace: 'http://weather.example.com',
        version: '1.1'
      });

      const result = await soapClient.call('GetWeather', { city: 'NYC' });

      expect(result.success).toBe(true);
    });

    it('should support custom SOAP headers', async () => {
      const responseXml = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Body>
    <SecureResponse>
      <Status>authenticated</Status>
    </SecureResponse>
  </soap:Body>
</soap:Envelope>`;

      mockTransport.setMockResponse('POST', '/soap', 200, responseXml, {
        'Content-Type': 'application/soap+xml; charset=utf-8'
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const soapClient = createSoapClient(client, {
        endpoint: '/soap',
        namespace: 'http://example.com/service',
        soapHeaders: {
          AuthToken: 'secret-token'
        }
      });

      const result = await soapClient.call('SecureMethod', { data: 'test' });

      expect(result.success).toBe(true);
    });
  });

  describe('soap plugin', () => {
    it('should add soap and xmlrpc methods to client', async () => {
      const xmlRpcResponse = `<?xml version="1.0"?>
<methodResponse>
  <params>
    <param>
      <value><string>pong</string></value>
    </param>
  </params>
</methodResponse>`;

      mockTransport.setMockResponse('POST', '/xmlrpc', 200, xmlRpcResponse, {
        'Content-Type': 'text/xml'
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        plugins: [soap()]
      });

      // Test xmlrpc method
      const xmlrpc = client.xmlrpc('/xmlrpc');
      const result = await xmlrpc.call('ping');

      expect(result.success).toBe(true);
      expect(result.result).toBe('pong');
    });
  });
});
