import { Plugin, Middleware, ReckerRequest, ReckerResponse } from '../types/index.js';
import { Client } from '../core/client.js';
import { ReckerError } from '../core/errors.js';

export class GraphQLError extends ReckerError {
  constructor(public errors: any[], public response: ReckerResponse, request?: ReckerRequest) {
    const message = errors?.[0]?.message || 'GraphQL response contains errors';
    const suggestions = [
      'Check the GraphQL query and variables for schema compliance.',
      'Inspect the GraphQL errors array for details.',
      'Fix validation errors before retrying; network errors may be retriable.'
    ];
    super(message, request, response, suggestions, false);
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
 * const data = await graphql(client, 'query GetUser { users { name } }', { limit: 10 });
 */
export async function graphql<T = any>(
    client: Client, 
    query: string, 
    variables: Record<string, any> = {},
    options: any = {} // RequestOptions
): Promise<T> {
    // Extract operation name if present (simple regex)
    const opMatch = query.match(/(query|mutation|subscription)\s+([a-zA-Z0-9_]+)/);
    const operationName = opMatch ? opMatch[2] : undefined;

    const payload = { query, variables, operationName };

    // Use GET if configured, otherwise default to POST
    if (options.method === 'GET') {
        // For GET, variables must be JSON stringified in query params
        const params = {
            query,
            variables: JSON.stringify(variables),
            ...(operationName && { operationName })
        };
        // Merge with existing params
        options.params = { ...options.params, ...params };
        const res = await client.get('', options).json<{ data: T }>();
        return res.data;
    }

    const res = await client.post('', payload, options).json<{ data: T }>();
    return res.data;
}
