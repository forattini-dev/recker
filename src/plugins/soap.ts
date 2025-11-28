/**
 * SOAP and XML-RPC Plugin
 * Implements SOAP 1.1/1.2 and XML-RPC protocols
 */

import type { Client } from '../core/client.js';
import type { RequestOptions } from '../types/index.js';

// ============================================================================
// XML-RPC Types and Implementation
// ============================================================================

export interface XmlRpcValue {
  type: 'int' | 'i4' | 'i8' | 'boolean' | 'string' | 'double' | 'dateTime.iso8601' | 'base64' | 'array' | 'struct' | 'nil';
  value: unknown;
}

export interface XmlRpcResponse<T = unknown> {
  success: boolean;
  result?: T;
  fault?: {
    faultCode: number;
    faultString: string;
  };
}

/**
 * Convert JavaScript value to XML-RPC XML
 */
function jsToXmlRpcValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '<nil/>';
  }

  if (typeof value === 'boolean') {
    return `<boolean>${value ? '1' : '0'}</boolean>`;
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return `<int>${value}</int>`;
    }
    return `<double>${value}</double>`;
  }

  if (typeof value === 'string') {
    return `<string>${escapeXml(value)}</string>`;
  }

  if (value instanceof Date) {
    return `<dateTime.iso8601>${value.toISOString()}</dateTime.iso8601>`;
  }

  if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
    const base64 = Buffer.from(value).toString('base64');
    return `<base64>${base64}</base64>`;
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => `<value>${jsToXmlRpcValue(item)}</value>`).join('');
    return `<array><data>${items}</data></array>`;
  }

  if (typeof value === 'object') {
    const members = Object.entries(value as Record<string, unknown>)
      .map(([name, val]) => `<member><name>${escapeXml(name)}</name><value>${jsToXmlRpcValue(val)}</value></member>`)
      .join('');
    return `<struct>${members}</struct>`;
  }

  return `<string>${String(value)}</string>`;
}

/**
 * Parse XML-RPC value from XML string
 */
function parseXmlRpcValue(xml: string): unknown {
  // Simple regex-based parser (for production, use proper XML parser)
  const trimmed = xml.trim();

  if (trimmed.includes('<nil/>') || trimmed.includes('<nil></nil>')) {
    return null;
  }

  // Check for compound types FIRST (they may contain primitives)
  // Array parsing - must be checked before primitives
  if (trimmed.startsWith('<array>') || trimmed.includes('<array>')) {
    const dataMatch = trimmed.match(/<array>\s*<data>([\s\S]*)<\/data>\s*<\/array>/);
    if (dataMatch) {
      const values: unknown[] = [];
      const dataContent = dataMatch[1];
      // Split by </value> to get individual value blocks
      const valueParts = dataContent.split(/<\/value>/);
      for (const part of valueParts) {
        const valueStart = part.indexOf('<value>');
        if (valueStart !== -1) {
          const content = part.slice(valueStart + 7); // Skip <value>
          values.push(parseXmlRpcValue(content.trim()));
        }
      }
      return values;
    }
  }

  // Struct parsing - must be checked before primitives
  if (trimmed.startsWith('<struct>') || trimmed.includes('<struct>')) {
    const structContent = trimmed.match(/<struct>([\s\S]*)<\/struct>/);
    if (structContent) {
      const obj: Record<string, unknown> = {};
      const memberParts = structContent[1].split(/<\/member>/);
      for (const part of memberParts) {
        const memberStart = part.indexOf('<member>');
        if (memberStart !== -1) {
          const memberContent = part.slice(memberStart + 8); // Skip <member>
          const nameMatch = memberContent.match(/<name>([\s\S]*?)<\/name>/);
          const valueMatch = memberContent.match(/<value>([\s\S]*)<\/value>/s);
          if (nameMatch && valueMatch) {
            obj[unescapeXml(nameMatch[1].trim())] = parseXmlRpcValue(valueMatch[1].trim());
          }
        }
      }
      return obj;
    }
  }

  // Now check for primitives - use anchored patterns to match full content
  const intMatch = trimmed.match(/^<(?:int|i4|i8)>(-?\d+)<\/(?:int|i4|i8)>$/);
  if (intMatch) {
    return parseInt(intMatch[1], 10);
  }

  const boolMatch = trimmed.match(/^<boolean>([01])<\/boolean>$/);
  if (boolMatch) {
    return boolMatch[1] === '1';
  }

  const doubleMatch = trimmed.match(/^<double>(-?[\d.]+(?:[eE][+-]?\d+)?)<\/double>$/);
  if (doubleMatch) {
    return parseFloat(doubleMatch[1]);
  }

  const stringMatch = trimmed.match(/^<string>([\s\S]*?)<\/string>$/);
  if (stringMatch) {
    return unescapeXml(stringMatch[1]);
  }

  const dateMatch = trimmed.match(/^<dateTime\.iso8601>([\s\S]*?)<\/dateTime\.iso8601>$/);
  if (dateMatch) {
    return new Date(dateMatch[1]);
  }

  const base64Match = trimmed.match(/^<base64>([\s\S]*?)<\/base64>$/);
  if (base64Match) {
    return Buffer.from(base64Match[1], 'base64');
  }

  // Default: treat as string
  return trimmed;
}

/**
 * XML-RPC Client
 *
 * @example
 * ```typescript
 * const xmlrpc = createXmlRpcClient(client, {
 *   endpoint: '/xmlrpc'
 * });
 *
 * const result = await xmlrpc.call('system.listMethods');
 * const sum = await xmlrpc.call('math.add', [1, 2, 3]);
 * ```
 */
export class XmlRpcClient {
  private client: Client;
  private endpoint: string;
  private requestOptions: RequestOptions;

  constructor(client: Client, options: { endpoint: string; requestOptions?: RequestOptions }) {
    this.client = client;
    this.endpoint = options.endpoint;
    this.requestOptions = options.requestOptions ?? {};
  }

  async call<T = unknown>(method: string, params: unknown[] = []): Promise<XmlRpcResponse<T>> {
    const paramsXml = params.map((p) => `<param><value>${jsToXmlRpcValue(p)}</value></param>`).join('');

    const xml = `<?xml version="1.0"?>
<methodCall>
  <methodName>${escapeXml(method)}</methodName>
  <params>${paramsXml}</params>
</methodCall>`;

    const response = await this.client.post(this.endpoint, xml, {
      ...this.requestOptions,
      headers: {
        'Content-Type': 'text/xml',
        ...this.requestOptions.headers,
      },
    });

    const responseXml = await response.text();
    return this.parseResponse<T>(responseXml);
  }

  private parseResponse<T>(xml: string): XmlRpcResponse<T> {
    // Check for fault - use greedy match to capture nested value tags
    const faultMatch = xml.match(/<fault>\s*<value>([\s\S]+)<\/value>\s*<\/fault>/);
    if (faultMatch) {
      const fault = parseXmlRpcValue(faultMatch[1]) as { faultCode: number; faultString: string };
      return {
        success: false,
        fault: {
          faultCode: fault.faultCode ?? 0,
          faultString: fault.faultString ?? 'Unknown error',
        },
      };
    }

    // Parse response - use greedy match to capture nested value tags
    const paramsMatch = xml.match(/<params>\s*<param>\s*<value>([\s\S]+)<\/value>\s*<\/param>\s*<\/params>/);
    if (paramsMatch) {
      return {
        success: true,
        result: parseXmlRpcValue(paramsMatch[1]) as T,
      };
    }

    return { success: true };
  }
}

// ============================================================================
// SOAP Types and Implementation
// ============================================================================

export type SoapVersion = '1.1' | '1.2';

export interface SoapOptions {
  /** SOAP endpoint URL */
  endpoint: string;
  /** SOAP version (default: '1.2') */
  version?: SoapVersion;
  /** Target namespace */
  namespace?: string;
  /** Namespace prefix (default: 'ns') */
  namespacePrefix?: string;
  /** WSDL URL (optional, for reference) */
  wsdl?: string;
  /** Default SOAP headers */
  soapHeaders?: Record<string, unknown>;
  /** Request options */
  requestOptions?: RequestOptions;
}

export interface SoapFault {
  code: string;
  string: string;
  actor?: string;
  detail?: unknown;
}

export interface SoapResponse<T = unknown> {
  success: boolean;
  result?: T;
  fault?: SoapFault;
  rawXml: string;
}

const SOAP_NAMESPACES = {
  '1.1': {
    envelope: 'http://schemas.xmlsoap.org/soap/envelope/',
    contentType: 'text/xml; charset=utf-8',
  },
  '1.2': {
    envelope: 'http://www.w3.org/2003/05/soap-envelope',
    contentType: 'application/soap+xml; charset=utf-8',
  },
};

/**
 * SOAP Client
 *
 * @example
 * ```typescript
 * const soap = createSoapClient(client, {
 *   endpoint: '/soap',
 *   namespace: 'http://example.com/service',
 *   version: '1.2'
 * });
 *
 * const result = await soap.call('GetUser', { userId: 123 });
 *
 * // With custom headers
 * const result = await soap.call('SecureMethod', { data: 'test' }, {
 *   soapHeaders: {
 *     'AuthToken': 'secret-token'
 *   }
 * });
 * ```
 */
export class SoapClient {
  private client: Client;
  private options: Required<Omit<SoapOptions, 'wsdl'>> & { wsdl?: string };

  constructor(client: Client, options: SoapOptions) {
    this.client = client;
    this.options = {
      endpoint: options.endpoint,
      version: options.version ?? '1.2',
      namespace: options.namespace ?? '',
      namespacePrefix: options.namespacePrefix ?? 'ns',
      wsdl: options.wsdl,
      soapHeaders: options.soapHeaders ?? {},
      requestOptions: options.requestOptions ?? {},
    };
  }

  async call<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    options?: { soapHeaders?: Record<string, unknown>; soapAction?: string }
  ): Promise<SoapResponse<T>> {
    const soapNs = SOAP_NAMESPACES[this.options.version];
    const prefix = this.options.namespacePrefix;
    const ns = this.options.namespace;

    // Build SOAP headers
    const soapHeaders = { ...this.options.soapHeaders, ...options?.soapHeaders };
    let soapHeaderXml = '';
    if (Object.keys(soapHeaders).length > 0) {
      const headerContent = this.objectToXml(soapHeaders, prefix);
      soapHeaderXml = `<soap:Header>${headerContent}</soap:Header>`;
    }

    // Build SOAP body
    const paramsXml = this.objectToXml(params, prefix);
    const methodXml = ns
      ? `<${prefix}:${method} xmlns:${prefix}="${ns}">${paramsXml}</${prefix}:${method}>`
      : `<${method}>${paramsXml}</${method}>`;

    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="${soapNs.envelope}">
  ${soapHeaderXml}
  <soap:Body>
    ${methodXml}
  </soap:Body>
</soap:Envelope>`;

    const headers: Record<string, string> = {
      'Content-Type': soapNs.contentType,
    };

    // Add SOAPAction header for SOAP 1.1
    if (this.options.version === '1.1') {
      const action = options?.soapAction ?? `${ns}/${method}`;
      headers['SOAPAction'] = `"${action}"`;
    }

    const response = await this.client.post(this.options.endpoint, envelope, {
      ...this.options.requestOptions,
      headers: {
        ...headers,
        ...this.options.requestOptions.headers,
      },
    });

    const responseXml = await response.text();
    return this.parseResponse<T>(responseXml, method);
  }

  /**
   * Fetch and parse WSDL (basic implementation)
   */
  async getWsdl(): Promise<string | null> {
    if (!this.options.wsdl) return null;

    const response = await this.client.get(this.options.wsdl);
    return response.text();
  }

  private objectToXml(obj: Record<string, unknown>, prefix?: string): string {
    return Object.entries(obj)
      .map(([key, value]) => {
        const tagName = prefix ? `${prefix}:${key}` : key;

        if (value === null || value === undefined) {
          return `<${tagName} xsi:nil="true" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>`;
        }

        if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
          return `<${tagName}>${this.objectToXml(value as Record<string, unknown>)}</${tagName}>`;
        }

        if (Array.isArray(value)) {
          return value.map((item) => {
            if (typeof item === 'object') {
              return `<${tagName}>${this.objectToXml(item as Record<string, unknown>)}</${tagName}>`;
            }
            return `<${tagName}>${escapeXml(String(item))}</${tagName}>`;
          }).join('');
        }

        if (value instanceof Date) {
          return `<${tagName}>${value.toISOString()}</${tagName}>`;
        }

        return `<${tagName}>${escapeXml(String(value))}</${tagName}>`;
      })
      .join('');
  }

  private parseResponse<T>(xml: string, method: string): SoapResponse<T> {
    // Check for SOAP Fault
    const faultMatch = xml.match(/<(?:soap:|SOAP-ENV:|)[Ff]ault[^>]*>([\s\S]*?)<\/(?:soap:|SOAP-ENV:|)[Ff]ault>/i);
    if (faultMatch) {
      const faultXml = faultMatch[1];

      // SOAP 1.1 fault format
      const codeMatch = faultXml.match(/<faultcode[^>]*>([\s\S]*?)<\/faultcode>/i);
      const stringMatch = faultXml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
      const actorMatch = faultXml.match(/<faultactor[^>]*>([\s\S]*?)<\/faultactor>/i);
      const detailMatch = faultXml.match(/<detail[^>]*>([\s\S]*?)<\/detail>/i);

      // SOAP 1.2 fault format
      const codeMatch12 = faultXml.match(/<(?:\w+:)?Code[^>]*>[\s\S]*?<(?:\w+:)?Value[^>]*>([\s\S]*?)<\/(?:\w+:)?Value>/i);
      const reasonMatch12 = faultXml.match(/<(?:\w+:)?Reason[^>]*>[\s\S]*?<(?:\w+:)?Text[^>]*>([\s\S]*?)<\/(?:\w+:)?Text>/i);

      return {
        success: false,
        fault: {
          code: unescapeXml(codeMatch?.[1] ?? codeMatch12?.[1] ?? 'Unknown'),
          string: unescapeXml(stringMatch?.[1] ?? reasonMatch12?.[1] ?? 'Unknown error'),
          actor: actorMatch ? unescapeXml(actorMatch[1]) : undefined,
          detail: detailMatch ? detailMatch[1] : undefined,
        },
        rawXml: xml,
      };
    }

    // Extract body content
    const bodyMatch = xml.match(/<(?:soap:|SOAP-ENV:|)[Bb]ody[^>]*>([\s\S]*?)<\/(?:soap:|SOAP-ENV:|)[Bb]ody>/i);
    if (!bodyMatch) {
      return {
        success: false,
        fault: { code: 'ParseError', string: 'Could not parse SOAP response body' },
        rawXml: xml,
      };
    }

    const bodyContent = bodyMatch[1].trim();

    // Try to find response element (usually MethodNameResponse or MethodNameResult)
    const responseRegex = new RegExp(`<(?:\\w+:)?${method}(?:Response|Result)[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${method}(?:Response|Result)>`, 'i');
    const responseMatch = bodyContent.match(responseRegex);

    const resultXml = responseMatch ? responseMatch[1] : bodyContent;
    const result = this.parseXmlToObject(resultXml);

    return {
      success: true,
      result: result as T,
      rawXml: xml,
    };
  }

  private parseXmlToObject(xml: string): unknown {
    const trimmed = xml.trim();

    // Check if it's just text content
    if (!trimmed.startsWith('<')) {
      return unescapeXml(trimmed);
    }

    const obj: Record<string, unknown> = {};
    const elementRegex = /<([^\/][^>\s]*)[^>]*>([\s\S]*?)<\/\1>/g;
    let match;
    let hasElements = false;

    while ((match = elementRegex.exec(trimmed)) !== null) {
      hasElements = true;
      const [, tagName, content] = match;
      const key = tagName.includes(':') ? tagName.split(':')[1] : tagName;
      const value = this.parseXmlToObject(content);

      // Handle arrays (multiple elements with same name)
      if (key in obj) {
        if (Array.isArray(obj[key])) {
          (obj[key] as unknown[]).push(value);
        } else {
          obj[key] = [obj[key], value];
        }
      } else {
        obj[key] = value;
      }
    }

    if (!hasElements) {
      return unescapeXml(trimmed);
    }

    return obj;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(str: string): string {
  return str
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createXmlRpcClient(
  client: Client,
  options: { endpoint: string; requestOptions?: RequestOptions }
): XmlRpcClient {
  return new XmlRpcClient(client, options);
}

export function createSoapClient(client: Client, options: SoapOptions): SoapClient {
  return new SoapClient(client, options);
}

/**
 * SOAP plugin that adds soap() and xmlrpc() methods to client
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   baseUrl: 'https://api.example.com',
 *   plugins: [soap()]
 * });
 *
 * const soapClient = client.soap({
 *   endpoint: '/soap',
 *   namespace: 'http://example.com/service'
 * });
 *
 * const xmlrpcClient = client.xmlrpc('/xmlrpc');
 * ```
 */
export function soap() {
  return (client: Client) => {
    (client as Client & {
      soap: (options: SoapOptions) => SoapClient;
      xmlrpc: (endpoint: string, requestOptions?: RequestOptions) => XmlRpcClient;
    }).soap = (options: SoapOptions) => {
      return createSoapClient(client, options);
    };

    (client as Client & {
      xmlrpc: (endpoint: string, requestOptions?: RequestOptions) => XmlRpcClient;
    }).xmlrpc = (endpoint: string, requestOptions?: RequestOptions) => {
      return createXmlRpcClient(client, { endpoint, requestOptions });
    };
  };
}

// Type augmentation for Client
declare module '../core/client.js' {
  interface Client {
    soap(options: SoapOptions): SoapClient;
    xmlrpc(endpoint: string, requestOptions?: RequestOptions): XmlRpcClient;
  }
}
