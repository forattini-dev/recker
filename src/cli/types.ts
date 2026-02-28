import type { ClientOptions, Method, RequestOptions } from '../types/index.js';

export type CliRequestHeaders = Record<string, string>;

export type CliRequestOptions = Omit<RequestOptions, 'method' | 'headers' | 'body'> & {
  method: Method;
  url: string;
  headers?: CliRequestHeaders;
  body?: RequestOptions['json'] | RequestOptions['body'];
  verbose?: boolean;
  quiet?: boolean;
  output?: string;
  clientOptions?: ClientOptions;
};

