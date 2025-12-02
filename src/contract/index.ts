/**
 * Contract Module
 * Type-safe API contracts with Zod validation
 *
 * Requires: pnpm add zod
 */

import type { z, ZodSchema } from 'zod';
import { Client } from '../core/client.js';
import type { Method } from '../types/index.js';
import { HttpError } from '../core/errors.js';

export interface ContractEndpoint {
  method: Method;
  path: string;
  params?: ZodSchema; // Query params AND Path params mixed (Client handles separation)
  body?: ZodSchema;
  response?: ZodSchema;
  errors?: Record<number, ZodSchema>; // Status Code -> Schema
}

export type ContractDefinition = Record<string, ContractEndpoint>;

// Helper to extract Zod type or unknown
type InferZod<T> = T extends ZodSchema ? z.infer<T> : unknown;

// Helper to build the function signature for an endpoint
type EndpointFunction<T extends ContractEndpoint> = (
  args: (T['params'] extends ZodSchema ? { params: z.infer<T['params']> } : {}) &
        (T['body'] extends ZodSchema ? { body: z.infer<T['body']> } : {}) &
        { headers?: HeadersInit } // Allow overriding headers
) => Promise<T['response'] extends ZodSchema ? z.infer<T['response']> : unknown>;

// The resulting client type
export type ContractClient<T extends ContractDefinition> = {
  [K in keyof T]: EndpointFunction<T[K]>;
};

export class ContractError extends Error {
  constructor(public status: number, public data: any, public originalError: HttpError) {
    super(`Contract Error ${status}: ${JSON.stringify(data)}`);
    this.name = 'ContractError';
  }
}

export function createContract<T extends ContractDefinition>(
  client: Client,
  contract: T
): ContractClient<T> {
  const proxy = {} as any;

  for (const [key, endpoint] of Object.entries(contract)) {
    proxy[key] = async (args: any = {}) => {
      // 1. Validate Params (Query + Path)
      let finalParams = args.params;
      if (endpoint.params) {
        finalParams = endpoint.params.parse(args.params);
      }

      // 2. Validate Body
      let finalBody = args.body;
      if (endpoint.body) {
        finalBody = endpoint.body.parse(args.body);
      }

      // 2.1 Smart Body Serialization (similar to Client.post)
      const headers = new Headers(args.headers);
      if (finalBody && typeof finalBody === 'object' && 
          !(finalBody instanceof Blob) && 
          !(finalBody instanceof FormData) && 
          !(finalBody instanceof URLSearchParams)) {
          
          if (!headers.has('Content-Type')) {
              headers.set('Content-Type', 'application/json');
          }
          finalBody = JSON.stringify(finalBody);
      }

      // 3. Execute Request
      try {
        const request = client.request(endpoint.path, {
            method: endpoint.method,
            params: finalParams,
            body: finalBody,
            headers: headers,
        });

        // 4. Parse Response or return JSON
        if (endpoint.response) {
            return await request.parse(endpoint.response);
        }
        return await request.json();

      } catch (err: any) {
          // 5. Handle Typed Errors
          if (endpoint.errors && err instanceof HttpError && err.response) {
              const schema = endpoint.errors[err.status];
              if (schema) {
                  let parsedError;
                  try {
                      const errorBody = await err.response.json();
                      parsedError = schema.parse(errorBody);
                  } catch (parseErr) {
                      // If parsing fails, throw original HttpError
                      throw err;
                  }
                  
                  // Throw typed ContractError if parsing succeeded
                  throw new ContractError(err.status, parsedError, err);
              }
          }
          throw err;
      }
    };
  }

  return proxy;
}