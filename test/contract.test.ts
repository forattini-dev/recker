import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createClient } from '../src/core/client.js';
import { createContract } from '../src/contract/index.js';
import { ReckerRequest } from '../src/types/index.js';

// Simple Mock Transport
class LocalMockTransport {
    async dispatch(req: ReckerRequest) {
        let body = {};
        
        // Mock response based on path
        if (req.url.includes('/users/123')) {
            body = { id: '123', name: 'Alice', role: 'admin' };
        } else if (req.url.includes('/users') && req.method === 'POST') {
             // Echo back body
             if (req.body) {
                 body = JSON.parse(req.body as string);
                 (body as any).id = '999';
             }
        }

        return {
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            url: req.url,
            json: async () => body,
            text: async () => JSON.stringify(body),
            raw: {} as any,
            clone: () => this as any
        } as any;
    }
}

describe('Contract Client', () => {
  const client = createClient({
      baseUrl: 'https://api.example.com',
      transport: new LocalMockTransport()
  });

  const UserSchema = z.object({
      id: z.string(),
      name: z.string(),
      role: z.enum(['admin', 'user'])
  });

  const CreateUserSchema = z.object({
      name: z.string(),
      role: z.enum(['admin', 'user'])
  });

  const contract = createContract(client, {
      getUser: {
          method: 'GET',
          path: '/users/:id',
          params: z.object({ id: z.string() }),
          response: UserSchema
      },
      createUser: {
          method: 'POST',
          path: '/users',
          body: CreateUserSchema,
          response: UserSchema
      }
  });

  it('should execute getUser with typed params and response', async () => {
      const user = await contract.getUser({ params: { id: '123' } });
      
      expect(user).toEqual({ id: '123', name: 'Alice', role: 'admin' });
      // Type check (static analysis verification)
      // user.name; // valid
  });

  it('should execute createUser with typed body', async () => {
      const newUser = await contract.createUser({ 
          body: { name: 'Bob', role: 'user' } 
      });

      expect(newUser).toEqual({ id: '999', name: 'Bob', role: 'user' });
  });

  it('should validate input params (runtime check)', async () => {
      // @ts-expect-error - testing runtime validation
      const promise = contract.getUser({ params: { id: 123 } }); 
      
      await expect(promise).rejects.toThrow(); // Zod validation error
  });

  it('should validate input body (runtime check)', async () => {
      // @ts-expect-error - testing runtime validation
      const promise = contract.createUser({ body: { name: 'Bad', role: 'invalid' } });
      
      await expect(promise).rejects.toThrow();
  });
});
