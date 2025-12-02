/**
 * OData Plugin
 * Implements OData v4 protocol (https://www.odata.org/)
 */

import type { Client } from '../core/client.js';
import type { RequestOptions, ReckerResponse } from '../types/index.js';
import { UnsupportedError, HttpError } from '../core/errors.js';

// ============================================================================
// OData Types
// ============================================================================

export interface ODataOptions {
  /** OData service root URL */
  serviceRoot: string;
  /** OData version (default: '4.0') */
  version?: '4.0' | '4.01';
  /** Maximum page size */
  maxPageSize?: number;
  /** Request options */
  requestOptions?: RequestOptions;
}

export interface ODataQueryOptions {
  /** $select - Select specific properties */
  $select?: string | string[];
  /** $expand - Expand related entities */
  $expand?: string | string[] | ExpandOption[];
  /** $filter - Filter results */
  $filter?: string | FilterExpression;
  /** $orderby - Order results */
  $orderby?: string | OrderByOption[];
  /** $top - Limit results */
  $top?: number;
  /** $skip - Skip results (pagination) */
  $skip?: number;
  /** $count - Include count in response */
  $count?: boolean;
  /** $search - Free-text search */
  $search?: string;
  /** $format - Response format */
  $format?: 'json' | 'xml' | 'atom';
  /** Custom query parameters */
  [key: string]: unknown;
}

export interface ExpandOption {
  property: string;
  select?: string[];
  expand?: ExpandOption[];
  filter?: string | FilterExpression;
  orderby?: string | OrderByOption[];
  top?: number;
  skip?: number;
  count?: boolean;
}

export interface OrderByOption {
  property: string;
  direction?: 'asc' | 'desc';
}

export interface FilterExpression {
  and?: FilterExpression[];
  or?: FilterExpression[];
  not?: FilterExpression;
  eq?: [string, unknown];
  ne?: [string, unknown];
  gt?: [string, unknown];
  ge?: [string, unknown];
  lt?: [string, unknown];
  le?: [string, unknown];
  contains?: [string, string];
  startswith?: [string, string];
  endswith?: [string, string];
  raw?: string;
}

export interface ODataResponse<T = unknown> {
  '@odata.context'?: string;
  '@odata.count'?: number;
  '@odata.nextLink'?: string;
  value?: T[];
  [key: string]: unknown;
}

export interface ODataEntityResponse<T = unknown> extends ODataResponse<T> {
  '@odata.etag'?: string;
}

export interface ODataError {
  error: {
    code: string;
    message: string;
    target?: string;
    details?: Array<{
      code: string;
      message: string;
      target?: string;
    }>;
    innererror?: {
      message?: string;
      type?: string;
      stacktrace?: string;
    };
  };
}

export class ODataException extends Error {
  public readonly code: string;
  public readonly target?: string;
  public readonly details?: Array<{ code: string; message: string; target?: string }>;
  public readonly innererror?: { message?: string; type?: string; stacktrace?: string };

  constructor(error: ODataError['error']) {
    super(error.message);
    this.name = 'ODataException';
    this.code = error.code;
    this.target = error.target;
    this.details = error.details;
    this.innererror = error.innererror;
  }
}

// ============================================================================
// Query Builder
// ============================================================================

/**
 * Fluent query builder for OData queries
 *
 * @example
 * ```typescript
 * const query = odata.query('Products')
 *   .select('Name', 'Price')
 *   .filter(f => f.gt('Price', 100).and().contains('Name', 'Widget'))
 *   .expand('Category')
 *   .orderBy('Price', 'desc')
 *   .top(10);
 *
 * const products = await query.get();
 * ```
 */
export class ODataQueryBuilder<T = unknown> {
  private client: ODataClient;
  private entitySet: string;
  private entityKey?: string | number | Record<string, unknown>;
  private queryOptions: ODataQueryOptions = {};
  private requestOptions?: RequestOptions;

  constructor(client: ODataClient, entitySet: string) {
    this.client = client;
    this.entitySet = entitySet;
  }

  /**
   * Set entity key for single entity operations
   */
  key(key: string | number | Record<string, unknown>): this {
    this.entityKey = key;
    return this;
  }

  /**
   * Select specific properties
   */
  select(...properties: string[]): this {
    this.queryOptions.$select = properties;
    return this;
  }

  /**
   * Expand related entities
   */
  expand(...properties: (string | ExpandOption)[]): this {
    // Separate strings and ExpandOptions
    const hasExpandOptions = properties.some((p) => typeof p !== 'string');
    if (hasExpandOptions) {
      this.queryOptions.$expand = properties as ExpandOption[];
    } else {
      this.queryOptions.$expand = properties as string[];
    }
    return this;
  }

  /**
   * Filter results
   */
  filter(filter: string | FilterExpression | ((builder: FilterBuilder) => FilterBuilder)): this {
    if (typeof filter === 'function') {
      const builder = new FilterBuilder();
      this.queryOptions.$filter = filter(builder).build();
    } else {
      this.queryOptions.$filter = filter;
    }
    return this;
  }

  /**
   * Order results
   */
  orderBy(property: string, direction: 'asc' | 'desc' = 'asc'): this {
    const existing = this.queryOptions.$orderby;
    const option: OrderByOption = { property, direction };

    if (Array.isArray(existing)) {
      existing.push(option);
    } else if (existing) {
      this.queryOptions.$orderby = [{ property: existing as string, direction: 'asc' }, option];
    } else {
      this.queryOptions.$orderby = [option];
    }
    return this;
  }

  /**
   * Limit results
   */
  top(count: number): this {
    this.queryOptions.$top = count;
    return this;
  }

  /**
   * Skip results (pagination)
   */
  skip(count: number): this {
    this.queryOptions.$skip = count;
    return this;
  }

  /**
   * Include count in response
   */
  count(include: boolean = true): this {
    this.queryOptions.$count = include;
    return this;
  }

  /**
   * Free-text search
   */
  search(term: string): this {
    this.queryOptions.$search = term;
    return this;
  }

  /**
   * Set custom query option
   */
  custom(key: string, value: unknown): this {
    this.queryOptions[key] = value;
    return this;
  }

  /**
   * Set request options
   */
  options(options: RequestOptions): this {
    this.requestOptions = options;
    return this;
  }

  /**
   * Execute GET request
   */
  async get(): Promise<ODataResponse<T>> {
    return this.client.get<T>(this.entitySet, this.entityKey, this.queryOptions, this.requestOptions);
  }

  /**
   * Get all pages (follows @odata.nextLink)
   */
  async *getAll(): AsyncGenerator<T, void, unknown> {
    let response = await this.get();

    while (response.value) {
      for (const item of response.value) {
        yield item;
      }

      if (response['@odata.nextLink']) {
        response = await this.client.getNextPage<T>(response['@odata.nextLink']);
      } else {
        break;
      }
    }
  }

  /**
   * Get URL for this query
   */
  toUrl(): string {
    return this.client.buildUrl(this.entitySet, this.entityKey, this.queryOptions);
  }
}

// ============================================================================
// Filter Builder
// ============================================================================

export class FilterBuilder {
  private parts: string[] = [];

  eq(property: string, value: unknown): this {
    this.parts.push(`${property} eq ${this.formatValue(value)}`);
    return this;
  }

  ne(property: string, value: unknown): this {
    this.parts.push(`${property} ne ${this.formatValue(value)}`);
    return this;
  }

  gt(property: string, value: unknown): this {
    this.parts.push(`${property} gt ${this.formatValue(value)}`);
    return this;
  }

  ge(property: string, value: unknown): this {
    this.parts.push(`${property} ge ${this.formatValue(value)}`);
    return this;
  }

  lt(property: string, value: unknown): this {
    this.parts.push(`${property} lt ${this.formatValue(value)}`);
    return this;
  }

  le(property: string, value: unknown): this {
    this.parts.push(`${property} le ${this.formatValue(value)}`);
    return this;
  }

  contains(property: string, value: string): this {
    this.parts.push(`contains(${property},'${this.escapeString(value)}')`);
    return this;
  }

  startswith(property: string, value: string): this {
    this.parts.push(`startswith(${property},'${this.escapeString(value)}')`);
    return this;
  }

  endswith(property: string, value: string): this {
    this.parts.push(`endswith(${property},'${this.escapeString(value)}')`);
    return this;
  }

  isNull(property: string): this {
    this.parts.push(`${property} eq null`);
    return this;
  }

  isNotNull(property: string): this {
    this.parts.push(`${property} ne null`);
    return this;
  }

  in(property: string, values: unknown[]): this {
    const formatted = values.map((v) => this.formatValue(v)).join(',');
    this.parts.push(`${property} in (${formatted})`);
    return this;
  }

  and(): this {
    if (this.parts.length > 0) {
      this.parts.push('and');
    }
    return this;
  }

  or(): this {
    if (this.parts.length > 0) {
      this.parts.push('or');
    }
    return this;
  }

  not(): this {
    this.parts.push('not');
    return this;
  }

  group(builder: (b: FilterBuilder) => FilterBuilder): this {
    const inner = new FilterBuilder();
    const result = builder(inner).build();
    this.parts.push(`(${result})`);
    return this;
  }

  raw(expression: string): this {
    this.parts.push(expression);
    return this;
  }

  build(): string {
    return this.parts.join(' ');
  }

  private formatValue(value: unknown): string {
    if (value === null) return 'null';
    if (typeof value === 'string') return `'${this.escapeString(value)}'`;
    if (typeof value === 'boolean') return value.toString();
    if (typeof value === 'number') return value.toString();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  private escapeString(str: string): string {
    return str.replace(/'/g, "''");
  }
}

// ============================================================================
// OData Client
// ============================================================================

/**
 * OData v4 Client
 *
 * @example
 * ```typescript
 * const odata = createODataClient(client, {
 *   serviceRoot: 'https://services.odata.org/V4/Northwind/Northwind.svc'
 * });
 *
 * // Query builder
 * const products = await odata.query('Products')
 *   .filter(f => f.gt('UnitPrice', 20))
 *   .select('ProductName', 'UnitPrice')
 *   .expand('Category')
 *   .top(10)
 *   .get();
 *
 * // CRUD operations
 * const product = await odata.getById('Products', 1);
 * await odata.create('Products', { ProductName: 'New Product', UnitPrice: 29.99 });
 * await odata.update('Products', 1, { UnitPrice: 34.99 });
 * await odata.delete('Products', 1);
 *
 * // Batch requests
 * const results = await odata.batch([
 *   { method: 'GET', url: 'Products(1)' },
 *   { method: 'GET', url: 'Products(2)' }
 * ]);
 * ```
 */
export class ODataClient {
  private client: Client;
  private options: Required<ODataOptions>;

  constructor(client: Client, options: ODataOptions) {
    this.client = client;
    this.options = {
      serviceRoot: options.serviceRoot.replace(/\/$/, ''),
      version: options.version ?? '4.0',
      maxPageSize: options.maxPageSize ?? 100,
      requestOptions: options.requestOptions ?? {},
    };
  }

  /**
   * Create a query builder for an entity set
   */
  query<T = unknown>(entitySet: string): ODataQueryBuilder<T> {
    return new ODataQueryBuilder<T>(this, entitySet);
  }

  /**
   * GET entity set or single entity
   */
  async get<T = unknown>(
    entitySet: string,
    key?: string | number | Record<string, unknown>,
    queryOptions?: ODataQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<ODataResponse<T>> {
    const url = this.buildUrl(entitySet, key, queryOptions);
    const response = await this.request<ODataResponse<T>>('GET', url, undefined, requestOptions);
    return response;
  }

  /**
   * GET single entity by key
   */
  async getById<T = unknown>(
    entitySet: string,
    key: string | number | Record<string, unknown>,
    queryOptions?: ODataQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<T> {
    const response = await this.get<T>(entitySet, key, queryOptions, requestOptions);
    return response as unknown as T;
  }

  /**
   * Follow @odata.nextLink for pagination
   */
  async getNextPage<T = unknown>(nextLink: string): Promise<ODataResponse<T>> {
    const response = await this.client.get(nextLink, {
      ...this.options.requestOptions,
      headers: this.getHeaders(),
    });
    return this.handleResponse<ODataResponse<T>>(response);
  }

  /**
   * CREATE (POST) new entity
   */
  async create<T = unknown>(
    entitySet: string,
    entity: Partial<T>,
    requestOptions?: RequestOptions
  ): Promise<T> {
    const url = this.buildUrl(entitySet);
    return this.request<T>('POST', url, entity, requestOptions);
  }

  /**
   * UPDATE (PATCH) entity
   */
  async update<T = unknown>(
    entitySet: string,
    key: string | number | Record<string, unknown>,
    entity: Partial<T>,
    requestOptions?: RequestOptions
  ): Promise<T> {
    const url = this.buildUrl(entitySet, key);
    return this.request<T>('PATCH', url, entity, requestOptions);
  }

  /**
   * REPLACE (PUT) entity
   */
  async replace<T = unknown>(
    entitySet: string,
    key: string | number | Record<string, unknown>,
    entity: T,
    requestOptions?: RequestOptions
  ): Promise<T> {
    const url = this.buildUrl(entitySet, key);
    return this.request<T>('PUT', url, entity, requestOptions);
  }

  /**
   * DELETE entity
   */
  async delete(
    entitySet: string,
    key: string | number | Record<string, unknown>,
    requestOptions?: RequestOptions
  ): Promise<void> {
    const url = this.buildUrl(entitySet, key);
    await this.request<void>('DELETE', url, undefined, requestOptions);
  }

  /**
   * Call bound or unbound action
   */
  async action<T = unknown>(
    action: string,
    params?: Record<string, unknown>,
    requestOptions?: RequestOptions
  ): Promise<T> {
    const url = `${this.options.serviceRoot}/${action}`;
    return this.request<T>('POST', url, params, requestOptions);
  }

  /**
   * Call bound or unbound function
   */
  async function<T = unknown>(
    func: string,
    params?: Record<string, unknown>,
    requestOptions?: RequestOptions
  ): Promise<T> {
    let url = `${this.options.serviceRoot}/${func}`;

    if (params && Object.keys(params).length > 0) {
      const paramString = Object.entries(params)
        .map(([k, v]) => `${k}=${this.formatKeyValue(v)}`)
        .join(',');
      url += `(${paramString})`;
    }

    return this.request<T>('GET', url, undefined, requestOptions);
  }

  /**
   * Execute batch request
   */
  async batch(
    requests: Array<{ method: string; url: string; body?: unknown; headers?: Record<string, string> }>,
    requestOptions?: RequestOptions
  ): Promise<Array<{ status: number; body: unknown }>> {
    const boundary = `batch_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const batchUrl = `${this.options.serviceRoot}/$batch`;

    let body = '';
    for (const req of requests) {
      body += `--${boundary}\r\n`;
      body += 'Content-Type: application/http\r\n';
      body += 'Content-Transfer-Encoding: binary\r\n\r\n';
      body += `${req.method} ${req.url} HTTP/1.1\r\n`;

      if (req.headers) {
        for (const [key, value] of Object.entries(req.headers)) {
          body += `${key}: ${value}\r\n`;
        }
      }

      if (req.body) {
        body += 'Content-Type: application/json\r\n\r\n';
        body += JSON.stringify(req.body);
      }

      body += '\r\n';
    }
    body += `--${boundary}--\r\n`;

    const response = await this.client.post(batchUrl, body, {
      ...this.options.requestOptions,
      ...requestOptions,
      headers: {
        ...this.getHeaders(),
        'Content-Type': `multipart/mixed; boundary=${boundary}`,
        ...requestOptions?.headers,
      },
    });

    const responseText = await response.text();
    return this.parseBatchResponse(responseText);
  }

  /**
   * Get service metadata ($metadata)
   */
  async getMetadata(): Promise<string> {
    const response = await this.client.get(`${this.options.serviceRoot}/$metadata`, {
      ...this.options.requestOptions,
      headers: {
        Accept: 'application/xml',
      },
    });
    return response.text();
  }

  /**
   * Build URL with query options
   */
  buildUrl(
    entitySet: string,
    key?: string | number | Record<string, unknown>,
    queryOptions?: ODataQueryOptions
  ): string {
    let url = `${this.options.serviceRoot}/${entitySet}`;

    if (key !== undefined) {
      url += `(${this.formatKey(key)})`;
    }

    if (queryOptions) {
      const params = this.buildQueryString(queryOptions);
      if (params) {
        url += `?${params}`;
      }
    }

    return url;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'OData-Version': this.options.version,
      'OData-MaxVersion': '4.01',
    };
  }

  private async request<T>(
    method: string,
    url: string,
    body?: unknown,
    requestOptions?: RequestOptions
  ): Promise<T> {
    const options: RequestOptions = {
      ...this.options.requestOptions,
      ...requestOptions,
      // Always disable throwHttpErrors so OData can handle errors
      throwHttpErrors: false,
      headers: {
        ...this.getHeaders(),
        ...requestOptions?.headers,
      },
    };

    let response: ReckerResponse;

    switch (method) {
      case 'GET':
        response = await this.client.get(url, options);
        break;
      case 'POST':
        response = await this.client.post(url, body, options);
        break;
      case 'PUT':
        response = await this.client.put(url, body, options);
        break;
      case 'PATCH':
        response = await this.client.patch(url, body, options);
        break;
      case 'DELETE':
        response = await this.client.delete(url, options);
        break;
      default:
        throw new UnsupportedError(`Unsupported HTTP method: ${method}`, {
          feature: method,
        });
    }

    return this.handleResponse<T>(response);
  }

  private async handleResponse<T>(response: ReckerResponse): Promise<T> {
    if (response.status === 204) {
      return undefined as T;
    }

    const data = await response.json();

    if (!response.ok) {
      const error = data as ODataError;
      if (error.error) {
        throw new ODataException(error.error);
      }
      throw new HttpError(response);
    }

    return data as T;
  }

  private formatKey(key: string | number | Record<string, unknown>): string {
    if (typeof key === 'string') {
      return `'${key.replace(/'/g, "''")}'`;
    }
    if (typeof key === 'number') {
      return key.toString();
    }
    // Composite key
    return Object.entries(key)
      .map(([k, v]) => `${k}=${this.formatKeyValue(v)}`)
      .join(',');
  }

  private formatKeyValue(value: unknown): string {
    if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
    if (value === null) return 'null';
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }

  private buildQueryString(options: ODataQueryOptions): string {
    const params: string[] = [];

    if (options.$select) {
      const select = Array.isArray(options.$select) ? options.$select.join(',') : options.$select;
      params.push(`$select=${encodeURIComponent(select)}`);
    }

    if (options.$expand) {
      const expand = this.formatExpand(options.$expand);
      params.push(`$expand=${encodeURIComponent(expand)}`);
    }

    if (options.$filter) {
      const filter = typeof options.$filter === 'string'
        ? options.$filter
        : this.formatFilterExpression(options.$filter);
      params.push(`$filter=${encodeURIComponent(filter)}`);
    }

    if (options.$orderby) {
      const orderby = this.formatOrderBy(options.$orderby);
      params.push(`$orderby=${encodeURIComponent(orderby)}`);
    }

    if (options.$top !== undefined) {
      params.push(`$top=${options.$top}`);
    }

    if (options.$skip !== undefined) {
      params.push(`$skip=${options.$skip}`);
    }

    if (options.$count !== undefined) {
      params.push(`$count=${options.$count}`);
    }

    if (options.$search) {
      params.push(`$search=${encodeURIComponent(options.$search)}`);
    }

    if (options.$format) {
      params.push(`$format=${options.$format}`);
    }

    // Custom parameters
    for (const [key, value] of Object.entries(options)) {
      if (!key.startsWith('$') && value !== undefined) {
        params.push(`${key}=${encodeURIComponent(String(value))}`);
      }
    }

    return params.join('&');
  }

  private formatExpand(expand: string | string[] | ExpandOption[]): string {
    if (typeof expand === 'string') return expand;
    if (Array.isArray(expand)) {
      return expand.map((e) => {
        if (typeof e === 'string') return e;
        return this.formatExpandOption(e);
      }).join(',');
    }
    return '';
  }

  private formatExpandOption(option: ExpandOption): string {
    let result = option.property;
    const nested: string[] = [];

    if (option.select) nested.push(`$select=${option.select.join(',')}`);
    if (option.filter) {
      const filter = typeof option.filter === 'string'
        ? option.filter
        : this.formatFilterExpression(option.filter);
      nested.push(`$filter=${filter}`);
    }
    if (option.orderby) nested.push(`$orderby=${this.formatOrderBy(option.orderby)}`);
    if (option.top !== undefined) nested.push(`$top=${option.top}`);
    if (option.skip !== undefined) nested.push(`$skip=${option.skip}`);
    if (option.count !== undefined) nested.push(`$count=${option.count}`);
    if (option.expand) nested.push(`$expand=${this.formatExpand(option.expand)}`);

    if (nested.length > 0) {
      result += `(${nested.join(';')})`;
    }

    return result;
  }

  private formatOrderBy(orderby: string | OrderByOption[]): string {
    if (typeof orderby === 'string') return orderby;
    return orderby.map((o) => `${o.property} ${o.direction ?? 'asc'}`).join(',');
  }

  private formatFilterExpression(filter: FilterExpression): string {
    if (filter.raw) return filter.raw;

    const parts: string[] = [];

    if (filter.eq) parts.push(`${filter.eq[0]} eq ${this.formatFilterValue(filter.eq[1])}`);
    if (filter.ne) parts.push(`${filter.ne[0]} ne ${this.formatFilterValue(filter.ne[1])}`);
    if (filter.gt) parts.push(`${filter.gt[0]} gt ${this.formatFilterValue(filter.gt[1])}`);
    if (filter.ge) parts.push(`${filter.ge[0]} ge ${this.formatFilterValue(filter.ge[1])}`);
    if (filter.lt) parts.push(`${filter.lt[0]} lt ${this.formatFilterValue(filter.lt[1])}`);
    if (filter.le) parts.push(`${filter.le[0]} le ${this.formatFilterValue(filter.le[1])}`);
    if (filter.contains) parts.push(`contains(${filter.contains[0]},'${filter.contains[1]}')`);
    if (filter.startswith) parts.push(`startswith(${filter.startswith[0]},'${filter.startswith[1]}')`);
    if (filter.endswith) parts.push(`endswith(${filter.endswith[0]},'${filter.endswith[1]}')`);

    if (filter.and) {
      const andParts = filter.and.map((f) => this.formatFilterExpression(f));
      parts.push(`(${andParts.join(' and ')})`);
    }

    if (filter.or) {
      const orParts = filter.or.map((f) => this.formatFilterExpression(f));
      parts.push(`(${orParts.join(' or ')})`);
    }

    if (filter.not) {
      parts.push(`not (${this.formatFilterExpression(filter.not)})`);
    }

    return parts.join(' and ');
  }

  private formatFilterValue(value: unknown): string {
    if (value === null) return 'null';
    if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
    if (typeof value === 'boolean') return value.toString();
    if (typeof value === 'number') return value.toString();
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }

  private parseBatchResponse(responseText: string): Array<{ status: number; body: unknown }> {
    const results: Array<{ status: number; body: unknown }> = [];

    // Extract boundary from response
    const boundaryMatch = responseText.match(/--batch[^\r\n]+/);
    if (!boundaryMatch) return results;

    const boundary = boundaryMatch[0];
    const parts = responseText.split(boundary).slice(1, -1);

    for (const part of parts) {
      const statusMatch = part.match(/HTTP\/\d\.\d\s+(\d+)/);
      const bodyMatch = part.match(/\r\n\r\n({[\s\S]*})/);

      results.push({
        status: statusMatch ? parseInt(statusMatch[1], 10) : 0,
        body: bodyMatch ? JSON.parse(bodyMatch[1]) : null,
      });
    }

    return results;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createODataClient(client: Client, options: ODataOptions): ODataClient {
  return new ODataClient(client, options);
}

/**
 * OData plugin that adds odata() method to client
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   plugins: [odata()]
 * });
 *
 * const od = client.odata('https://services.odata.org/V4/Northwind/Northwind.svc');
 * const products = await od.query('Products').top(10).get();
 * ```
 */
export function odata() {
  return (client: Client) => {
    (client as Client & { odata: (serviceRoot: string, options?: Omit<ODataOptions, 'serviceRoot'>) => ODataClient }).odata = (
      serviceRoot: string,
      options?: Omit<ODataOptions, 'serviceRoot'>
    ) => {
      return createODataClient(client, { serviceRoot, ...options });
    };
  };
}

// Type augmentation for Client
declare module '../core/client.js' {
  interface Client {
    odata(serviceRoot: string, options?: Omit<ODataOptions, 'serviceRoot'>): ODataClient;
  }
}
