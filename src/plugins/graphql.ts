import { Plugin, Middleware, ReckerRequest, ReckerResponse } from '../types/index.js';
import { Client } from '../core/client.js';

export class GraphQLError extends Error {
  constructor(public errors: any[], public response: ReckerResponse) {
    super(errors[0].message);
    this.name = 'GraphQLError';
  }
}

export interface GraphQLOptions {
  /** Automatically throw GraphQLError if response contains "errors" array (default: true) */
  throwOnErrors?: boolean;
}

/**
 * Plugin to handle GraphQL specific behavior:
 * 1. Parse 200 OK responses that contain "errors" field.
 * 2. Throw typed GraphQLError.
 */
export function graphqlPlugin(options: GraphQLOptions = {}): Plugin {
  const throwOnErrors = options.throwOnErrors !== false;

  const middleware: Middleware = async (req, next) => {
    const res = await next(req);

    // Only check JSON responses
    const contentType = res.headers.get('content-type');
    if (throwOnErrors && contentType && contentType.includes('application/json')) {
        // Clone response to inspect body without consuming it for the user
        const clone = res.clone();
        try {
            const body = await clone.json<any>();
            if (body && Array.isArray(body.errors) && body.errors.length > 0) {
                throw new GraphQLError(body.errors, res);
            }
        } catch (err) {
            // Ignore parsing errors here, let user handle it or let it fail later
            if (err instanceof GraphQLError) throw err;
        }
    }

    return res;
  };

  return (client) => {
    client.use(middleware);
  };
}

/**
 * Helper to make GraphQL requests cleaner.
 * 
 * @example
 * const data = await graphql(client, 'query { users { name } }', { limit: 10 });
 */
export async function graphql<T = any>(
    client: Client, 
    query: string, 
    variables: Record<string, any> = {},
    options: any = {} // RequestOptions
): Promise<T> {
    const body = { query, variables };
    const res = await client.post('', body, options).json<{ data: T }>();
    return res.data;
}
