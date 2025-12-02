import { ReckerResponse, SSEEvent, ProgressEvent } from '../types/index.js';
import type { ZodSchema } from 'zod';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { tryFn } from '../utils/try-fn.js';
import { StreamError } from './errors.js';

export class RequestPromise<T = unknown> implements Promise<ReckerResponse<T>> {
  private promise: Promise<ReckerResponse<T>>;
  private abortController?: AbortController;

  constructor(promise: Promise<ReckerResponse<T>>, abortController?: AbortController) {
    this.promise = promise;
    this.abortController = abortController;
  }

  get [Symbol.toStringTag]() {
    return 'RequestPromise';
  }

  then<TResult1 = ReckerResponse<T>, TResult2 = never>(
    onfulfilled?: ((value: ReckerResponse<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<ReckerResponse<T> | TResult> {
    return this.promise.catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<ReckerResponse<T>> {
    return this.promise.finally(onfinally);
  }

  // Extended methods
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  async json<R = T>(): Promise<R> {
    const response = await this.promise;
    return response.json<R>();
  }

  async text(): Promise<string> {
    const response = await this.promise;
    return response.text();
  }

  async cleanText(): Promise<string> {
    const response = await this.promise;
    return response.cleanText();
  }

  async blob(): Promise<Blob> {
    const response = await this.promise;
    return response.blob();
  }

  async read(): Promise<ReadableStream<Uint8Array> | null> {
    const response = await this.promise;
    return response.read();
  }

  async write(path: string): Promise<void> {
    const response = await this.promise;
    const body = response.read();
    if (!body) {
      throw new StreamError(
        'Response has no body to write',
        {
          streamType: 'response',
          retriable: true,
        }
      );
    }
    
    // Convert Web Stream to Node Stream
    // @ts-ignore - Readable.fromWeb exists in recent Node versions but types might lag
    const nodeStream = Readable.fromWeb(body as any);
    const fileStream = createWriteStream(path);
    
    await pipeline(nodeStream, fileStream);
  }

  async parse<R>(schema: ZodSchema<R>): Promise<R> {
    const data = await this.json<R>(); // Get the JSON data first
    return schema.parse(data); // Then parse it with Zod
  }

  async safe(): Promise<[boolean, Error | null, T | undefined]> {
      // By default safe() assumes JSON response, as that's the most common case for structural data
      return tryFn<T>(() => this.json<T>());
  }

  async *sse(): AsyncGenerator<SSEEvent> {
    const response = await this.promise;
    yield* response.sse();
  }

  async *download(): AsyncGenerator<ProgressEvent> {
    const response = await this.promise;
    yield* response.download();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
    const response = await this.promise;
    yield* response;
  }
}
