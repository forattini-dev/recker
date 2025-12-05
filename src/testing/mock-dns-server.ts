/**
 * Mock DNS Server
 *
 * A lightweight DNS server for testing DNS clients.
 * Supports A, AAAA, CNAME, MX, TXT, NS, and SOA record types.
 *
 * @example
 * ```typescript
 * import { MockDnsServer } from 'recker/testing';
 *
 * const server = await MockDnsServer.create({ port: 5353 });
 *
 * // Add custom records
 * server.addRecord('example.com', 'A', '93.184.216.34');
 * server.addRecord('example.com', 'MX', { priority: 10, exchange: 'mail.example.com' });
 *
 * // Query the server
 * // dig @127.0.0.1 -p 5353 example.com A
 *
 * await server.stop();
 * ```
 */

import { EventEmitter } from 'node:events';
import * as dgram from 'node:dgram';

// ============================================
// Types
// ============================================

export interface MockDnsServerOptions {
  /**
   * Port to listen on
   * @default 5353
   */
  port?: number;

  /**
   * Host to bind to
   * @default '127.0.0.1'
   */
  host?: string;

  /**
   * Default TTL for records
   * @default 300
   */
  ttl?: number;

  /**
   * Response delay in ms
   * @default 0
   */
  delay?: number;
}

export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SOA' | 'PTR' | 'SRV';

export interface DnsRecord {
  type: DnsRecordType;
  value: string | DnsMxRecord | DnsSoaRecord | DnsSrvRecord;
  ttl?: number;
}

export interface DnsMxRecord {
  priority: number;
  exchange: string;
}

export interface DnsSoaRecord {
  mname: string;
  rname: string;
  serial: number;
  refresh: number;
  retry: number;
  expire: number;
  minimum: number;
}

export interface DnsSrvRecord {
  priority: number;
  weight: number;
  port: number;
  target: string;
}

export interface MockDnsStats {
  queriesReceived: number;
  responseSent: number;
  queryLog: Array<{ domain: string; type: string; timestamp: number }>;
}

// DNS record type codes
const RECORD_TYPES: Record<DnsRecordType, number> = {
  A: 1,
  NS: 2,
  CNAME: 5,
  SOA: 6,
  PTR: 12,
  MX: 15,
  TXT: 16,
  AAAA: 28,
  SRV: 33,
};

const RECORD_TYPE_NAMES: Record<number, DnsRecordType> = Object.fromEntries(
  Object.entries(RECORD_TYPES).map(([k, v]) => [v, k as DnsRecordType])
);

// ============================================
// MockDnsServer
// ============================================

export class MockDnsServer extends EventEmitter {
  private options: Required<MockDnsServerOptions>;
  private socket: dgram.Socket | null = null;
  private records: Map<string, DnsRecord[]> = new Map();
  private started = false;
  private stats: MockDnsStats = {
    queriesReceived: 0,
    responseSent: 0,
    queryLog: [],
  };

  constructor(options: MockDnsServerOptions = {}) {
    super();

    this.options = {
      port: 5353,
      host: '127.0.0.1',
      ttl: 300,
      delay: 0,
      ...options,
    };

    // Add default records
    this.addDefaultRecords();
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

  get statistics(): MockDnsStats {
    return { ...this.stats };
  }

  // ============================================
  // Record Management
  // ============================================

  /**
   * Add a DNS record
   */
  addRecord(domain: string, type: DnsRecordType, value: string | DnsMxRecord | DnsSoaRecord | DnsSrvRecord, ttl?: number): void {
    const key = domain.toLowerCase();
    const records = this.records.get(key) || [];
    records.push({ type, value, ttl: ttl ?? this.options.ttl });
    this.records.set(key, records);
  }

  /**
   * Remove all records for a domain
   */
  removeRecords(domain: string): void {
    this.records.delete(domain.toLowerCase());
  }

  /**
   * Get records for a domain
   */
  getRecords(domain: string): DnsRecord[] {
    return this.records.get(domain.toLowerCase()) || [];
  }

  /**
   * Clear all records
   */
  clearRecords(): void {
    this.records.clear();
    this.addDefaultRecords();
  }

  private addDefaultRecords(): void {
    // localhost
    this.addRecord('localhost', 'A', '127.0.0.1');
    this.addRecord('localhost', 'AAAA', '::1');

    // Example domains for testing
    this.addRecord('example.com', 'A', '93.184.216.34');
    this.addRecord('example.com', 'AAAA', '2606:2800:220:1:248:1893:25c8:1946');
    this.addRecord('example.com', 'NS', 'ns1.example.com');
    this.addRecord('example.com', 'NS', 'ns2.example.com');
    this.addRecord('example.com', 'MX', { priority: 10, exchange: 'mail.example.com' });
    this.addRecord('example.com', 'TXT', 'v=spf1 include:_spf.example.com ~all');

    // Test domains
    this.addRecord('test.local', 'A', '192.168.1.100');
    this.addRecord('api.test.local', 'A', '192.168.1.101');
    this.addRecord('api.test.local', 'CNAME', 'test.local');
  }

  // ============================================
  // Lifecycle
  // ============================================

  async start(): Promise<void> {
    if (this.started) {
      throw new Error('Server already started');
    }

    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket('udp4');

      this.socket.on('error', (err) => {
        this.emit('error', err);
        if (!this.started) {
          reject(err);
        }
      });

      this.socket.on('message', (msg, rinfo) => {
        this.handleQuery(msg, rinfo);
      });

      this.socket.bind(this.options.port, this.options.host, () => {
        this.started = true;
        this.emit('start');
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.started || !this.socket) return;

    return new Promise((resolve) => {
      this.socket!.close(() => {
        this.socket = null;
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
    this.clearRecords();
    this.emit('reset');
  }

  // ============================================
  // Query Handling
  // ============================================

  private async handleQuery(msg: Buffer, rinfo: dgram.RemoteInfo): Promise<void> {
    this.stats.queriesReceived++;

    // Apply delay
    if (this.options.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.options.delay));
    }

    try {
      const query = this.parseDnsQuery(msg);

      this.stats.queryLog.push({
        domain: query.domain,
        type: query.type,
        timestamp: Date.now(),
      });

      this.emit('query', query, rinfo);

      const response = this.buildResponse(msg, query);

      this.socket?.send(response, rinfo.port, rinfo.address, (err) => {
        if (err) {
          this.emit('error', err);
        } else {
          this.stats.responseSent++;
          this.emit('response', query);
        }
      });
    } catch (err) {
      this.emit('error', err);
    }
  }

  private parseDnsQuery(msg: Buffer): { id: number; domain: string; type: string; typeCode: number } {
    const id = msg.readUInt16BE(0);

    // Parse domain name starting at offset 12
    let offset = 12;
    const labels: string[] = [];

    while (msg[offset] !== 0) {
      const len = msg[offset];
      offset++;
      labels.push(msg.slice(offset, offset + len).toString('ascii'));
      offset += len;
    }
    offset++; // Skip null terminator

    const domain = labels.join('.');
    const typeCode = msg.readUInt16BE(offset);
    const type = RECORD_TYPE_NAMES[typeCode] || `TYPE${typeCode}`;

    return { id, domain, type, typeCode };
  }

  private buildResponse(query: Buffer, parsed: { id: number; domain: string; type: string; typeCode: number }): Buffer {
    const records = this.records.get(parsed.domain.toLowerCase()) || [];
    const matchingRecords = records.filter((r) => r.type === parsed.type || parsed.type === 'ANY');

    // Build response header
    const header = Buffer.alloc(12);
    header.writeUInt16BE(parsed.id, 0); // Transaction ID
    header.writeUInt16BE(0x8180, 2); // Flags: response, authoritative, recursion available
    header.writeUInt16BE(1, 4); // Questions: 1
    header.writeUInt16BE(matchingRecords.length, 6); // Answers
    header.writeUInt16BE(0, 8); // Authority RRs
    header.writeUInt16BE(0, 10); // Additional RRs

    // Copy question section from query
    const questionEnd = 12 + this.getDomainLength(query, 12) + 4;
    const question = query.slice(12, questionEnd);

    // Build answer section
    const answers: Buffer[] = [];
    for (const record of matchingRecords) {
      answers.push(this.buildAnswerRecord(parsed.domain, record));
    }

    return Buffer.concat([header, question, ...answers]);
  }

  private getDomainLength(buf: Buffer, offset: number): number {
    let len = 0;
    while (buf[offset + len] !== 0) {
      len += buf[offset + len] + 1;
    }
    return len + 1;
  }

  private buildAnswerRecord(domain: string, record: DnsRecord): Buffer {
    const parts: Buffer[] = [];

    // Domain name (using compression pointer to question)
    parts.push(Buffer.from([0xc0, 0x0c]));

    // Type
    const typeCode = RECORD_TYPES[record.type] || 1;
    const typeBuf = Buffer.alloc(2);
    typeBuf.writeUInt16BE(typeCode, 0);
    parts.push(typeBuf);

    // Class (IN = 1)
    const classBuf = Buffer.alloc(2);
    classBuf.writeUInt16BE(1, 0);
    parts.push(classBuf);

    // TTL
    const ttlBuf = Buffer.alloc(4);
    ttlBuf.writeUInt32BE(record.ttl ?? this.options.ttl, 0);
    parts.push(ttlBuf);

    // RDATA
    const rdata = this.encodeRdata(record);
    const rdLengthBuf = Buffer.alloc(2);
    rdLengthBuf.writeUInt16BE(rdata.length, 0);
    parts.push(rdLengthBuf);
    parts.push(rdata);

    return Buffer.concat(parts);
  }

  private encodeRdata(record: DnsRecord): Buffer {
    switch (record.type) {
      case 'A': {
        const parts = (record.value as string).split('.').map(Number);
        return Buffer.from(parts);
      }
      case 'AAAA': {
        const ip = record.value as string;
        const buf = Buffer.alloc(16);
        const parts = ip.split(':');
        for (let i = 0; i < 8; i++) {
          const val = parseInt(parts[i] || '0', 16);
          buf.writeUInt16BE(val, i * 2);
        }
        return buf;
      }
      case 'CNAME':
      case 'NS':
      case 'PTR': {
        return this.encodeDomainName(record.value as string);
      }
      case 'MX': {
        const mx = record.value as DnsMxRecord;
        const priority = Buffer.alloc(2);
        priority.writeUInt16BE(mx.priority, 0);
        return Buffer.concat([priority, this.encodeDomainName(mx.exchange)]);
      }
      case 'TXT': {
        const txt = record.value as string;
        const txtBuf = Buffer.from(txt, 'utf8');
        const len = Buffer.from([txtBuf.length]);
        return Buffer.concat([len, txtBuf]);
      }
      case 'SRV': {
        const srv = record.value as DnsSrvRecord;
        const buf = Buffer.alloc(6);
        buf.writeUInt16BE(srv.priority, 0);
        buf.writeUInt16BE(srv.weight, 2);
        buf.writeUInt16BE(srv.port, 4);
        return Buffer.concat([buf, this.encodeDomainName(srv.target)]);
      }
      default:
        return Buffer.from(record.value as string, 'utf8');
    }
  }

  private encodeDomainName(domain: string): Buffer {
    const parts = domain.split('.');
    const buffers: Buffer[] = [];
    for (const part of parts) {
      buffers.push(Buffer.from([part.length]));
      buffers.push(Buffer.from(part, 'ascii'));
    }
    buffers.push(Buffer.from([0])); // Null terminator
    return Buffer.concat(buffers);
  }

  // ============================================
  // Static factory
  // ============================================

  static async create(options: MockDnsServerOptions = {}): Promise<MockDnsServer> {
    const server = new MockDnsServer(options);
    await server.start();
    return server;
  }
}
