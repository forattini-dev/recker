import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { createClient } from '../../src/core/client.js';
import { createContract, ContractError } from '../../src/contract/index.js';
import { HttpError } from '../../src/core/errors.js';

describe('Contract Module', () => {
  const mockClient = createClient({ baseUrl: 'https://api.example.com' });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a typed client from contract', async () => {
    // Mock implementation for this test
    vi.spyOn(mockClient, 'request').mockImplementation((path, options) => {
      return {
        parse: async (schema: any) => {
          // The contract passes the path template and params to client.request
          // URL building happens INSIDE client.request, which we mocked out.
          // So we check the path template and the params object.
          if (path === '/users/:id' && options?.params?.id === 123 && options?.method === 'GET') {
            return schema.parse({ id: 123, name: 'Test User' });
          }
          return {};
        },
        json: async () => ({}),
      } as any;
    });

    const contract = {
      getUser: {
        method: 'GET' as const,
        path: '/users/:id',
        params: z.object({
          id: z.coerce.number(),
        }),
        response: z.object({
          id: z.number(),
          name: z.string(),
        }),
      },
    };

    const api = createContract(mockClient, contract);

    // Test GET with path param substitution
    const user = await api.getUser({ params: { id: 123 } });
    expect(user).toEqual({ id: 123, name: 'Test User' });
  });

  it('should handle POST requests with body', async () => {
     vi.spyOn(mockClient, 'request').mockImplementation((path, options) => {
      return {
        parse: async (schema: any) => {
           if (path === '/users' && options?.method === 'POST') {
             // Verify body was stringified
             const body = JSON.parse(options.body as string);
             return schema.parse({ id: 456, name: body.name });
           }
           throw new Error('Unexpected request');
        }
      } as any;
    });

    const contract = {
      createUser: {
        method: 'POST' as const,
        path: '/users',
        body: z.object({
          name: z.string(),
        }),
        response: z.object({
          id: z.number(),
          name: z.string(),
        }),
      }
    };

    const api = createContract(mockClient, contract);
    const newUser = await api.createUser({ body: { name: 'New User' } });
    expect(newUser).toEqual({ id: 456, name: 'New User' });
  });

  it('should validate params before request', async () => {
    const contract = {
      getUser: {
        method: 'GET' as const,
        path: '/users/:id',
        params: z.object({
          id: z.number(), // strict number
        }),
      }
    };
    const api = createContract(mockClient, contract);

    await expect(api.getUser({ params: { id: '123' as any } }))
      .rejects.toThrow(z.ZodError);
  });

  it('should validate body before request', async () => {
     const contract = {
      createUser: {
        method: 'POST' as const,
        path: '/users',
        body: z.object({
          name: z.string().min(3),
        }),
      }
    };
    const api = createContract(mockClient, contract);

    await expect(api.createUser({ body: { name: 'Jo' } }))
      .rejects.toThrow(z.ZodError);
  });

  it('should handle typed errors', async () => {
    vi.spyOn(mockClient, 'request').mockImplementation(() => {
      return {
        parse: async () => {
           // Simulate HttpError with full response object
           const errorResponse = {
             status: 404,
             statusText: 'Not Found',
             json: async () => ({ code: 'NOT_FOUND', message: 'User not found' }),
           };
           // Pass mocked response to HttpError
           const error = new HttpError(errorResponse as any, {} as any);
           throw error;
        }
      } as any;
    });

    const contract = {
      getUser: {
        method: 'GET' as const,
        path: '/users/:id',
        response: z.any(),
        errors: {
          404: z.object({
            code: z.string(),
            message: z.string(),
          }),
        },
      },
    };

    const api = createContract(mockClient, contract);

    try {
      await api.getUser({ params: { id: 1 } });
      expect.fail('Should have thrown ContractError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ContractError);
      expect(err.status).toBe(404);
      expect(err.data).toEqual({ code: 'NOT_FOUND', message: 'User not found' });
    }
  });
});
