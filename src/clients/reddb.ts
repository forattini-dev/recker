/**
 * RedDB client for Recker.
 *
 * V2 exposes a namespace-based surface over RedDB's HTTP API, gRPC service,
 * and native wire protocol. Results always include transport metadata and
 * normalized operation metrics.
 */

import { performance } from 'node:perf_hooks';
import { connect as connectTcp, Socket } from 'node:net';
import { connect as connectTls, TLSSocket } from 'node:tls';

import * as grpc from '@grpc/grpc-js';
import protobuf from 'protobufjs';

import { createClient, type Client as ReckerClient, type ExtendedClientOptions } from '../core/client.js';
import {
  AbortError,
  AuthenticationError,
  ConfigurationError,
  ConnectionError,
  NotFoundError,
  ParseError,
  ProtocolError,
  UnsupportedError,
  ValidationError,
} from '../core/errors.js';
import { REDDB_PROTO } from './reddb-proto.js';

export type RedDbTransportMode = 'auto' | 'http' | 'grpc' | 'wire';
export type RedDbResolvedTransport = 'http' | 'grpc' | 'wire';
export type RedDbBinaryValue = string | number | boolean | bigint | Buffer | Uint8Array | null;

export interface RedDbQueryStats {
  nodes_scanned?: number;
  edges_scanned?: number;
  rows_scanned?: number;
  exec_time_us?: number;
  [key: string]: unknown;
}

export interface RedDbQueryData {
  ok?: boolean;
  query?: string;
  mode?: string;
  capability?: string;
  statement?: string;
  engine?: string;
  record_count?: number;
  affected_rows?: number;
  statement_type?: string;
  result?: {
    columns?: string[];
    records?: Array<Record<string, unknown>>;
    stats?: RedDbQueryStats;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface RedDbBatchQueryData {
  results: RedDbQueryData[];
  [key: string]: unknown;
}

export interface RedDbScanEntity {
  id: number;
  kind: string;
  collection: string;
  json: string;
  [key: string]: unknown;
}

export interface RedDbScanData {
  collection: string;
  total: number;
  next_offset?: number | null;
  items: RedDbScanEntity[];
  [key: string]: unknown;
}

export interface RedDbEntityData {
  ok?: boolean;
  id?: number;
  entity?: unknown;
  entity_json?: string;
  [key: string]: unknown;
}

export interface RedDbBulkEntityData {
  ok?: boolean;
  count?: number;
  first_id?: number;
  items?: RedDbEntityData[];
  [key: string]: unknown;
}

export interface RedDbBulkInsertData {
  ok?: boolean;
  count?: number;
  first_id?: number;
  [key: string]: unknown;
}

export interface RedDbHealthData {
  healthy?: boolean;
  state?: string;
  checked_at_unix_ms?: number;
  [key: string]: unknown;
}

export interface RedDbStatsData {
  collection_count?: number;
  total_entities?: number;
  total_memory_bytes?: number;
  cross_ref_count?: number;
  active_connections?: number;
  idle_connections?: number;
  total_checkouts?: number;
  paged_mode?: boolean;
  started_at_unix_ms?: number;
  [key: string]: unknown;
}

export interface RedDbCollectionsData {
  collections: string[];
  [key: string]: unknown;
}

export interface RedDbKvData {
  ok?: boolean;
  collection?: string;
  key?: string;
  value?: unknown;
  id?: number;
  [key: string]: unknown;
}

export interface RedDbKvListItem {
  key?: string;
  value?: unknown;
  id?: number;
  [key: string]: unknown;
}

export interface RedDbKvListData {
  items: RedDbKvListItem[];
  query: RedDbQueryData;
  [key: string]: unknown;
}

export interface RedDbCapabilities {
  requestedTransport: RedDbTransportMode;
  allowTransportFallback: boolean;
  availableTransports: {
    http: boolean;
    grpc: boolean;
    wire: boolean;
  };
  namespaces: {
    system: boolean;
    sql: boolean;
    collections: boolean;
    indexes: boolean;
    rows: boolean;
    documents: boolean;
    nodes: boolean;
    edges: boolean;
    vectors: boolean;
    kv: boolean;
  };
  features: {
    grpcNative: boolean;
    wireSql: boolean;
    wireBulkRows: boolean;
    wireBinaryBulkScalars: boolean;
    httpBinaryBulkEmulation: boolean;
    sqlBatchEmulationOverHttp: boolean;
    sqlBatchEmulationOverWire: boolean;
    kvListViaSql: boolean;
  };
}

export interface RedDbOperationMetrics {
  operation: string;
  requestedTransport: RedDbTransportMode;
  transport: RedDbResolvedTransport;
  degradedFromRequestedTransport: boolean;
  emulated: boolean;
  startedAt: number;
  durationMs: number;
  recordCount?: number;
  affectedRows?: number;
  rowsScanned?: number;
  execTimeUs?: number;
}

export interface RedDbOperationEnvelope<T> {
  data: T;
  transport: RedDbResolvedTransport;
  requestedTransport: RedDbTransportMode;
  degradedFromRequestedTransport: boolean;
  emulated: boolean;
  metrics: RedDbOperationMetrics;
}

export interface RedDbTransportRequest {
  transport?: RedDbTransportMode;
  signal?: AbortSignal;
  timeout?: number;
}

export interface RedDbQueryOptions extends RedDbTransportRequest {
  entityTypes?: string[];
  capabilities?: string[];
}

export interface RedDbBatchQueryOptions extends RedDbQueryOptions {
  concurrency?: number;
}

export interface RedDbScanRequest extends RedDbTransportRequest {
  collection: string;
  offset?: number;
  limit?: number;
}

export interface RedDbCollectionCreateOptions extends RedDbTransportRequest {
  name: string;
  ttl?: string | number;
  ttlMs?: number;
}

export interface RedDbCollectionRequest extends RedDbTransportRequest {
  name: string;
}

export interface RedDbIndexListRequest extends RedDbTransportRequest {
  collection?: string;
}

export interface RedDbIndexCreateOptions extends RedDbTransportRequest {
  name: string;
  collection: string;
  columns: string[];
  unique?: boolean;
  method?: 'BTREE' | 'HASH' | 'BITMAP' | 'RTREE';
}

export interface RedDbIndexNameRequest extends RedDbTransportRequest {
  name: string;
}

export interface RedDbIndexRebuildRequest extends RedDbTransportRequest {
  collection?: string;
}

export interface RedDbRowCreateRequest extends RedDbTransportRequest {
  collection: string;
  payload: {
    fields: Record<string, unknown>;
    ttl?: string | number;
    ttl_ms?: number;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface RedDbRowBulkCreateRequest extends RedDbTransportRequest {
  collection: string;
  items: Array<{
    fields: Record<string, unknown>;
    ttl?: string | number;
    ttl_ms?: number;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
}

export interface RedDbEntityCreateRequest extends RedDbTransportRequest {
  collection: string;
  payload: Record<string, unknown>;
}

export interface RedDbBulkEntityCreateRequest extends RedDbTransportRequest {
  collection: string;
  items: Record<string, unknown>[];
}

export interface RedDbPatchEntityRequest extends RedDbTransportRequest {
  collection: string;
  id: number;
  payload: Record<string, unknown>;
}

export interface RedDbDeleteEntityRequest extends RedDbTransportRequest {
  collection: string;
  id: number;
}

export interface RedDbVectorSearchRequest extends RedDbTransportRequest {
  collection: string;
  payload: Record<string, unknown>;
}

export interface RedDbBulkInsertBinaryRequest extends RedDbTransportRequest {
  collection: string;
  fieldNames: string[];
  rows: RedDbBinaryValue[][];
}

export interface RedDbKvRequest extends RedDbTransportRequest {
  collection: string;
  key: string;
}

export interface RedDbKvPutRequest extends RedDbTransportRequest {
  collection: string;
  key: string;
  value: unknown;
}

export interface RedDbKvListRequest extends RedDbQueryOptions {
  collection: string;
  prefix?: string;
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
}

export interface RedDbWireTlsOptions {
  enabled?: boolean;
  rejectUnauthorized?: boolean;
  ca?: string | Buffer;
  servername?: string;
}

export interface RedDbGrpcTlsOptions {
  enabled?: boolean;
  rejectUnauthorized?: boolean;
  ca?: string | Buffer;
  servername?: string;
}

export interface RedDbGrpcKeepaliveOptions {
  timeMs?: number;
  timeoutMs?: number;
  permitWithoutCalls?: boolean;
  maxPingsWithoutData?: number;
  initialReconnectBackoffMs?: number;
  maxReconnectBackoffMs?: number;
}

export interface RedDbOperationTimeouts {
  system?: number;
  sql?: number;
  sqlBatch?: number;
  scan?: number;
  mutation?: number;
  bulk?: number;
  search?: number;
  ddl?: number;
  index?: number;
  kv?: number;
}

export interface RedDbClientOptions {
  /**
   * Base URL for RedDB's HTTP API, for example `http://127.0.0.1:8080`.
   */
  baseUrl?: string;
  /**
   * Existing Recker client to reuse for HTTP operations.
   */
  client?: ReckerClient;
  /**
   * Default transport preference.
   */
  transport?: RedDbTransportMode;
  /**
   * When the requested transport cannot satisfy an operation, degrade to the
   * best available implemented transport and mark the result envelope.
   *
   * @default true
   */
  allowTransportFallback?: boolean;
  /**
   * Bearer token used for HTTP and gRPC operations when auth is enabled.
   */
  authToken?: string;
  /**
   * Optional write token header carried through as `x-write-token`.
   */
  writeToken?: string;
  /**
   * Additional default HTTP headers and gRPC metadata.
   */
  headers?: Record<string, string>;
  /**
   * Default request timeout in milliseconds.
   *
   * @default 30000
   */
  timeout?: number;
  /**
   * Enable HTTP/2 on the internal Recker client.
   *
   * @default true
   */
  http2?: boolean;
  /**
   * Additional options for the internal Recker HTTP client.
   */
  httpClientOptions?: Omit<ExtendedClientOptions, 'baseUrl' | 'headers' | 'timeout' | 'http2'>;
  /**
   * RedDB wire address in `host:port` form.
   */
  wireAddress?: string;
  /**
   * TLS settings for the wire protocol.
   */
  wireTls?: boolean | RedDbWireTlsOptions;
  /**
   * Number of wire connections to keep available for round-robin dispatch.
   *
   * @default 1
   */
  wirePoolSize?: number;
  /**
   * Enable TCP keepalive on wire connections.
   *
   * @default true
   */
  wireKeepAlive?: boolean;
  /**
   * Initial TCP keepalive delay for wire connections in milliseconds.
   *
   * @default 30000
   */
  wireKeepAliveInitialDelayMs?: number;
  /**
   * Timeout for establishing wire connections in milliseconds.
   *
   * @default timeout
   */
  wireConnectTimeout?: number;
  /**
   * RedDB gRPC address in `host:port`, `grpc://host:port`, or `grpcs://host:port` form.
   */
  grpcAddress?: string;
  /**
   * TLS settings for the gRPC client.
   */
  grpcTls?: boolean | RedDbGrpcTlsOptions;
  /**
   * Additional gRPC channel options.
   */
  grpcOptions?: Record<string, string | number>;
  /**
   * gRPC keepalive and reconnect tuning.
   */
  grpcKeepalive?: RedDbGrpcKeepaliveOptions;
  /**
   * Optional timeout overrides by operation class.
   */
  operationTimeouts?: RedDbOperationTimeouts;
  /**
   * Concurrency used by emulated batch operations.
   *
   * @default 8
   */
  batchConcurrency?: number;
}

export interface RedDbSystemNamespace {
  health(options?: RedDbTransportRequest): Promise<RedDbOperationEnvelope<RedDbHealthData>>;
  ready(options?: RedDbTransportRequest): Promise<RedDbOperationEnvelope<RedDbHealthData>>;
  stats(options?: RedDbTransportRequest): Promise<RedDbOperationEnvelope<RedDbStatsData>>;
}

export interface RedDbSqlNamespace {
  query(query: string, options?: RedDbQueryOptions): Promise<RedDbOperationEnvelope<RedDbQueryData>>;
  explain(query: string, options?: RedDbQueryOptions): Promise<RedDbOperationEnvelope<Record<string, unknown>>>;
  batch(queries: string[], options?: RedDbBatchQueryOptions): Promise<RedDbOperationEnvelope<RedDbBatchQueryData>>;
}

export interface RedDbCollectionsNamespace {
  list(options?: RedDbTransportRequest): Promise<RedDbOperationEnvelope<RedDbCollectionsData>>;
  create(options: RedDbCollectionCreateOptions): Promise<RedDbOperationEnvelope<Record<string, unknown>>>;
  describe(options: RedDbCollectionRequest): Promise<RedDbOperationEnvelope<Record<string, unknown>>>;
  drop(options: RedDbCollectionRequest): Promise<RedDbOperationEnvelope<Record<string, unknown>>>;
}

export interface RedDbIndexesNamespace {
  list(options?: RedDbIndexListRequest): Promise<RedDbOperationEnvelope<Record<string, unknown>>>;
  statuses(options?: RedDbTransportRequest): Promise<RedDbOperationEnvelope<Record<string, unknown>>>;
  create(options: RedDbIndexCreateOptions): Promise<RedDbOperationEnvelope<RedDbQueryData>>;
  enable(options: RedDbIndexNameRequest): Promise<RedDbOperationEnvelope<Record<string, unknown>>>;
  disable(options: RedDbIndexNameRequest): Promise<RedDbOperationEnvelope<Record<string, unknown>>>;
  warmup(options: RedDbIndexNameRequest): Promise<RedDbOperationEnvelope<Record<string, unknown>>>;
  rebuild(options?: RedDbIndexRebuildRequest): Promise<RedDbOperationEnvelope<Record<string, unknown>>>;
}

export interface RedDbRowsNamespace {
  scan(request: RedDbScanRequest): Promise<RedDbOperationEnvelope<RedDbScanData>>;
  create(request: RedDbRowCreateRequest): Promise<RedDbOperationEnvelope<RedDbEntityData>>;
  bulkCreate(request: RedDbRowBulkCreateRequest): Promise<RedDbOperationEnvelope<RedDbBulkEntityData>>;
  patch(request: RedDbPatchEntityRequest): Promise<RedDbOperationEnvelope<RedDbEntityData>>;
  delete(request: RedDbDeleteEntityRequest): Promise<RedDbOperationEnvelope<Record<string, unknown>>>;
}

export interface RedDbDocumentsNamespace {
  create(request: RedDbEntityCreateRequest): Promise<RedDbOperationEnvelope<RedDbEntityData>>;
  bulkCreate(request: RedDbBulkEntityCreateRequest): Promise<RedDbOperationEnvelope<RedDbBulkEntityData>>;
}

export interface RedDbNodesNamespace {
  create(request: RedDbEntityCreateRequest): Promise<RedDbOperationEnvelope<RedDbEntityData>>;
  bulkCreate(request: RedDbBulkEntityCreateRequest): Promise<RedDbOperationEnvelope<RedDbBulkEntityData>>;
}

export interface RedDbEdgesNamespace {
  create(request: RedDbEntityCreateRequest): Promise<RedDbOperationEnvelope<RedDbEntityData>>;
  bulkCreate(request: RedDbBulkEntityCreateRequest): Promise<RedDbOperationEnvelope<RedDbBulkEntityData>>;
}

export interface RedDbVectorsNamespace {
  create(request: RedDbEntityCreateRequest): Promise<RedDbOperationEnvelope<RedDbEntityData>>;
  bulkCreate(request: RedDbBulkEntityCreateRequest): Promise<RedDbOperationEnvelope<RedDbBulkEntityData>>;
  bulkInsertBinary(request: RedDbBulkInsertBinaryRequest): Promise<RedDbOperationEnvelope<RedDbBulkInsertData>>;
  similar(request: RedDbVectorSearchRequest): Promise<RedDbOperationEnvelope<Record<string, unknown>>>;
  ivfSearch(request: RedDbVectorSearchRequest): Promise<RedDbOperationEnvelope<Record<string, unknown>>>;
}

export interface RedDbKvNamespace {
  get(request: RedDbKvRequest): Promise<RedDbOperationEnvelope<RedDbKvData>>;
  put(request: RedDbKvPutRequest): Promise<RedDbOperationEnvelope<RedDbEntityData>>;
  delete(request: RedDbKvRequest): Promise<RedDbOperationEnvelope<Record<string, unknown>>>;
  list(request: RedDbKvListRequest): Promise<RedDbOperationEnvelope<RedDbKvListData>>;
}

interface TransportResolution {
  transport: RedDbResolvedTransport;
  requestedTransport: RedDbTransportMode;
  degradedFromRequestedTransport: boolean;
  emulated: boolean;
}

interface PendingWireRequest {
  resolve: (value: { type: number; payload: Buffer }) => void;
  reject: (error: Error) => void;
  timer?: NodeJS.Timeout;
}

interface WireEndpoint {
  host: string;
  port: number;
}

interface GrpcTarget {
  target: string;
  secure: boolean;
}

interface RedDbWireTransport {
  query(sql: string, timeout?: number): Promise<unknown>;
  bulkInsert(collection: string, payloads: string[], timeout?: number): Promise<number>;
  bulkInsertBinary(collection: string, fieldNames: string[], rows: RedDbBinaryValue[][], timeout?: number): Promise<number>;
  close(): Promise<void>;
}

interface OperationTransportProfile {
  preferences: RedDbResolvedTransport[];
  supported?: Partial<Record<RedDbResolvedTransport, boolean>>;
  emulated?: RedDbResolvedTransport[];
}

const PROTO_OBJECT_OPTIONS = {
  longs: Number,
  enums: String,
  defaults: false,
  arrays: true,
  objects: true,
  oneofs: true,
};

const parsedProto = protobuf.parse(REDDB_PROTO, { keepCase: true });
const protoRoot = parsedProto.root.resolveAll();
const protoService = protoRoot.lookupService('reddb.v1.RedDb') as unknown as {
  fullName: string;
  methodsArray: Array<{
    name: string;
    resolvedRequestType: {
      encode: (value: unknown) => { finish(): Uint8Array };
      fromObject: (value: unknown) => unknown;
      decode: (buffer: Uint8Array) => unknown;
      toObject: (value: unknown, options: object) => unknown;
    };
    resolvedResponseType: {
      encode: (value: unknown) => { finish(): Uint8Array };
      fromObject: (value: unknown) => unknown;
      decode: (buffer: Uint8Array) => unknown;
      toObject: (value: unknown, options: object) => unknown;
    };
  }>;
};

const grpcDefinition = buildGrpcDefinition(protoService);
const GrpcRedDbClient = grpc.makeGenericClientConstructor(grpcDefinition, 'RedDb') as grpc.ServiceClientConstructor;

const WIRE_MSG_QUERY = 0x01;
const WIRE_MSG_RESULT = 0x02;
const WIRE_MSG_ERROR = 0x03;
const WIRE_MSG_BULK_INSERT = 0x04;
const WIRE_MSG_BULK_OK = 0x05;
const WIRE_MSG_BULK_INSERT_BINARY = 0x06;

const WIRE_VAL_NULL = 0;
const WIRE_VAL_I64 = 1;
const WIRE_VAL_F64 = 2;
const WIRE_VAL_TEXT = 3;
const WIRE_VAL_BOOL = 4;
const WIRE_VAL_U64 = 5;

const QUERY_PROFILE: OperationTransportProfile = {
  preferences: ['wire', 'grpc', 'http'],
};

const BATCH_PROFILE: OperationTransportProfile = {
  preferences: ['wire', 'grpc', 'http'],
  emulated: ['wire', 'http'],
};

const CONTROL_PROFILE: OperationTransportProfile = {
  preferences: ['grpc', 'http'],
  supported: { wire: false },
};

const ROW_SCAN_PROFILE: OperationTransportProfile = {
  preferences: ['grpc', 'http'],
  supported: { wire: false },
};

const ROW_BULK_PROFILE: OperationTransportProfile = {
  preferences: ['wire', 'grpc', 'http'],
};

const ROW_MUTATION_PROFILE: OperationTransportProfile = {
  preferences: ['grpc', 'http'],
  supported: { wire: false },
};

const ENTITY_MUTATION_PROFILE: OperationTransportProfile = {
  preferences: ['grpc', 'http'],
  supported: { wire: false },
};

const VECTOR_SEARCH_PROFILE: OperationTransportProfile = {
  preferences: ['grpc', 'http'],
  supported: { wire: false },
};

const KV_HTTP_PROFILE: OperationTransportProfile = {
  preferences: ['http'],
  supported: { grpc: false, wire: false },
};

const KV_LIST_PROFILE: OperationTransportProfile = {
  preferences: ['http', 'grpc', 'wire'],
};

function buildGrpcDefinition(service: typeof protoService): grpc.ServiceDefinition {
  const definition: Record<string, grpc.MethodDefinition<unknown, unknown>> = {};

  for (const method of service.methodsArray) {
    definition[method.name] = {
      path: `/${service.fullName.replace(/^\./, '')}/${method.name}`,
      requestStream: false,
      responseStream: false,
      requestSerialize: (value: unknown) =>
        Buffer.from(method.resolvedRequestType.encode(method.resolvedRequestType.fromObject(value)).finish()),
      requestDeserialize: (value: Buffer) =>
        method.resolvedRequestType.toObject(method.resolvedRequestType.decode(value), PROTO_OBJECT_OPTIONS),
      responseSerialize: (value: unknown) =>
        Buffer.from(method.resolvedResponseType.encode(method.resolvedResponseType.fromObject(value)).finish()),
      responseDeserialize: (value: Buffer) =>
        method.resolvedResponseType.toObject(method.resolvedResponseType.decode(value), PROTO_OBJECT_OPTIONS),
    };
  }

  return definition as grpc.ServiceDefinition;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBufferLike(value: unknown): value is Buffer | Uint8Array {
  return Buffer.isBuffer(value) || value instanceof Uint8Array;
}

function parseWireAddress(address: string): WireEndpoint {
  if (!address || !address.trim()) {
    throw new ConfigurationError('wireAddress must be a non-empty host:port string', {
      configKey: 'wireAddress',
    });
  }

  const trimmed = address.trim();
  if (trimmed.includes('://')) {
    const url = new URL(trimmed);
    const port = Number(url.port);
    if (!url.hostname || !Number.isInteger(port) || port <= 0) {
      throw new ConfigurationError(`Invalid wireAddress: ${address}`, {
        configKey: 'wireAddress',
      });
    }
    return { host: url.hostname, port };
  }

  const ipv6 = trimmed.match(/^\[([^\]]+)\]:(\d+)$/);
  if (ipv6) {
    return {
      host: ipv6[1]!,
      port: Number(ipv6[2]!),
    };
  }

  const separator = trimmed.lastIndexOf(':');
  if (separator <= 0 || separator === trimmed.length - 1) {
    throw new ConfigurationError(`Invalid wireAddress: ${address}`, {
      configKey: 'wireAddress',
    });
  }

  const host = trimmed.slice(0, separator);
  const port = Number(trimmed.slice(separator + 1));
  if (!host || !Number.isInteger(port) || port <= 0) {
    throw new ConfigurationError(`Invalid wireAddress: ${address}`, {
      configKey: 'wireAddress',
    });
  }

  return { host, port };
}

function parseGrpcAddress(address: string): GrpcTarget {
  if (!address || !address.trim()) {
    throw new ConfigurationError('grpcAddress must be a non-empty target string', {
      configKey: 'grpcAddress',
    });
  }

  const trimmed = address.trim();
  if (trimmed.includes('://')) {
    const url = new URL(trimmed);
    const secure = url.protocol === 'grpcs:' || url.protocol === 'https:';
    const port = Number(url.port || (secure ? 443 : 50051));
    if (!url.hostname || !Number.isInteger(port) || port <= 0) {
      throw new ConfigurationError(`Invalid grpcAddress: ${address}`, {
        configKey: 'grpcAddress',
      });
    }
    return {
      target: `${url.hostname}:${port}`,
      secure,
    };
  }

  return {
    target: trimmed,
    secure: false,
  };
}

function escapeSqlIdentifier(value: string): string {
  if (!value || !value.trim()) {
    throw new ValidationError('SQL identifier cannot be empty', {
      field: 'identifier',
      value,
    });
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function escapeSqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function toSafeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function toPositiveInteger(value: unknown, field: string, minimum = 0): number {
  const parsed = toSafeNumber(value);
  if (parsed === undefined || !Number.isInteger(parsed) || parsed < minimum) {
    throw new ValidationError(`${field} must be an integer >= ${minimum}`, {
      field,
      value,
    });
  }
  return parsed;
}

function parseJsonText(text: string, context: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ParseError(
      `Failed to parse RedDB ${context}: ${error instanceof Error ? error.message : String(error)}`,
      { format: 'json' }
    );
  }
}

function parseMaybeJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return text;
  }
}

function stringifyJson(value: unknown, context: string): string {
  try {
    return JSON.stringify(value);
  } catch (error) {
    throw new ValidationError(
      `Failed to serialize ${context} as JSON: ${error instanceof Error ? error.message : String(error)}`,
      { field: context, value }
    );
  }
}

function ensureNonEmptyString(value: string, field: string, message?: string): string {
  if (!value || !value.trim()) {
    throw new ValidationError(message || `${field} must be a non-empty string`, {
      field,
      value,
    });
  }
  return value;
}

function buildQueryStats(data: unknown): Pick<RedDbOperationMetrics, 'recordCount' | 'affectedRows' | 'rowsScanned' | 'execTimeUs'> {
  if (!isPlainObject(data)) {
    return {};
  }

  const queryData = data as RedDbQueryData;
  const stats = isPlainObject(queryData.result?.stats) ? queryData.result?.stats : undefined;
  return {
    recordCount: typeof queryData.record_count === 'number' ? queryData.record_count : undefined,
    affectedRows: typeof queryData.affected_rows === 'number' ? queryData.affected_rows : undefined,
    rowsScanned: typeof stats?.rows_scanned === 'number' ? stats.rows_scanned : undefined,
    execTimeUs: typeof stats?.exec_time_us === 'number' ? stats.exec_time_us : undefined,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const safeConcurrency = Math.max(1, Math.min(concurrency || 1, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function run(): Promise<void> {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) {
        return;
      }
      results[current] = await worker(items[current]!, current);
    }
  }

  await Promise.all(Array.from({ length: safeConcurrency }, () => run()));
  return results;
}

function normalizeQueryData(data: unknown): RedDbQueryData {
  if (!isPlainObject(data)) {
    return {};
  }

  const normalized: RedDbQueryData = { ...data };
  normalized.record_count = toSafeNumber(data.record_count);
  normalized.affected_rows = toSafeNumber(data.affected_rows);

  const resultJson = typeof data.result_json === 'string' ? parseMaybeJson(data.result_json) : undefined;
  const sourceResult = isPlainObject(data.result) ? { ...data.result } : undefined;
  const jsonResult = isPlainObject(resultJson) ? { ...resultJson } : undefined;

  if (sourceResult || jsonResult || Array.isArray(data.columns)) {
    normalized.result = {
      ...(jsonResult || {}),
      ...(sourceResult || {}),
    };
  }

  if (normalized.result && Array.isArray(data.columns)) {
    normalized.result.columns = data.columns.map((value) => String(value));
  }

  if (isPlainObject(normalized.result?.stats)) {
    normalized.result.stats = {
      ...normalized.result.stats,
      rows_scanned: toSafeNumber(normalized.result.stats.rows_scanned),
      exec_time_us: toSafeNumber(normalized.result.stats.exec_time_us),
      nodes_scanned: toSafeNumber(normalized.result.stats.nodes_scanned),
      edges_scanned: toSafeNumber(normalized.result.stats.edges_scanned),
    };
  }

  return normalized;
}

function normalizeBatchQueryData(data: unknown): RedDbBatchQueryData {
  if (!isPlainObject(data) || !Array.isArray(data.results)) {
    return { results: [] };
  }

  return {
    ...data,
    results: data.results.map((item) => normalizeQueryData(item)),
  };
}

function normalizeScanData(data: unknown): RedDbScanData {
  if (!isPlainObject(data)) {
    return {
      collection: '',
      total: 0,
      next_offset: null,
      items: [],
    };
  }

  return {
    ...data,
    collection: typeof data.collection === 'string' ? data.collection : '',
    total: toSafeNumber(data.total) ?? 0,
    next_offset: toSafeNumber(data.next_offset) ?? null,
    items: Array.isArray(data.items)
      ? data.items.map((item) => ({
          ...(isPlainObject(item) ? item : {}),
          id: toSafeNumber(isPlainObject(item) ? item.id : undefined) ?? 0,
          kind: isPlainObject(item) && typeof item.kind === 'string' ? item.kind : '',
          collection: isPlainObject(item) && typeof item.collection === 'string' ? item.collection : '',
          json: isPlainObject(item) && typeof item.json === 'string' ? item.json : '',
        }))
      : [],
  };
}

function normalizeEntityData(data: unknown): RedDbEntityData {
  if (!isPlainObject(data)) {
    return {};
  }

  const entity = typeof data.entity_json === 'string'
    ? parseMaybeJson(data.entity_json)
    : data.entity;

  return {
    ...data,
    id: toSafeNumber(data.id),
    entity,
    entity_json: typeof data.entity_json === 'string' ? data.entity_json : undefined,
  };
}

function normalizeBulkEntityData(data: unknown): RedDbBulkEntityData {
  if (!isPlainObject(data)) {
    return {};
  }

  return {
    ...data,
    count: toSafeNumber(data.count),
    first_id: toSafeNumber(data.first_id),
    items: Array.isArray(data.items) ? data.items.map((item) => normalizeEntityData(item)) : undefined,
  };
}

function normalizeBulkInsertData(data: unknown): RedDbBulkInsertData {
  if (!isPlainObject(data)) {
    return {};
  }

  return {
    ...data,
    count: toSafeNumber(data.count),
    first_id: toSafeNumber(data.first_id),
  };
}

function normalizeCollectionsData(data: unknown): RedDbCollectionsData {
  if (Array.isArray(data)) {
    return { collections: data.map((value) => String(value)) };
  }
  if (!isPlainObject(data)) {
    return { collections: [] };
  }
  return {
    ...data,
    collections: Array.isArray(data.collections) ? data.collections.map((value) => String(value)) : [],
  };
}

function normalizeHealthData(data: unknown): RedDbHealthData {
  if (!isPlainObject(data)) {
    return {};
  }

  return {
    ...data,
    checked_at_unix_ms: toSafeNumber(data.checked_at_unix_ms),
  };
}

function normalizeStatsData(data: unknown): RedDbStatsData {
  if (!isPlainObject(data)) {
    return {};
  }

  return {
    ...data,
    collection_count: toSafeNumber(data.collection_count),
    total_entities: toSafeNumber(data.total_entities),
    total_memory_bytes: toSafeNumber(data.total_memory_bytes),
    cross_ref_count: toSafeNumber(data.cross_ref_count),
    active_connections: toSafeNumber(data.active_connections),
    idle_connections: toSafeNumber(data.idle_connections),
    total_checkouts: toSafeNumber(data.total_checkouts),
    started_at_unix_ms: toSafeNumber(data.started_at_unix_ms),
  };
}

function normalizePayloadValue(data: unknown): Record<string, unknown> {
  if (!isPlainObject(data)) {
    return { payload: data };
  }

  const ok = typeof data.ok === 'boolean' ? data.ok : undefined;
  const payload = typeof data.payload === 'string' ? parseMaybeJson(data.payload) : data.payload;

  if (isPlainObject(payload)) {
    return ok === undefined || Object.prototype.hasOwnProperty.call(payload, 'ok')
      ? payload
      : { ok, ...payload };
  }

  if (Array.isArray(payload)) {
    return {
      ok,
      items: payload,
    };
  }

  if (payload !== undefined) {
    return {
      ok,
      payload,
    };
  }

  return { ...data };
}

function normalizeOperationData(data: unknown, extras: Record<string, unknown> = {}): Record<string, unknown> {
  const base = isPlainObject(data) ? { ...data } : {};
  for (const [key, value] of Object.entries(extras)) {
    if (!Object.prototype.hasOwnProperty.call(base, key)) {
      base[key] = value;
    }
  }
  return base;
}

class RedDbWireSocket {
  private readonly endpoint: WireEndpoint;
  private readonly tlsOptions: RedDbWireTlsOptions;
  private readonly timeout: number;
  private readonly connectTimeout: number;
  private readonly keepAlive: boolean;
  private readonly keepAliveInitialDelayMs: number;
  private socket: Socket | TLSSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private pending: PendingWireRequest[] = [];
  private buffer = Buffer.alloc(0);

  constructor(
    address: string,
    tlsOptions: boolean | RedDbWireTlsOptions | undefined,
    timeout: number,
    connectTimeout: number,
    keepAlive: boolean,
    keepAliveInitialDelayMs: number
  ) {
    this.endpoint = parseWireAddress(address);
    this.timeout = timeout;
    this.connectTimeout = connectTimeout;
    this.keepAlive = keepAlive;
    this.keepAliveInitialDelayMs = keepAliveInitialDelayMs;
    this.tlsOptions = typeof tlsOptions === 'boolean'
      ? { enabled: tlsOptions }
      : { enabled: tlsOptions?.enabled ?? false, ...tlsOptions };
  }

  async query(sql: string, timeout?: number): Promise<unknown> {
    const response = await this.send(WIRE_MSG_QUERY, Buffer.from(sql, 'utf8'), timeout);
    if (response.type !== WIRE_MSG_RESULT) {
      throw new ProtocolError(`Unexpected wire response type: ${response.type}`, {
        protocol: 'reddb',
        code: response.type,
        phase: 'query',
      });
    }

    return parseJsonText(response.payload.toString('utf8'), 'wire query payload');
  }

  async bulkInsert(collection: string, payloads: string[], timeout?: number): Promise<number> {
    const collectionBuffer = Buffer.from(collection, 'utf8');
    const header = Buffer.alloc(2 + collectionBuffer.length + 4);
    header.writeUInt16LE(collectionBuffer.length, 0);
    collectionBuffer.copy(header, 2);
    header.writeUInt32LE(payloads.length, 2 + collectionBuffer.length);

    const parts: Buffer[] = [header];
    for (const payload of payloads) {
      const jsonBuffer = Buffer.from(payload, 'utf8');
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32LE(jsonBuffer.length, 0);
      parts.push(lengthBuffer, jsonBuffer);
    }

    const response = await this.send(WIRE_MSG_BULK_INSERT, Buffer.concat(parts), timeout);
    return decodeBulkOkResponse(response, 'bulkInsert');
  }

  async bulkInsertBinary(
    collection: string,
    fieldNames: string[],
    rows: RedDbBinaryValue[][],
    timeout?: number
  ): Promise<number> {
    const collectionBuffer = Buffer.from(collection, 'utf8');
    const header = Buffer.alloc(2 + collectionBuffer.length + 2);
    header.writeUInt16LE(collectionBuffer.length, 0);
    collectionBuffer.copy(header, 2);
    header.writeUInt16LE(fieldNames.length, 2 + collectionBuffer.length);

    const parts: Buffer[] = [header];

    for (const fieldName of fieldNames) {
      const nameBuffer = Buffer.from(fieldName, 'utf8');
      const nameHeader = Buffer.alloc(2);
      nameHeader.writeUInt16LE(nameBuffer.length, 0);
      parts.push(nameHeader, nameBuffer);
    }

    const rowHeader = Buffer.alloc(4);
    rowHeader.writeUInt32LE(rows.length, 0);
    parts.push(rowHeader);

    for (const row of rows) {
      if (row.length !== fieldNames.length) {
        throw new ValidationError(
          `bulkInsertBinary row length ${row.length} does not match fieldNames length ${fieldNames.length}`,
          { field: 'rows', value: row }
        );
      }

      for (const value of row) {
        parts.push(encodeWireBinaryValue(value));
      }
    }

    const response = await this.send(WIRE_MSG_BULK_INSERT_BINARY, Buffer.concat(parts), timeout);
    return decodeBulkOkResponse(response, 'bulkInsertBinary');
  }

  async close(): Promise<void> {
    this.destroy();
  }

  private async connect(): Promise<void> {
    if (this.socket && !this.socket.destroyed) {
      return;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    const connectPromise = new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        cleanup();
        this.destroy(error);
        reject(new ConnectionError(error.message, {
          host: this.endpoint.host,
          port: this.endpoint.port,
          code: (error as NodeJS.ErrnoException).code,
        }));
      };

      const onConnect = () => {
        cleanup();
        if (!socket.destroyed) {
          socket.setNoDelay(true);
          socket.setKeepAlive(this.keepAlive, this.keepAliveInitialDelayMs);
        }
        this.socket = socket;
        socket.on('data', (chunk: Buffer) => this.onData(chunk));
        socket.on('error', (error) => this.destroy(error instanceof Error ? error : new Error(String(error))));
        socket.on('close', () => this.destroy());
        resolve();
      };

      const cleanup = () => {
        socket.removeListener('error', onError);
        socket.removeListener('connect', onConnect);
      };

      const socket = this.tlsOptions.enabled
        ? connectTls({
            host: this.endpoint.host,
            port: this.endpoint.port,
            rejectUnauthorized: this.tlsOptions.rejectUnauthorized ?? true,
            ca: this.tlsOptions.ca,
            servername: this.tlsOptions.servername || this.endpoint.host,
          }, onConnect)
        : connectTcp({
            host: this.endpoint.host,
            port: this.endpoint.port,
          }, onConnect);

      socket.setTimeout(this.connectTimeout, () => {
        onError(new Error(`RedDB wire connection to ${this.endpoint.host}:${this.endpoint.port} timed out`));
      });
      socket.once('error', onError);
    }).finally(() => {
      this.connectPromise = null;
    });

    this.connectPromise = connectPromise;
    return connectPromise;
  }

  private async send(messageType: number, payload: Buffer, timeout?: number): Promise<{ type: number; payload: Buffer }> {
    await this.connect();

    if (!this.socket || this.socket.destroyed) {
      throw new ConnectionError('RedDB wire socket is not connected', {
        host: this.endpoint.host,
        port: this.endpoint.port,
      });
    }

    return new Promise((resolve, reject) => {
      const frameLength = 1 + payload.length;
      const header = Buffer.alloc(5);
      header.writeUInt32LE(frameLength, 0);
      header[4] = messageType;

      const pending: PendingWireRequest = {
        resolve: (value) => {
          if (pending.timer) {
            clearTimeout(pending.timer);
          }
          resolve(value);
        },
        reject: (error) => {
          if (pending.timer) {
            clearTimeout(pending.timer);
          }
          reject(error);
        },
      };

      const timeoutMs = timeout ?? this.timeout;
      if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
        pending.timer = setTimeout(() => {
          const error = new ProtocolError(`RedDB wire request timed out after ${timeoutMs}ms`, {
            protocol: 'reddb',
            phase: 'wire-timeout',
            retriable: true,
          });
          this.destroy(error);
        }, timeoutMs);
      }

      this.pending.push(pending);
      this.socket!.write(header);
      this.socket!.write(payload);
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.tryResolvePending();
  }

  private tryResolvePending(): void {
    while (this.buffer.length >= 5 && this.pending.length > 0) {
      const totalLength = this.buffer.readUInt32LE(0);
      const frameSize = 4 + totalLength;
      if (this.buffer.length < frameSize) {
        return;
      }

      const type = this.buffer[4]!;
      const payload = this.buffer.slice(5, frameSize);
      this.buffer = this.buffer.slice(frameSize);

      const current = this.pending.shift();
      if (!current) {
        return;
      }

      if (type === WIRE_MSG_ERROR) {
        current.reject(new ProtocolError(payload.toString('utf8'), {
          protocol: 'reddb',
          code: type,
          phase: 'wire-response',
        }));
      } else {
        current.resolve({ type, payload });
      }
    }
  }

  private destroy(error?: Error): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    this.buffer = Buffer.alloc(0);
    const pending = this.pending.splice(0);
    for (const request of pending) {
      request.reject(error || new ConnectionError('RedDB wire socket closed', {
        host: this.endpoint.host,
        port: this.endpoint.port,
      }));
    }
  }
}

class RedDbWirePool implements RedDbWireTransport {
  private readonly clients: RedDbWireSocket[];
  private nextIndex = 0;

  constructor(clients: RedDbWireSocket[]) {
    if (clients.length === 0) {
      throw new ConfigurationError('wire pool requires at least one client', {
        configKey: 'wirePoolSize',
      });
    }
    this.clients = clients;
  }

  async query(sql: string, timeout?: number): Promise<unknown> {
    return await this.select().query(sql, timeout);
  }

  async bulkInsert(collection: string, payloads: string[], timeout?: number): Promise<number> {
    return await this.select().bulkInsert(collection, payloads, timeout);
  }

  async bulkInsertBinary(
    collection: string,
    fieldNames: string[],
    rows: RedDbBinaryValue[][],
    timeout?: number
  ): Promise<number> {
    return await this.select().bulkInsertBinary(collection, fieldNames, rows, timeout);
  }

  async close(): Promise<void> {
    await Promise.all(this.clients.map((client) => client.close()));
  }

  private select(): RedDbWireSocket {
    const client = this.clients[this.nextIndex % this.clients.length]!;
    this.nextIndex += 1;
    return client;
  }
}

function decodeBulkOkResponse(response: { type: number; payload: Buffer }, phase: string): number {
  if (response.type !== WIRE_MSG_BULK_OK) {
    throw new ProtocolError(`Unexpected wire bulk response type: ${response.type}`, {
      protocol: 'reddb',
      code: response.type,
      phase,
    });
  }

  if (response.payload.length >= 8) {
    return Number(response.payload.readBigUInt64LE(0));
  }
  return 0;
}

function encodeWireBinaryValue(value: RedDbBinaryValue): Buffer {
  if (value === null) {
    return Buffer.from([WIRE_VAL_NULL]);
  }

  if (typeof value === 'string') {
    const text = Buffer.from(value, 'utf8');
    const buffer = Buffer.alloc(1 + 4 + text.length);
    buffer[0] = WIRE_VAL_TEXT;
    buffer.writeUInt32LE(text.length, 1);
    text.copy(buffer, 5);
    return buffer;
  }

  if (typeof value === 'boolean') {
    return Buffer.from([WIRE_VAL_BOOL, value ? 1 : 0]);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ValidationError('bulkInsertBinary number values must be finite', {
        field: 'rows',
        value,
      });
    }
    if (Number.isInteger(value)) {
      const buffer = Buffer.alloc(1 + 8);
      buffer[0] = WIRE_VAL_I64;
      buffer.writeBigInt64LE(BigInt(value), 1);
      return buffer;
    }
    const buffer = Buffer.alloc(1 + 8);
    buffer[0] = WIRE_VAL_F64;
    buffer.writeDoubleLE(value, 1);
    return buffer;
  }

  if (typeof value === 'bigint') {
    const maxU64 = (1n << 64n) - 1n;
    const minI64 = -(1n << 63n);
    const maxI64 = (1n << 63n) - 1n;

    if (value >= 0 && value <= maxU64) {
      const buffer = Buffer.alloc(1 + 8);
      buffer[0] = WIRE_VAL_U64;
      buffer.writeBigUInt64LE(value, 1);
      return buffer;
    }
    if (value >= minI64 && value <= maxI64) {
      const buffer = Buffer.alloc(1 + 8);
      buffer[0] = WIRE_VAL_I64;
      buffer.writeBigInt64LE(value, 1);
      return buffer;
    }
    throw new ValidationError('bulkInsertBinary bigint values must fit within 64 bits', {
      field: 'rows',
      value: value.toString(),
    });
  }

  if (isBufferLike(value)) {
    throw new UnsupportedError(
      'RedDB wire bulkInsertBinary does not support byte values; use the gRPC transport for blob payloads',
      { feature: 'reddb.wire.bulkInsertBinary.bytes' }
    );
  }

  throw new ValidationError('Unsupported bulkInsertBinary value type', {
    field: 'rows',
    value,
  });
}

class RedDbGrpcClient {
  private readonly client: grpc.Client;
  private readonly timeout: number;
  private readonly metadataEntries: Array<[string, string]>;

  constructor(
    address: string,
    tlsOptions: boolean | RedDbGrpcTlsOptions | undefined,
    timeout: number,
    metadataEntries: Array<[string, string]>,
    keepalive: RedDbGrpcKeepaliveOptions | undefined,
    channelOptions: Record<string, string | number> | undefined
  ) {
    const parsed = parseGrpcAddress(address);
    const resolvedTls = typeof tlsOptions === 'boolean'
      ? { enabled: tlsOptions }
      : { enabled: tlsOptions?.enabled ?? parsed.secure, ...tlsOptions };

    const rootCerts = typeof resolvedTls.ca === 'string' ? Buffer.from(resolvedTls.ca) : (resolvedTls.ca ?? null);
    const credentials = resolvedTls.enabled
      ? grpc.credentials.createSsl(rootCerts, null, null, {
          rejectUnauthorized: resolvedTls.rejectUnauthorized ?? true,
        })
      : grpc.credentials.createInsecure();

    const keepaliveOptions: grpc.ChannelOptions = {
      'grpc.keepalive_time_ms': keepalive?.timeMs ?? 30000,
      'grpc.keepalive_timeout_ms': keepalive?.timeoutMs ?? 10000,
      'grpc.keepalive_permit_without_calls': keepalive?.permitWithoutCalls === false ? 0 : 1,
      'grpc.http2.max_pings_without_data': keepalive?.maxPingsWithoutData ?? 0,
      'grpc.initial_reconnect_backoff_ms': keepalive?.initialReconnectBackoffMs ?? 250,
      'grpc.max_reconnect_backoff_ms': keepalive?.maxReconnectBackoffMs ?? 5000,
    };
    const options: grpc.ChannelOptions = {
      ...keepaliveOptions,
      ...(channelOptions || {}),
    };
    if (resolvedTls.servername) {
      options['grpc.ssl_target_name_override'] = resolvedTls.servername;
      options['grpc.default_authority'] = resolvedTls.servername;
    }

    this.client = new GrpcRedDbClient(parsed.target, credentials, options);
    this.timeout = timeout;
    this.metadataEntries = metadataEntries;
  }

  async unary(methodName: string, request: Record<string, unknown>, options: RedDbTransportRequest): Promise<unknown> {
    if (options.signal?.aborted) {
      throw new AbortError();
    }

    return await new Promise((resolve, reject) => {
      const metadata = new grpc.Metadata();
      for (const [key, value] of this.metadataEntries) {
        metadata.set(key, value);
      }

      let completed = false;
      const cleanup = () => {
        if (options.signal && onAbort) {
          options.signal.removeEventListener('abort', onAbort);
        }
      };

      const callback: grpc.requestCallback<unknown> = (error, response) => {
        if (completed) {
          return;
        }
        completed = true;
        cleanup();
        if (error) {
          reject(mapGrpcError(methodName, error, options.signal?.aborted ?? false));
          return;
        }
        resolve(response);
      };

      const deadlineMs = options.timeout ?? this.timeout;
      const callOptions = deadlineMs > 0 && Number.isFinite(deadlineMs)
        ? { deadline: new Date(Date.now() + deadlineMs) }
        : {};

      const method = (this.client as unknown as Record<string, (...args: any[]) => grpc.ClientUnaryCall>)[methodName];
      const call = method.call(
        this.client,
        request,
        metadata,
        callOptions,
        callback
      ) as grpc.ClientUnaryCall;

      const onAbort = options.signal
        ? () => {
            if (completed) {
              return;
            }
            call.cancel();
          }
        : null;

      if (options.signal && onAbort) {
        options.signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  close(): void {
    this.client.close();
  }
}

function mapGrpcError(methodName: string, error: grpc.ServiceError, aborted: boolean): Error {
  if (aborted || error.code === grpc.status.CANCELLED) {
    return new AbortError(`RedDB gRPC ${methodName} was aborted`);
  }

  if (error.code === grpc.status.UNAUTHENTICATED) {
    return new AuthenticationError(`RedDB gRPC ${methodName} unauthorized: ${error.message}`, {
      authType: 'bearer',
    });
  }

  if (error.code === grpc.status.NOT_FOUND) {
    return new NotFoundError(`RedDB gRPC ${methodName} not found: ${error.message}`, {
      resource: methodName,
    });
  }

  if (error.code === grpc.status.DEADLINE_EXCEEDED || error.code === grpc.status.UNAVAILABLE) {
    return new ConnectionError(`RedDB gRPC ${methodName} failed: ${error.message}`, {
      code: String(error.code),
    });
  }

  return new ProtocolError(`RedDB gRPC ${methodName} failed: ${error.message}`, {
    protocol: 'reddb',
    code: error.code,
    phase: 'grpc',
    retriable: error.code === grpc.status.RESOURCE_EXHAUSTED || error.code === grpc.status.INTERNAL,
  });
}

/**
 * RedDB client with transport-aware execution over HTTP, gRPC, and the
 * native wire protocol.
 */
export class RedDbClient {
  private readonly baseUrl?: string;
  private readonly httpClient: ReckerClient | null;
  private readonly grpcClient: RedDbGrpcClient | null;
  private readonly wireClient: RedDbWireTransport | null;
  private readonly defaultTransport: RedDbTransportMode;
  private readonly allowTransportFallback: boolean;
  private readonly timeout: number;
  private readonly batchConcurrency: number;
  private readonly operationTimeouts: RedDbOperationTimeouts;

  readonly system: RedDbSystemNamespace = {
    health: (options = {}) => this.executeSystemHealth('system.health', 'Health', '/health', options),
    ready: (options = {}) => this.executeSystemHealth('system.ready', 'Ready', '/ready', options),
    stats: (options = {}) => this.executeSystemStats(options),
  };

  readonly sql: RedDbSqlNamespace = {
    query: (query, options = {}) => this.executeSqlQuery('sql.query', query, options),
    explain: (query, options = {}) => this.executeSqlExplain(query, options),
    batch: (queries, options = {}) => this.executeSqlBatch(queries, options),
  };

  readonly collections: RedDbCollectionsNamespace = {
    list: (options = {}) => this.executeCollectionsList(options),
    create: (options) => this.executeCollectionCreate(options),
    describe: (options) => this.executeCollectionDescribe(options),
    drop: (options) => this.executeCollectionDrop(options),
  };

  readonly indexes: RedDbIndexesNamespace = {
    list: (options = {}) => this.executeIndexesList(options),
    statuses: (options = {}) => this.executeIndexesStatuses(options),
    create: (options) => this.executeIndexCreate(options),
    enable: (options) => this.executeIndexToggle('indexes.enable', 'enable', true, options),
    disable: (options) => this.executeIndexToggle('indexes.disable', 'disable', false, options),
    warmup: (options) => this.executeIndexWarmup(options),
    rebuild: (options = {}) => this.executeIndexesRebuild(options),
  };

  readonly rows: RedDbRowsNamespace = {
    scan: (request) => this.executeRowsScan(request),
    create: (request) => this.executeRowCreate(request),
    bulkCreate: (request) => this.executeRowsBulkCreate(request),
    patch: (request) => this.executeRowPatch(request),
    delete: (request) => this.executeRowDelete(request),
  };

  readonly documents: RedDbDocumentsNamespace = {
    create: (request) => this.executeEntityCreate('documents.create', 'CreateDocument', 'documents', request),
    bulkCreate: (request) =>
      this.executeBulkEntityCreate('documents.bulkCreate', 'BulkCreateDocuments', 'bulk/documents', request),
  };

  readonly nodes: RedDbNodesNamespace = {
    create: (request) => this.executeEntityCreate('nodes.create', 'CreateNode', 'nodes', request),
    bulkCreate: (request) => this.executeBulkEntityCreate('nodes.bulkCreate', 'BulkCreateNodes', 'bulk/nodes', request),
  };

  readonly edges: RedDbEdgesNamespace = {
    create: (request) => this.executeEntityCreate('edges.create', 'CreateEdge', 'edges', request),
    bulkCreate: (request) => this.executeBulkEntityCreate('edges.bulkCreate', 'BulkCreateEdges', 'bulk/edges', request),
  };

  readonly vectors: RedDbVectorsNamespace = {
    create: (request) => this.executeEntityCreate('vectors.create', 'CreateVector', 'vectors', request),
    bulkCreate: (request) =>
      this.executeBulkEntityCreate('vectors.bulkCreate', 'BulkCreateVectors', 'bulk/vectors', request),
    bulkInsertBinary: (request) => this.executeVectorBulkInsertBinary(request),
    similar: (request) => this.executeVectorSearch('vectors.similar', 'Similar', 'similar', request),
    ivfSearch: (request) => this.executeVectorSearch('vectors.ivfSearch', 'IvfSearch', 'ivf/search', request),
  };

  readonly kv: RedDbKvNamespace = {
    get: (request) => this.executeKvGet(request),
    put: (request) => this.executeKvPut(request),
    delete: (request) => this.executeKvDelete(request),
    list: (request) => this.executeKvList(request),
  };

  constructor(options: RedDbClientOptions = {}) {
    this.baseUrl = options.baseUrl;
    this.defaultTransport = options.transport ?? 'auto';
    this.allowTransportFallback = options.allowTransportFallback ?? true;
    this.timeout = options.timeout ?? 30000;
    this.batchConcurrency = Math.max(1, options.batchConcurrency ?? 8);
    this.operationTimeouts = { ...(options.operationTimeouts || {}) };

    const headers: Record<string, string> = { ...(options.headers || {}) };
    if (options.authToken) {
      headers.authorization = `Bearer ${options.authToken}`;
    }
    if (options.writeToken) {
      headers['x-write-token'] = options.writeToken;
    }

    if (options.client) {
      this.httpClient = options.client;
    } else if (this.baseUrl) {
      this.httpClient = createClient({
        baseUrl: this.baseUrl,
        headers,
        timeout: this.timeout,
        http2: options.http2 ?? true,
        ...(options.httpClientOptions || {}),
      });
    } else {
      this.httpClient = null;
    }

    this.grpcClient = options.grpcAddress
      ? new RedDbGrpcClient(
          options.grpcAddress,
          options.grpcTls,
          this.timeout,
          Object.entries(headers),
          options.grpcKeepalive,
          options.grpcOptions
        )
      : null;

    if (options.wireAddress) {
      const wirePoolSize = Math.max(1, options.wirePoolSize ?? 1);
      const wireConnectTimeout = options.wireConnectTimeout ?? this.timeout;
      const wireKeepAlive = options.wireKeepAlive ?? true;
      const wireKeepAliveInitialDelayMs = options.wireKeepAliveInitialDelayMs ?? 30000;

      const clients = Array.from({ length: wirePoolSize }, () =>
        new RedDbWireSocket(
          options.wireAddress!,
          options.wireTls,
          this.timeout,
          wireConnectTimeout,
          wireKeepAlive,
          wireKeepAliveInitialDelayMs
        )
      );

      this.wireClient = wirePoolSize === 1
        ? clients[0]!
        : new RedDbWirePool(clients);
    } else {
      this.wireClient = null;
    }
  }

  getCapabilities(): RedDbCapabilities {
    const hasHttp = this.httpClient !== null;
    const hasGrpc = this.grpcClient !== null;
    const hasWire = this.wireClient !== null;

    return {
      requestedTransport: this.defaultTransport,
      allowTransportFallback: this.allowTransportFallback,
      availableTransports: {
        http: hasHttp,
        grpc: hasGrpc,
        wire: hasWire,
      },
      namespaces: {
        system: hasHttp || hasGrpc,
        sql: hasHttp || hasGrpc || hasWire,
        collections: hasHttp || hasGrpc,
        indexes: hasHttp || hasGrpc || hasWire,
        rows: hasHttp || hasGrpc || hasWire,
        documents: hasHttp || hasGrpc,
        nodes: hasHttp || hasGrpc,
        edges: hasHttp || hasGrpc,
        vectors: hasHttp || hasGrpc || hasWire,
        kv: hasHttp || hasGrpc || hasWire,
      },
      features: {
        grpcNative: hasGrpc,
        wireSql: hasWire,
        wireBulkRows: hasWire,
        wireBinaryBulkScalars: hasWire,
        httpBinaryBulkEmulation: hasHttp,
        sqlBatchEmulationOverHttp: hasHttp,
        sqlBatchEmulationOverWire: hasWire,
        kvListViaSql: hasHttp || hasGrpc || hasWire,
      },
    };
  }

  async close(): Promise<void> {
    if (this.grpcClient) {
      this.grpcClient.close();
    }
    if (this.wireClient) {
      await this.wireClient.close();
    }
  }

  private async executeSystemHealth(
    operation: string,
    grpcMethod: string,
    httpPath: string,
    options: RedDbTransportRequest
  ): Promise<RedDbOperationEnvelope<RedDbHealthData>> {
    const requestOptions = this.withResolvedTimeout(operation, options);
    const resolution = this.resolveTransport(operation, CONTROL_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    const data = resolution.transport === 'grpc'
      ? normalizeHealthData(await this.runGrpc(grpcMethod, {}, requestOptions))
      : normalizeHealthData(await this.runHttpGet<Record<string, unknown>>(httpPath, requestOptions));

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeSystemStats(options: RedDbTransportRequest): Promise<RedDbOperationEnvelope<RedDbStatsData>> {
    const operation = 'system.stats';
    const requestOptions = this.withResolvedTimeout(operation, options);
    const resolution = this.resolveTransport(operation, CONTROL_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    const data = resolution.transport === 'grpc'
      ? normalizeStatsData(await this.runGrpc('Stats', {}, requestOptions))
      : normalizeStatsData(await this.runHttpGet<Record<string, unknown>>('/stats', requestOptions));

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeSqlQuery(
    operation: string,
    query: string,
    options: RedDbQueryOptions
  ): Promise<RedDbOperationEnvelope<RedDbQueryData>> {
    ensureNonEmptyString(query, 'query', 'Query must be a non-empty string');

    const requestOptions = this.withResolvedTimeout(operation, options);
    const resolution = this.resolveTransport(operation, QUERY_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    const data = resolution.transport === 'wire'
      ? normalizeQueryData(await this.runWireQuery(query, requestOptions))
      : resolution.transport === 'grpc'
        ? normalizeQueryData(await this.runGrpc('Query', {
            query,
            entity_types: requestOptions.entityTypes ?? [],
            capabilities: requestOptions.capabilities ?? [],
          }, requestOptions))
        : normalizeQueryData(await this.runHttpPost<RedDbQueryData>('/query', {
            query,
            entity_types: requestOptions.entityTypes,
            capabilities: requestOptions.capabilities,
          }, requestOptions));

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeSqlExplain(
    query: string,
    options: RedDbQueryOptions
  ): Promise<RedDbOperationEnvelope<Record<string, unknown>>> {
    ensureNonEmptyString(query, 'query', 'Query must be a non-empty string');

    const operation = 'sql.explain';
    const requestOptions = this.withResolvedTimeout(operation, options);
    const resolution = this.resolveTransport(operation, QUERY_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    const data = resolution.transport === 'wire'
      ? normalizePayloadValue(await this.runWireQuery(`EXPLAIN ${query}`, requestOptions))
      : resolution.transport === 'grpc'
        ? normalizePayloadValue(await this.runGrpc('ExplainQuery', {
            query,
            entity_types: requestOptions.entityTypes ?? [],
            capabilities: requestOptions.capabilities ?? [],
          }, requestOptions))
        : normalizePayloadValue(await this.runHttpPost<Record<string, unknown>>('/query/explain', {
            query,
          }, requestOptions));

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeSqlBatch(
    queries: string[],
    options: RedDbBatchQueryOptions
  ): Promise<RedDbOperationEnvelope<RedDbBatchQueryData>> {
    if (!Array.isArray(queries) || queries.length === 0) {
      throw new ValidationError('batch requires a non-empty array of queries', {
        field: 'queries',
        value: queries,
      });
    }

    const operation = 'sql.batch';
    const requestOptions = this.withResolvedTimeout(operation, options);
    const resolution = this.resolveTransport(operation, BATCH_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    let data: RedDbBatchQueryData;
    if (resolution.transport === 'grpc' && !resolution.emulated) {
      data = normalizeBatchQueryData(await this.runGrpc('BatchQuery', { queries }, requestOptions));
    } else {
      const concurrency = Math.max(1, requestOptions.concurrency ?? this.batchConcurrency);
      const results = await mapWithConcurrency(queries, concurrency, async (query) => {
        if (resolution.transport === 'wire') {
          return normalizeQueryData(await this.runWireQuery(query, requestOptions));
        }
        return normalizeQueryData(await this.runHttpPost<RedDbQueryData>('/query', {
          query,
          entity_types: requestOptions.entityTypes,
          capabilities: requestOptions.capabilities,
        }, requestOptions));
      });
      data = { results };
    }

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeCollectionsList(
    options: RedDbTransportRequest
  ): Promise<RedDbOperationEnvelope<RedDbCollectionsData>> {
    const operation = 'collections.list';
    const requestOptions = this.withResolvedTimeout(operation, options);
    const resolution = this.resolveTransport(operation, CONTROL_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    const data = resolution.transport === 'grpc'
      ? normalizeCollectionsData(await this.runGrpc('Collections', {}, requestOptions))
      : normalizeCollectionsData(await this.runHttpGet<Record<string, unknown>>('/collections', requestOptions));

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeCollectionCreate(
    options: RedDbCollectionCreateOptions
  ): Promise<RedDbOperationEnvelope<Record<string, unknown>>> {
    const name = ensureNonEmptyString(options.name, 'name', 'create requires a collection name');
    const operation = 'collections.create';
    const requestOptions = this.withResolvedTimeout(operation, options);
    const resolution = this.resolveTransport(operation, CONTROL_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    const payload: Record<string, unknown> = { name };
    if (requestOptions.ttl !== undefined) payload.ttl = requestOptions.ttl;
    if (requestOptions.ttlMs !== undefined) payload.ttl_ms = requestOptions.ttlMs;

    const data = resolution.transport === 'grpc'
      ? normalizePayloadValue(await this.runGrpc('CreateCollection', {
          payload_json: stringifyJson(payload, 'collection payload'),
        }, requestOptions))
      : normalizePayloadValue(await this.runHttpPost<Record<string, unknown>>('/collections', payload, requestOptions));

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeCollectionDescribe(
    options: RedDbCollectionRequest
  ): Promise<RedDbOperationEnvelope<Record<string, unknown>>> {
    const name = ensureNonEmptyString(options.name, 'name', 'describe requires a collection name');
    const operation = 'collections.describe';
    const requestOptions = this.withResolvedTimeout(operation, options);
    const resolution = this.resolveTransport(operation, CONTROL_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    const data = resolution.transport === 'grpc'
      ? normalizePayloadValue(await this.runGrpc('DescribeCollection', {
          collection: name,
        }, requestOptions))
      : normalizePayloadValue(await this.runHttpGet<Record<string, unknown>>(
          `/collections/${encodeURIComponent(name)}`,
          requestOptions
        ));

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeCollectionDrop(
    options: RedDbCollectionRequest
  ): Promise<RedDbOperationEnvelope<Record<string, unknown>>> {
    const name = ensureNonEmptyString(options.name, 'name', 'drop requires a collection name');
    const operation = 'collections.drop';
    const requestOptions = this.withResolvedTimeout(operation, options);
    const resolution = this.resolveTransport(operation, CONTROL_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    const data = resolution.transport === 'grpc'
      ? normalizeOperationData(
          await this.runGrpc('DropCollection', {
            payload_json: stringifyJson({ name }, 'drop collection payload'),
          }, requestOptions),
          {
            dropped: name,
            message: `dropped collection ${name}`,
          }
        )
      : normalizeOperationData(
          await this.runHttpDelete<Record<string, unknown>>(`/collections/${encodeURIComponent(name)}`, requestOptions),
          {
            dropped: name,
          }
        );

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeIndexesList(
    options: RedDbIndexListRequest
  ): Promise<RedDbOperationEnvelope<Record<string, unknown>>> {
    const operation = 'indexes.list';
    const requestOptions = this.withResolvedTimeout(operation, options);
    const resolution = this.resolveTransport(operation, CONTROL_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    const data = resolution.transport === 'grpc'
      ? normalizePayloadValue(await this.runGrpc('Indexes', {
          collection: requestOptions.collection ?? '',
        }, requestOptions))
      : normalizePayloadValue(await this.runHttpGet<Record<string, unknown>>(
          requestOptions.collection
            ? `/collections/${encodeURIComponent(requestOptions.collection)}/indexes`
            : '/indexes',
          requestOptions
        ));

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeIndexesStatuses(
    options: RedDbTransportRequest
  ): Promise<RedDbOperationEnvelope<Record<string, unknown>>> {
    const operation = 'indexes.statuses';
    const requestOptions = this.withResolvedTimeout(operation, options);
    const resolution = this.resolveTransport(operation, CONTROL_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    const data = resolution.transport === 'grpc'
      ? normalizePayloadValue(await this.runGrpc('IndexStatuses', {}, requestOptions))
      : normalizePayloadValue(await this.runHttpGet<Record<string, unknown>>('/catalog/indexes/status', requestOptions));

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeIndexCreate(
    options: RedDbIndexCreateOptions
  ): Promise<RedDbOperationEnvelope<RedDbQueryData>> {
    const name = ensureNonEmptyString(options.name, 'name', 'create requires an index name');
    const collection = ensureNonEmptyString(options.collection, 'collection', 'create requires a collection name');
    if (!Array.isArray(options.columns) || options.columns.length === 0) {
      throw new ValidationError('create requires at least one column', {
        field: 'columns',
        value: options.columns,
      });
    }

    const unique = options.unique ? 'UNIQUE ' : '';
    const method = options.method ? ` USING ${options.method}` : '';
    const columns = options.columns.map(escapeSqlIdentifier).join(', ');
    const query = `CREATE ${unique}INDEX IF NOT EXISTS ${escapeSqlIdentifier(name)} ON ${escapeSqlIdentifier(collection)} (${columns})${method}`;
    return await this.executeSqlQuery('indexes.create', query, options);
  }

  private async executeIndexToggle(
    operation: string,
    pathAction: string,
    enabled: boolean,
    options: RedDbIndexNameRequest
  ): Promise<RedDbOperationEnvelope<Record<string, unknown>>> {
    const name = ensureNonEmptyString(options.name, 'name', `${pathAction} requires an index name`);
    const requestOptions = this.withResolvedTimeout(operation, options);
    const resolution = this.resolveTransport(operation, CONTROL_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    const data = resolution.transport === 'grpc'
      ? normalizePayloadValue(await this.runGrpc('SetIndexEnabled', { name, enabled }, requestOptions))
      : normalizePayloadValue(await this.runHttpPost<Record<string, unknown>>(
          `/indexes/${encodeURIComponent(name)}/${pathAction}`,
          {},
          requestOptions
        ));

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeIndexWarmup(
    options: RedDbIndexNameRequest
  ): Promise<RedDbOperationEnvelope<Record<string, unknown>>> {
    const name = ensureNonEmptyString(options.name, 'name', 'warmup requires an index name');
    const operation = 'indexes.warmup';
    const requestOptions = this.withResolvedTimeout(operation, options);
    const resolution = this.resolveTransport(operation, CONTROL_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    const data = resolution.transport === 'grpc'
      ? normalizePayloadValue(await this.runGrpc('WarmupIndex', { name }, requestOptions))
      : normalizePayloadValue(await this.runHttpPost<Record<string, unknown>>(
          `/indexes/${encodeURIComponent(name)}/warmup`,
          {},
          requestOptions
        ));

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeIndexesRebuild(
    options: RedDbIndexRebuildRequest
  ): Promise<RedDbOperationEnvelope<Record<string, unknown>>> {
    const operation = 'indexes.rebuild';
    const requestOptions = this.withResolvedTimeout(operation, options);
    const resolution = this.resolveTransport(operation, CONTROL_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    const data = resolution.transport === 'grpc'
      ? normalizePayloadValue(await this.runGrpc('RebuildIndexes', {
          collection: requestOptions.collection ?? '',
        }, requestOptions))
      : normalizePayloadValue(await this.runHttpPost<Record<string, unknown>>(
          requestOptions.collection
            ? `/collections/${encodeURIComponent(requestOptions.collection)}/indexes/rebuild`
            : '/indexes/rebuild',
          {},
          requestOptions
        ));

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeRowsScan(
    request: RedDbScanRequest
  ): Promise<RedDbOperationEnvelope<RedDbScanData>> {
    const collection = ensureNonEmptyString(request.collection, 'collection', 'scan requires a collection name');
    const operation = 'rows.scan';
    const requestOptions = this.withResolvedTimeout(operation, request);
    const resolution = this.resolveTransport(operation, ROW_SCAN_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();
    const offset = Math.max(0, requestOptions.offset ?? 0);
    const limit = Math.max(1, requestOptions.limit ?? 100);

    const data = resolution.transport === 'grpc'
      ? normalizeScanData(await this.runGrpc('Scan', { collection, offset, limit }, requestOptions))
      : normalizeScanData(await this.runHttpGet<RedDbScanData>(
          `/collections/${encodeURIComponent(collection)}/scan?offset=${offset}&limit=${limit}`,
          requestOptions
        ));

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeRowCreate(
    request: RedDbRowCreateRequest
  ): Promise<RedDbOperationEnvelope<RedDbEntityData>> {
    const collection = ensureNonEmptyString(request.collection, 'collection', 'create requires a collection name');
    if (!isPlainObject(request.payload) || !isPlainObject(request.payload.fields)) {
      throw new ValidationError('rows.create requires payload.fields', {
        field: 'payload',
        value: request.payload,
      });
    }

    const operation = 'rows.create';
    const requestOptions = this.withResolvedTimeout(operation, request);
    const resolution = this.resolveTransport(operation, ROW_MUTATION_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    const data = resolution.transport === 'grpc'
      ? normalizeEntityData(await this.runGrpc('CreateRow', {
          collection,
          payload_json: stringifyJson(requestOptions.payload, 'row payload'),
        }, requestOptions))
      : normalizeEntityData(await this.runHttpPost<Record<string, unknown>>(
          `/collections/${encodeURIComponent(collection)}/rows`,
          requestOptions.payload,
          requestOptions
        ));

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeRowsBulkCreate(
    request: RedDbRowBulkCreateRequest
  ): Promise<RedDbOperationEnvelope<RedDbBulkEntityData>> {
    const collection = ensureNonEmptyString(request.collection, 'collection', 'bulkCreate requires a collection name');
    if (!Array.isArray(request.items) || request.items.length === 0) {
      throw new ValidationError('rows.bulkCreate requires a non-empty items array', {
        field: 'items',
        value: request.items,
      });
    }
    for (const item of request.items) {
      if (!isPlainObject(item) || !isPlainObject(item.fields)) {
        throw new ValidationError('rows.bulkCreate items must contain a fields object', {
          field: 'items',
          value: item,
        });
      }
    }

    const operation = 'rows.bulkCreate';
    const requestOptions = this.withResolvedTimeout(operation, request);
    const resolution = this.resolveTransport(operation, ROW_BULK_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    let data: RedDbBulkEntityData;
    if (resolution.transport === 'wire') {
      const count = await this.runWireBulkInsert(
        collection,
        requestOptions.items.map((item) => stringifyJson(item, 'row bulk item')),
        requestOptions
      );
      data = {
        ok: true,
        count,
      };
    } else if (resolution.transport === 'grpc') {
      data = normalizeBulkEntityData(await this.runGrpc('BulkCreateRows', {
        collection,
        payload_json: requestOptions.items.map((item) => stringifyJson(item, 'row bulk item')),
      }, requestOptions));
    } else {
      data = normalizeBulkEntityData(await this.runHttpPost<Record<string, unknown>>(
        `/collections/${encodeURIComponent(collection)}/bulk/rows`,
        { items: requestOptions.items },
        requestOptions
      ));
    }

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeRowPatch(
    request: RedDbPatchEntityRequest
  ): Promise<RedDbOperationEnvelope<RedDbEntityData>> {
    const collection = ensureNonEmptyString(request.collection, 'collection', 'patch requires a collection name');
    const id = toPositiveInteger(request.id, 'id', 0);
    if (!isPlainObject(request.payload)) {
      throw new ValidationError('patch requires a payload object', {
        field: 'payload',
        value: request.payload,
      });
    }

    const operation = 'rows.patch';
    const requestOptions = this.withResolvedTimeout(operation, request);
    const resolution = this.resolveTransport(operation, ROW_MUTATION_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    const data = resolution.transport === 'grpc'
      ? normalizeEntityData(await this.runGrpc('PatchEntity', {
          collection,
          id,
          payload_json: stringifyJson(requestOptions.payload, 'patch payload'),
        }, requestOptions))
      : normalizeEntityData(await this.runHttpPatch<Record<string, unknown>>(
          `/collections/${encodeURIComponent(collection)}/entities/${id}`,
          requestOptions.payload,
          requestOptions
        ));

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeRowDelete(
    request: RedDbDeleteEntityRequest
  ): Promise<RedDbOperationEnvelope<Record<string, unknown>>> {
    const collection = ensureNonEmptyString(request.collection, 'collection', 'delete requires a collection name');
    const id = toPositiveInteger(request.id, 'id', 0);
    const operation = 'rows.delete';
    const requestOptions = this.withResolvedTimeout(operation, request);
    const resolution = this.resolveTransport(operation, ROW_MUTATION_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    const data = resolution.transport === 'grpc'
      ? normalizeOperationData(await this.runGrpc('DeleteEntity', { collection, id }, requestOptions), {
          deleted: true,
          id,
        })
      : normalizeOperationData(await this.runHttpDelete<Record<string, unknown>>(
          `/collections/${encodeURIComponent(collection)}/entities/${id}`,
          requestOptions
        ), {
          deleted: true,
          id,
        });

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeEntityCreate(
    operation: string,
    grpcMethod: string,
    httpAction: string,
    request: RedDbEntityCreateRequest
  ): Promise<RedDbOperationEnvelope<RedDbEntityData>> {
    const collection = ensureNonEmptyString(request.collection, 'collection', 'create requires a collection name');
    if (!isPlainObject(request.payload)) {
      throw new ValidationError('create requires a payload object', {
        field: 'payload',
        value: request.payload,
      });
    }

    const requestOptions = this.withResolvedTimeout(operation, request);
    const resolution = this.resolveTransport(operation, ENTITY_MUTATION_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    const data = resolution.transport === 'grpc'
      ? normalizeEntityData(await this.runGrpc(grpcMethod, {
          collection,
          payload_json: stringifyJson(requestOptions.payload, `${operation} payload`),
        }, requestOptions))
      : normalizeEntityData(await this.runHttpPost<Record<string, unknown>>(
          `/collections/${encodeURIComponent(collection)}/${httpAction}`,
          requestOptions.payload,
          requestOptions
        ));

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeBulkEntityCreate(
    operation: string,
    grpcMethod: string,
    httpAction: string,
    request: RedDbBulkEntityCreateRequest
  ): Promise<RedDbOperationEnvelope<RedDbBulkEntityData>> {
    const collection = ensureNonEmptyString(request.collection, 'collection', 'bulkCreate requires a collection name');
    if (!Array.isArray(request.items) || request.items.length === 0) {
      throw new ValidationError('bulkCreate requires a non-empty items array', {
        field: 'items',
        value: request.items,
      });
    }
    for (const item of request.items) {
      if (!isPlainObject(item)) {
        throw new ValidationError('bulkCreate items must be objects', {
          field: 'items',
          value: item,
        });
      }
    }

    const requestOptions = this.withResolvedTimeout(operation, request);
    const resolution = this.resolveTransport(operation, ENTITY_MUTATION_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    const data = resolution.transport === 'grpc'
      ? normalizeBulkEntityData(await this.runGrpc(grpcMethod, {
          collection,
          payload_json: requestOptions.items.map((item) => stringifyJson(item, `${operation} item`)),
        }, requestOptions))
      : normalizeBulkEntityData(await this.runHttpPost<Record<string, unknown>>(
          `/collections/${encodeURIComponent(collection)}/${httpAction}`,
          { items: requestOptions.items },
          requestOptions
        ));

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeVectorBulkInsertBinary(
    request: RedDbBulkInsertBinaryRequest
  ): Promise<RedDbOperationEnvelope<RedDbBulkInsertData>> {
    const collection = ensureNonEmptyString(request.collection, 'collection', 'bulkInsertBinary requires a collection name');
    if (!Array.isArray(request.fieldNames) || request.fieldNames.length === 0) {
      throw new ValidationError('bulkInsertBinary requires fieldNames', {
        field: 'fieldNames',
        value: request.fieldNames,
      });
    }
    if (!Array.isArray(request.rows) || request.rows.length === 0) {
      throw new ValidationError('bulkInsertBinary requires rows', {
        field: 'rows',
        value: request.rows,
      });
    }

    const hasBytes = request.rows.some((row) => row.some((value) => isBufferLike(value)));
    const profile: OperationTransportProfile = hasBytes
      ? {
          preferences: ['grpc'],
          supported: { http: false, wire: false },
        }
      : {
          preferences: ['wire', 'grpc', 'http'],
          emulated: ['http'],
        };

    const operation = 'vectors.bulkInsertBinary';
    const requestOptions = this.withResolvedTimeout(operation, request);
    const resolution = this.resolveTransport(operation, profile, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    let data: RedDbBulkInsertData;
    if (resolution.transport === 'wire') {
      const count = await this.runWireBulkInsertBinary(
        collection,
        requestOptions.fieldNames,
        requestOptions.rows,
        requestOptions
      );
      data = {
        ok: true,
        count,
      };
    } else if (resolution.transport === 'grpc') {
      data = normalizeBulkInsertData(await this.runGrpc('BulkInsertBinary', {
        collection,
        field_names: requestOptions.fieldNames,
        rows: requestOptions.rows.map((row) => ({
          values: row.map((value) => toGrpcBinaryValue(value)),
        })),
      }, requestOptions));
    } else {
      data = normalizeBulkInsertData(await this.runHttpPost<Record<string, unknown>>(
        `/collections/${encodeURIComponent(collection)}/bulk/rows`,
        {
          items: requestOptions.rows.map((row) => ({
            fields: rowToScalarFields(requestOptions.fieldNames, row),
          })),
        },
        requestOptions
      ));
    }

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeVectorSearch(
    operation: string,
    grpcMethod: string,
    httpAction: string,
    request: RedDbVectorSearchRequest
  ): Promise<RedDbOperationEnvelope<Record<string, unknown>>> {
    const collection = ensureNonEmptyString(request.collection, 'collection', `${operation} requires a collection name`);
    if (!isPlainObject(request.payload)) {
      throw new ValidationError(`${operation} requires a payload object`, {
        field: 'payload',
        value: request.payload,
      });
    }

    const requestOptions = this.withResolvedTimeout(operation, request);
    const resolution = this.resolveTransport(operation, VECTOR_SEARCH_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    const data = resolution.transport === 'grpc'
      ? normalizePayloadValue(await this.runGrpc(grpcMethod, {
          collection,
          payload_json: stringifyJson(requestOptions.payload, `${operation} payload`),
        }, requestOptions))
      : normalizePayloadValue(await this.runHttpPost<Record<string, unknown>>(
          `/collections/${encodeURIComponent(collection)}/${httpAction}`,
          requestOptions.payload,
          requestOptions
        ));

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeKvGet(
    request: RedDbKvRequest
  ): Promise<RedDbOperationEnvelope<RedDbKvData>> {
    const collection = ensureNonEmptyString(request.collection, 'collection', 'kv.get requires a collection name');
    const key = ensureNonEmptyString(request.key, 'key', 'kv.get requires a key');
    const operation = 'kv.get';
    const requestOptions = this.withResolvedTimeout(operation, request);
    const resolution = this.resolveTransport(operation, KV_HTTP_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    const data = normalizeOperationData(await this.runHttpGet<Record<string, unknown>>(
      `/collections/${encodeURIComponent(collection)}/kvs/${encodeURIComponent(key)}`,
      requestOptions
    ));

    return this.buildEnvelope(operation, data as RedDbKvData, resolution, startedAt, started);
  }

  private async executeKvPut(
    request: RedDbKvPutRequest
  ): Promise<RedDbOperationEnvelope<RedDbEntityData>> {
    const collection = ensureNonEmptyString(request.collection, 'collection', 'kv.put requires a collection name');
    const key = ensureNonEmptyString(request.key, 'key', 'kv.put requires a key');
    const operation = 'kv.put';
    const requestOptions = this.withResolvedTimeout(operation, request);
    const resolution = this.resolveTransport(operation, KV_HTTP_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    const data = normalizeEntityData(await this.runHttpPut<Record<string, unknown>>(
      `/collections/${encodeURIComponent(collection)}/kvs/${encodeURIComponent(key)}`,
      { value: requestOptions.value },
      requestOptions
    ));

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeKvDelete(
    request: RedDbKvRequest
  ): Promise<RedDbOperationEnvelope<Record<string, unknown>>> {
    const collection = ensureNonEmptyString(request.collection, 'collection', 'kv.delete requires a collection name');
    const key = ensureNonEmptyString(request.key, 'key', 'kv.delete requires a key');
    const operation = 'kv.delete';
    const requestOptions = this.withResolvedTimeout(operation, request);
    const resolution = this.resolveTransport(operation, KV_HTTP_PROFILE, requestOptions.transport);
    const startedAt = Date.now();
    const started = performance.now();

    const data = normalizeOperationData(await this.runHttpDelete<Record<string, unknown>>(
      `/collections/${encodeURIComponent(collection)}/kvs/${encodeURIComponent(key)}`,
      requestOptions
    ), {
      key,
      deleted: true,
    });

    return this.buildEnvelope(operation, data, resolution, startedAt, started);
  }

  private async executeKvList(
    request: RedDbKvListRequest
  ): Promise<RedDbOperationEnvelope<RedDbKvListData>> {
    const collection = ensureNonEmptyString(request.collection, 'collection', 'kv.list requires a collection name');
    const limit = request.limit === undefined ? 100 : toPositiveInteger(request.limit, 'limit', 1);
    const offset = request.offset === undefined ? 0 : toPositiveInteger(request.offset, 'offset', 0);
    const order = request.order === 'desc' ? 'DESC' : 'ASC';

    const where = request.prefix
      ? ` WHERE key LIKE ${escapeSqlLiteral(`${request.prefix}%`)}`
      : '';
    const sql = `SELECT id, key, value FROM ${escapeSqlIdentifier(collection)}${where} ORDER BY key ${order} LIMIT ${limit} OFFSET ${offset}`;

    const queryEnvelope = await this.executeSqlQuery('kv.list', sql, {
      transport: request.transport,
      signal: request.signal,
      timeout: request.timeout,
      entityTypes: request.entityTypes,
      capabilities: request.capabilities,
    });

    const items = Array.isArray(queryEnvelope.data.result?.records)
      ? queryEnvelope.data.result.records.map((record) => ({
          ...record,
          id: toSafeNumber(record.id),
          key: typeof record.key === 'string' ? record.key : undefined,
          value: record.value,
        }))
      : [];

    return this.mapEnvelope(queryEnvelope, 'kv.list', {
      items,
      query: queryEnvelope.data,
    });
  }

  private resolveOperationTimeout(operation: string, override?: number): number {
    if (override !== undefined) {
      return override;
    }

    const bucket = this.operationTimeoutBucket(operation);
    const bucketTimeout = bucket ? this.operationTimeouts[bucket] : undefined;
    return bucketTimeout ?? this.timeout;
  }

  private withResolvedTimeout<T extends RedDbTransportRequest>(operation: string, options: T): T {
    if (options.timeout !== undefined) {
      return options;
    }

    return {
      ...options,
      timeout: this.resolveOperationTimeout(operation),
    };
  }

  private operationTimeoutBucket(operation: string): keyof RedDbOperationTimeouts | undefined {
    if (operation.startsWith('system.')) return 'system';
    if (operation === 'sql.batch') return 'sqlBatch';
    if (operation.startsWith('sql.')) return 'sql';
    if (operation === 'rows.scan') return 'scan';
    if (operation.startsWith('collections.')) return 'ddl';
    if (operation.startsWith('indexes.')) return 'index';
    if (operation === 'vectors.similar' || operation === 'vectors.ivfSearch') return 'search';
    if (operation.startsWith('kv.')) return 'kv';
    if (
      operation === 'rows.bulkCreate' ||
      operation.endsWith('.bulkCreate') ||
      operation === 'vectors.bulkInsertBinary'
    ) {
      return 'bulk';
    }
    if (
      operation.startsWith('rows.') ||
      operation.endsWith('.create') ||
      operation.endsWith('.patch') ||
      operation.endsWith('.delete')
    ) {
      return 'mutation';
    }
    return undefined;
  }

  private resolveTransport(
    operation: string,
    profile: OperationTransportProfile,
    requestedTransport?: RedDbTransportMode
  ): TransportResolution {
    const requested = requestedTransport ?? this.defaultTransport;
    const available: Record<RedDbResolvedTransport, boolean> = {
      http: this.httpClient !== null,
      grpc: this.grpcClient !== null,
      wire: this.wireClient !== null,
    };

    const supported: Record<RedDbResolvedTransport, boolean> = {
      http: profile.supported?.http ?? true,
      grpc: profile.supported?.grpc ?? true,
      wire: profile.supported?.wire ?? true,
    };

    const canUse = (transport: RedDbResolvedTransport) => available[transport] && supported[transport];
    const choosePreferred = () => profile.preferences.find((transport) => canUse(transport));

    if (requested === 'auto') {
      const chosen = choosePreferred();
      if (!chosen) {
        throw new UnsupportedError(`No RedDB transport is configured for ${operation}`, {
          feature: `reddb.${operation}`,
        });
      }
      return {
        transport: chosen,
        requestedTransport: requested,
        degradedFromRequestedTransport: false,
        emulated: profile.emulated?.includes(chosen) ?? false,
      };
    }

    if (canUse(requested)) {
      return {
        transport: requested,
        requestedTransport: requested,
        degradedFromRequestedTransport: false,
        emulated: profile.emulated?.includes(requested) ?? false,
      };
    }

    if (!this.allowTransportFallback) {
      throw new UnsupportedError(`Transport ${requested} cannot satisfy ${operation}`, {
        feature: `reddb.${operation}.${requested}`,
      });
    }

    const chosen = choosePreferred();
    if (!chosen) {
      throw new UnsupportedError(`No RedDB transport is configured for ${operation}`, {
        feature: `reddb.${operation}`,
      });
    }

    return {
      transport: chosen,
      requestedTransport: requested,
      degradedFromRequestedTransport: chosen !== requested,
      emulated: profile.emulated?.includes(chosen) ?? false,
    };
  }

  private async runHttpPost<T>(
    path: string,
    payload: unknown,
    options: RedDbTransportRequest
  ): Promise<T> {
    if (!this.httpClient) {
      throw new UnsupportedError('HTTP transport is not configured for this RedDB client', {
        feature: 'reddb.http',
      });
    }

    const response = await this.httpClient.post(path, {
      json: payload,
      signal: options.signal,
      timeout: options.timeout ?? this.timeout,
      throwHttpErrors: false,
    });

    return this.parseHttpResponse<T>(response, path);
  }

  private async runHttpPut<T>(
    path: string,
    payload: unknown,
    options: RedDbTransportRequest
  ): Promise<T> {
    if (!this.httpClient) {
      throw new UnsupportedError('HTTP transport is not configured for this RedDB client', {
        feature: 'reddb.http',
      });
    }

    const response = await this.httpClient.put(path, {
      json: payload,
      signal: options.signal,
      timeout: options.timeout ?? this.timeout,
      throwHttpErrors: false,
    });

    return this.parseHttpResponse<T>(response, path);
  }

  private async runHttpPatch<T>(
    path: string,
    payload: unknown,
    options: RedDbTransportRequest
  ): Promise<T> {
    if (!this.httpClient) {
      throw new UnsupportedError('HTTP transport is not configured for this RedDB client', {
        feature: 'reddb.http',
      });
    }

    const response = await this.httpClient.patch(path, {
      json: payload,
      signal: options.signal,
      timeout: options.timeout ?? this.timeout,
      throwHttpErrors: false,
    });

    return this.parseHttpResponse<T>(response, path);
  }

  private async runHttpDelete<T>(
    path: string,
    options: RedDbTransportRequest
  ): Promise<T> {
    if (!this.httpClient) {
      throw new UnsupportedError('HTTP transport is not configured for this RedDB client', {
        feature: 'reddb.http',
      });
    }

    const response = await this.httpClient.delete(path, {
      signal: options.signal,
      timeout: options.timeout ?? this.timeout,
      throwHttpErrors: false,
    });

    return this.parseHttpResponse<T>(response, path);
  }

  private async runHttpGet<T>(
    path: string,
    options: RedDbTransportRequest
  ): Promise<T> {
    if (!this.httpClient) {
      throw new UnsupportedError('HTTP transport is not configured for this RedDB client', {
        feature: 'reddb.http',
      });
    }

    const response = await this.httpClient.get(path, {
      signal: options.signal,
      timeout: options.timeout ?? this.timeout,
      throwHttpErrors: false,
    });

    return this.parseHttpResponse<T>(response, path);
  }

  private async parseHttpResponse<T>(response: any, path: string): Promise<T> {
    if (response.status === 401) {
      throw new AuthenticationError(`RedDB request unauthorized for ${path}`, {
        authType: 'bearer',
      });
    }

    if (response.status === 404) {
      throw new NotFoundError(`RedDB resource not found: ${path}`, {
        resource: path,
      });
    }

    if (!response.ok) {
      const message = await response.text().catch(() => `HTTP ${response.status}`);
      throw new ProtocolError(`RedDB HTTP request failed for ${path}: ${message}`, {
        protocol: 'reddb',
        code: response.status,
        phase: 'http',
        retriable: response.status >= 500,
      });
    }

    if (response.status === 204) {
      return undefined as T;
    }

    try {
      return await response.json() as T;
    } catch (error) {
      throw new ParseError(
        `Failed to parse RedDB HTTP response for ${path}: ${error instanceof Error ? error.message : String(error)}`,
        { format: 'json' }
      );
    }
  }

  private async runGrpc(
    methodName: string,
    request: Record<string, unknown>,
    options: RedDbTransportRequest
  ): Promise<unknown> {
    if (!this.grpcClient) {
      throw new UnsupportedError('gRPC transport is not configured for this RedDB client', {
        feature: 'reddb.grpc',
      });
    }
    return await this.grpcClient.unary(methodName, request, options);
  }

  private async runWireQuery(
    query: string,
    options: RedDbTransportRequest
  ): Promise<unknown> {
    if (options.signal) {
      throw new UnsupportedError('AbortSignal is not supported for RedDB wire operations', {
        feature: 'reddb.wire.signal',
      });
    }
    if (!this.wireClient) {
      throw new UnsupportedError('Wire transport is not configured for this RedDB client', {
        feature: 'reddb.wire',
      });
    }
    return await this.wireClient.query(query, options.timeout ?? this.timeout);
  }

  private async runWireBulkInsert(
    collection: string,
    payloads: string[],
    options: RedDbTransportRequest
  ): Promise<number> {
    if (options.signal) {
      throw new UnsupportedError('AbortSignal is not supported for RedDB wire operations', {
        feature: 'reddb.wire.signal',
      });
    }
    if (!this.wireClient) {
      throw new UnsupportedError('Wire transport is not configured for this RedDB client', {
        feature: 'reddb.wire',
      });
    }
    return await this.wireClient.bulkInsert(collection, payloads, options.timeout ?? this.timeout);
  }

  private async runWireBulkInsertBinary(
    collection: string,
    fieldNames: string[],
    rows: RedDbBinaryValue[][],
    options: RedDbTransportRequest
  ): Promise<number> {
    if (options.signal) {
      throw new UnsupportedError('AbortSignal is not supported for RedDB wire operations', {
        feature: 'reddb.wire.signal',
      });
    }
    if (!this.wireClient) {
      throw new UnsupportedError('Wire transport is not configured for this RedDB client', {
        feature: 'reddb.wire',
      });
    }
    return await this.wireClient.bulkInsertBinary(collection, fieldNames, rows, options.timeout ?? this.timeout);
  }

  private buildEnvelope<T>(
    operation: string,
    data: T,
    resolution: TransportResolution,
    startedAt: number,
    started: number
  ): RedDbOperationEnvelope<T> {
    const queryStats = buildQueryStats(data);

    return {
      data,
      transport: resolution.transport,
      requestedTransport: resolution.requestedTransport,
      degradedFromRequestedTransport: resolution.degradedFromRequestedTransport,
      emulated: resolution.emulated,
      metrics: {
        operation,
        requestedTransport: resolution.requestedTransport,
        transport: resolution.transport,
        degradedFromRequestedTransport: resolution.degradedFromRequestedTransport,
        emulated: resolution.emulated,
        startedAt,
        durationMs: Number((performance.now() - started).toFixed(3)),
        ...queryStats,
      },
    };
  }

  private mapEnvelope<T, U>(
    envelope: RedDbOperationEnvelope<T>,
    operation: string,
    data: U
  ): RedDbOperationEnvelope<U> {
    return {
      ...envelope,
      data,
      metrics: {
        ...envelope.metrics,
        operation,
      },
    };
  }
}

function toGrpcBinaryValue(value: RedDbBinaryValue): Record<string, unknown> {
  if (value === null) {
    return {};
  }

  if (typeof value === 'string') {
    return { text_value: value };
  }
  if (typeof value === 'boolean') {
    return { bool_value: value };
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ValidationError('bulkInsertBinary number values must be finite', {
        field: 'rows',
        value,
      });
    }
    return Number.isInteger(value)
      ? { int_value: value }
      : { float_value: value };
  }
  if (typeof value === 'bigint') {
    return { int_value: value.toString() };
  }
  if (isBufferLike(value)) {
    return { blob_value: Buffer.from(value) };
  }

  throw new ValidationError('Unsupported bulkInsertBinary value type', {
    field: 'rows',
    value,
  });
}

function rowToScalarFields(fieldNames: string[], row: RedDbBinaryValue[]): Record<string, unknown> {
  if (row.length !== fieldNames.length) {
    throw new ValidationError(
      `bulkInsertBinary row length ${row.length} does not match fieldNames length ${fieldNames.length}`,
      { field: 'rows', value: row }
    );
  }

  const fields: Record<string, unknown> = {};
  for (let index = 0; index < fieldNames.length; index++) {
    const fieldName = fieldNames[index]!;
    const value = row[index];

    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      if (typeof value === 'bigint') {
        const numeric = Number(value);
        if (!Number.isSafeInteger(numeric)) {
          throw new UnsupportedError(
            'bulkInsertBinary bigint values outside the safe integer range require gRPC transport',
            { feature: 'reddb.http.bulkInsertBinary.bigint' }
          );
        }
        fields[fieldName] = numeric;
      } else {
        fields[fieldName] = value;
      }
      continue;
    }

    if (isBufferLike(value)) {
      throw new UnsupportedError(
        'bulkInsertBinary byte values require gRPC transport; HTTP emulation would be lossy',
        { feature: 'reddb.http.bulkInsertBinary.bytes' }
      );
    }

    throw new ValidationError(`Unsupported bulkInsertBinary value for field ${fieldName}`, {
      field: fieldName,
      value,
    });
  }

  return fields;
}

export function createRedDbClient(options: RedDbClientOptions = {}): RedDbClient {
  return new RedDbClient(options);
}

export function reddb(options: RedDbClientOptions = {}): RedDbClient {
  return createRedDbClient(options);
}
