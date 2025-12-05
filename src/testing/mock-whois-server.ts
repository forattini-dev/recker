/**
 * Mock WHOIS Server
 *
 * A lightweight WHOIS server for testing WHOIS clients.
 * Returns realistic domain registration data.
 *
 * @example
 * ```typescript
 * import { MockWhoisServer } from 'recker/testing';
 *
 * const server = await MockWhoisServer.create({ port: 4343 });
 *
 * // Add custom domain data
 * server.addDomain('example.com', {
 *   registrar: 'Example Registrar',
 *   createdDate: '2000-01-01',
 *   expiryDate: '2025-01-01'
 * });
 *
 * // Query: whois -h 127.0.0.1 -p 4343 example.com
 *
 * await server.stop();
 * ```
 */

import { EventEmitter } from 'node:events';
import * as net from 'node:net';

// ============================================
// Types
// ============================================

export interface MockWhoisServerOptions {
  /**
   * Port to listen on
   * @default 4343
   */
  port?: number;

  /**
   * Host to bind to
   * @default '127.0.0.1'
   */
  host?: string;

  /**
   * Response delay in ms
   * @default 0
   */
  delay?: number;
}

export interface WhoisDomainData {
  registrar?: string;
  registrarUrl?: string;
  createdDate?: string;
  updatedDate?: string;
  expiryDate?: string;
  status?: string[];
  nameservers?: string[];
  registrantName?: string;
  registrantOrg?: string;
  registrantEmail?: string;
  adminEmail?: string;
  techEmail?: string;
  dnssec?: string;
}

export interface MockWhoisStats {
  queriesReceived: number;
  responseSent: number;
  queryLog: Array<{ query: string; timestamp: number }>;
}

// ============================================
// MockWhoisServer
// ============================================

export class MockWhoisServer extends EventEmitter {
  private options: Required<MockWhoisServerOptions>;
  private server: net.Server | null = null;
  private domains: Map<string, WhoisDomainData> = new Map();
  private started = false;
  private stats: MockWhoisStats = {
    queriesReceived: 0,
    responseSent: 0,
    queryLog: [],
  };

  constructor(options: MockWhoisServerOptions = {}) {
    super();

    this.options = {
      port: 4343,
      host: '127.0.0.1',
      delay: 0,
      ...options,
    };

    // Add default domains
    this.addDefaultDomains();
  }

  // ============================================
  // Properties
  // ============================================

  get isRunning(): boolean {
    return this.started;
  }

  get port(): number {
    return this.options.port;
  }

  get host(): string {
    return this.options.host;
  }

  get url(): string {
    return `${this.options.host}:${this.options.port}`;
  }

  get statistics(): MockWhoisStats {
    return { ...this.stats };
  }

  // ============================================
  // Domain Management
  // ============================================

  /**
   * Add a domain with custom data
   */
  addDomain(domain: string, data: WhoisDomainData): void {
    this.domains.set(domain.toLowerCase(), data);
  }

  /**
   * Remove a domain
   */
  removeDomain(domain: string): void {
    this.domains.delete(domain.toLowerCase());
  }

  /**
   * Get domain data
   */
  getDomain(domain: string): WhoisDomainData | undefined {
    return this.domains.get(domain.toLowerCase());
  }

  /**
   * Clear all domains
   */
  clearDomains(): void {
    this.domains.clear();
    this.addDefaultDomains();
  }

  private addDefaultDomains(): void {
    // Example domains for testing
    this.addDomain('example.com', {
      registrar: 'RESERVED-Internet Assigned Numbers Authority',
      registrarUrl: 'http://www.iana.org',
      createdDate: '1995-08-14T04:00:00Z',
      updatedDate: '2023-08-14T07:01:38Z',
      expiryDate: '2024-08-13T04:00:00Z',
      status: ['client delete prohibited', 'client transfer prohibited', 'client update prohibited'],
      nameservers: ['a.iana-servers.net', 'b.iana-servers.net'],
      dnssec: 'signedDelegation',
    });

    this.addDomain('google.com', {
      registrar: 'MarkMonitor Inc.',
      registrarUrl: 'http://www.markmonitor.com',
      createdDate: '1997-09-15T04:00:00Z',
      updatedDate: '2019-09-09T15:39:04Z',
      expiryDate: '2028-09-14T04:00:00Z',
      status: ['client delete prohibited', 'client transfer prohibited', 'client update prohibited', 'server delete prohibited', 'server transfer prohibited', 'server update prohibited'],
      nameservers: ['ns1.google.com', 'ns2.google.com', 'ns3.google.com', 'ns4.google.com'],
      registrantOrg: 'Google LLC',
      registrantEmail: 'Select Request Email Form at https://domains.markmonitor.com/whois/google.com',
      dnssec: 'unsigned',
    });

    this.addDomain('test.local', {
      registrar: 'Mock Registrar',
      registrarUrl: 'http://localhost',
      createdDate: '2020-01-01T00:00:00Z',
      updatedDate: '2024-01-01T00:00:00Z',
      expiryDate: '2030-01-01T00:00:00Z',
      status: ['ok'],
      nameservers: ['ns1.test.local', 'ns2.test.local'],
      registrantName: 'Test User',
      registrantOrg: 'Test Organization',
      registrantEmail: 'admin@test.local',
    });
  }

  // ============================================
  // Lifecycle
  // ============================================

  async start(): Promise<void> {
    if (this.started) {
      throw new Error('Server already started');
    }

    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server.on('error', (err) => {
        this.emit('error', err);
        if (!this.started) {
          reject(err);
        }
      });

      this.server.listen(this.options.port, this.options.host, () => {
        this.started = true;
        this.emit('start');
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.started || !this.server) return;

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.server = null;
        this.started = false;
        this.emit('stop');
        resolve();
      });
    });
  }

  reset(): void {
    this.stats = {
      queriesReceived: 0,
      responseSent: 0,
      queryLog: [],
    };
    this.clearDomains();
    this.emit('reset');
  }

  // ============================================
  // Connection Handling
  // ============================================

  private handleConnection(socket: net.Socket): void {
    let data = '';

    socket.on('data', (chunk) => {
      data += chunk.toString();

      // WHOIS queries end with newline
      if (data.includes('\n') || data.includes('\r')) {
        this.handleQuery(data.trim(), socket);
      }
    });

    socket.on('error', (err) => {
      this.emit('error', err);
    });
  }

  private async handleQuery(query: string, socket: net.Socket): Promise<void> {
    this.stats.queriesReceived++;
    this.stats.queryLog.push({ query, timestamp: Date.now() });

    this.emit('query', query);

    // Apply delay
    if (this.options.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.options.delay));
    }

    const response = this.buildResponse(query);

    socket.write(response, () => {
      this.stats.responseSent++;
      this.emit('response', query);
      socket.end();
    });
  }

  private buildResponse(query: string): string {
    const domain = query.toLowerCase().trim();
    const data = this.domains.get(domain);

    if (!data) {
      return this.buildNotFoundResponse(domain);
    }

    return this.buildDomainResponse(domain, data);
  }

  private buildNotFoundResponse(domain: string): string {
    return `
% WHOIS Mock Server

No match for domain "${domain}".

>>> Last update of WHOIS database: ${new Date().toISOString()} <<<

NOTICE: This is a mock WHOIS server for testing purposes.
`.trim() + '\n';
  }

  private buildDomainResponse(domain: string, data: WhoisDomainData): string {
    const lines: string[] = [
      '% WHOIS Mock Server',
      '',
      `Domain Name: ${domain.toUpperCase()}`,
    ];

    if (data.registrar) {
      lines.push(`Registrar: ${data.registrar}`);
    }
    if (data.registrarUrl) {
      lines.push(`Registrar URL: ${data.registrarUrl}`);
    }
    if (data.createdDate) {
      lines.push(`Creation Date: ${data.createdDate}`);
    }
    if (data.updatedDate) {
      lines.push(`Updated Date: ${data.updatedDate}`);
    }
    if (data.expiryDate) {
      lines.push(`Registry Expiry Date: ${data.expiryDate}`);
    }
    if (data.status && data.status.length > 0) {
      for (const status of data.status) {
        lines.push(`Domain Status: ${status}`);
      }
    }
    if (data.nameservers && data.nameservers.length > 0) {
      for (const ns of data.nameservers) {
        lines.push(`Name Server: ${ns}`);
      }
    }
    if (data.registrantName) {
      lines.push(`Registrant Name: ${data.registrantName}`);
    }
    if (data.registrantOrg) {
      lines.push(`Registrant Organization: ${data.registrantOrg}`);
    }
    if (data.registrantEmail) {
      lines.push(`Registrant Email: ${data.registrantEmail}`);
    }
    if (data.adminEmail) {
      lines.push(`Admin Email: ${data.adminEmail}`);
    }
    if (data.techEmail) {
      lines.push(`Tech Email: ${data.techEmail}`);
    }
    if (data.dnssec) {
      lines.push(`DNSSEC: ${data.dnssec}`);
    }

    lines.push('');
    lines.push(`>>> Last update of WHOIS database: ${new Date().toISOString()} <<<`);
    lines.push('');
    lines.push('NOTICE: This is a mock WHOIS server for testing purposes.');

    return lines.join('\n') + '\n';
  }

  // ============================================
  // Static factory
  // ============================================

  static async create(options: MockWhoisServerOptions = {}): Promise<MockWhoisServer> {
    const server = new MockWhoisServer(options);
    await server.start();
    return server;
  }
}
