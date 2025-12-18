/**
 * Parsing MCP Tools
 *
 * Provides MCP tools for GraphQL, JSON-RPC, CSV, YAML, and XML parsing and serialization.
 */

import type { MCPTool, MCPToolResult } from '../types.js';
import type { MCPToolHandler } from './registry.js';
import { createClient } from '../../core/client.js';
import { graphql } from '../../plugins/graphql.js';
import { createJsonRpcClient } from '../../plugins/jsonrpc.js';
import { parseCsv, serializeCsv } from '../../plugins/csv.js';
import { parseYaml, serializeYaml } from '../../plugins/yaml.js';
import { parseXML, serializeXML } from '../../plugins/xml.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: MCPTool['inputSchema'];
  handler: MCPToolHandler;
}

// ============================================================================
// GraphQL Tools
// ============================================================================

export const graphqlQueryTool: ToolDefinition = {
  name: 'rek_graphql_query',
  description:
    'Execute a GraphQL query or mutation against a GraphQL endpoint. Supports variables and operation names.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string',
        description: 'GraphQL endpoint URL',
      },
      query: {
        type: 'string',
        description: 'GraphQL query or mutation string',
      },
      variables: {
        type: 'object',
        additionalProperties: true,
        description: 'Variables to pass to the query',
      },
      headers: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Custom headers (e.g., Authorization)',
      },
    },
    required: ['url', 'query'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const url = args.url as string;
    const query = args.query as string;
    const variables = (args.variables as Record<string, unknown>) || {};
    const headers = (args.headers as Record<string, string>) || {};

    const client = createClient({
      baseUrl: url,
      headers,
    });

    try {
      const data = await graphql(client, query, variables);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                data,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const errorDetails: Record<string, unknown> = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };

      // Include GraphQL errors if available
      if (error && typeof error === 'object' && 'errors' in error) {
        errorDetails.graphqlErrors = (error as { errors: unknown[] }).errors;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(errorDetails, null, 2),
          },
        ],
        isError: true,
      };
    }
  },
};

export const graphqlIntrospectTool: ToolDefinition = {
  name: 'rek_graphql_introspect',
  description:
    'Introspect a GraphQL schema to discover available types, queries, mutations, and subscriptions.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string',
        description: 'GraphQL endpoint URL',
      },
      headers: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Custom headers (e.g., Authorization)',
      },
    },
    required: ['url'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const url = args.url as string;
    const headers = (args.headers as Record<string, string>) || {};

    const introspectionQuery = `
      query IntrospectionQuery {
        __schema {
          queryType { name }
          mutationType { name }
          subscriptionType { name }
          types {
            name
            kind
            description
            fields {
              name
              description
              args { name type { name kind } }
              type { name kind ofType { name kind } }
            }
          }
        }
      }
    `;

    const client = createClient({
      baseUrl: url,
      headers,
    });

    try {
      const data = await graphql(client, introspectionQuery);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                schema: data,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  },
};

// ============================================================================
// JSON-RPC Tools
// ============================================================================

export const jsonrpcCallTool: ToolDefinition = {
  name: 'rek_jsonrpc_call',
  description:
    'Make a JSON-RPC 2.0 call to a remote endpoint. Supports positional and named parameters.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string',
        description: 'JSON-RPC endpoint URL',
      },
      method: {
        type: 'string',
        description: 'Remote method name to call',
      },
      params: {
        oneOf: [
          { type: 'array', description: 'Positional parameters' },
          { type: 'object', description: 'Named parameters' },
        ],
        description: 'Method parameters (array for positional, object for named)',
      },
      headers: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Custom headers',
      },
    },
    required: ['url', 'method'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const url = args.url as string;
    const method = args.method as string;
    const params = args.params as unknown[] | Record<string, unknown> | undefined;
    const headers = (args.headers as Record<string, string>) || {};

    const client = createClient({
      baseUrl: url,
      headers,
    });

    const rpc = createJsonRpcClient(client, { endpoint: '' });

    try {
      const result = await rpc.call(method, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                result,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const errorDetails: Record<string, unknown> = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };

      // Include JSON-RPC error code if available
      if (error && typeof error === 'object' && 'code' in error) {
        errorDetails.code = (error as { code: number }).code;
        errorDetails.data = (error as { data?: unknown }).data;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(errorDetails, null, 2),
          },
        ],
        isError: true,
      };
    }
  },
};

export const jsonrpcBatchTool: ToolDefinition = {
  name: 'rek_jsonrpc_batch',
  description: 'Make multiple JSON-RPC 2.0 calls in a single batch request for better performance.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string',
        description: 'JSON-RPC endpoint URL',
      },
      requests: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            method: { type: 'string', description: 'Method name' },
            params: {
              oneOf: [{ type: 'array' }, { type: 'object' }],
              description: 'Method parameters',
            },
            id: {
              oneOf: [{ type: 'string' }, { type: 'number' }],
              description: 'Request ID',
            },
          },
          required: ['method'],
        },
        description: 'Array of RPC requests to execute',
      },
      headers: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Custom headers',
      },
    },
    required: ['url', 'requests'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const url = args.url as string;
    const requests = args.requests as Array<{
      method: string;
      params?: unknown[] | Record<string, unknown>;
      id?: string | number;
    }>;
    const headers = (args.headers as Record<string, string>) || {};

    const client = createClient({
      baseUrl: url,
      headers,
    });

    const rpc = createJsonRpcClient(client, { endpoint: '' });

    try {
      const batchResult = await rpc.batch(requests);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                hasErrors: batchResult.hasErrors,
                responses: batchResult.responses,
                errors: batchResult.errors,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  },
};

// ============================================================================
// CSV Tools
// ============================================================================

export const csvParseTool: ToolDefinition = {
  name: 'rek_csv_parse',
  description: 'Parse a CSV string into an array of objects or arrays.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      csv: {
        type: 'string',
        description: 'CSV content to parse',
      },
      delimiter: {
        type: 'string',
        description: 'Field delimiter (default: ,)',
      },
      headers: {
        type: 'boolean',
        description: 'First row contains headers (default: true)',
      },
      skipEmptyLines: {
        type: 'boolean',
        description: 'Skip empty lines (default: true)',
      },
    },
    required: ['csv'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const csv = args.csv as string;
    const delimiter = (args.delimiter as string) || ',';
    const hasHeaders = args.headers !== false;
    const skipEmptyLines = args.skipEmptyLines !== false;

    try {
      const result = parseCsv(csv, {
        delimiter,
        headers: hasHeaders,
        skipEmptyLines,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                rowCount: result.length,
                data: result,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  },
};

export const csvSerializeTool: ToolDefinition = {
  name: 'rek_csv_serialize',
  description: 'Serialize an array of objects or arrays into a CSV string.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      data: {
        type: 'array',
        items: {
          oneOf: [
            { type: 'object', additionalProperties: true },
            { type: 'array' },
          ],
        },
        description: 'Array of objects or arrays to serialize',
      },
      delimiter: {
        type: 'string',
        description: 'Field delimiter (default: ,)',
      },
      headers: {
        type: 'boolean',
        description: 'Include header row (default: true)',
      },
      columns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Column names/order (auto-detected if not provided)',
      },
    },
    required: ['data'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const data = args.data as Array<Record<string, unknown> | unknown[]>;
    const delimiter = (args.delimiter as string) || ',';
    const includeHeaders = args.headers !== false;
    const columns = args.columns as string[] | undefined;

    try {
      const csv = serializeCsv(data, {
        delimiter,
        headers: includeHeaders,
        columns,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                csv,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  },
};

// ============================================================================
// YAML Tools
// ============================================================================

export const yamlParseTool: ToolDefinition = {
  name: 'rek_yaml_parse',
  description: 'Parse a YAML string into a JavaScript object.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      yaml: {
        type: 'string',
        description: 'YAML content to parse',
      },
      allowDuplicateKeys: {
        type: 'boolean',
        description: 'Allow duplicate keys (default: false)',
      },
    },
    required: ['yaml'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const yaml = args.yaml as string;
    const allowDuplicateKeys = args.allowDuplicateKeys as boolean | undefined;

    try {
      const result = parseYaml(yaml, { allowDuplicateKeys });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                data: result,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  },
};

export const yamlSerializeTool: ToolDefinition = {
  name: 'rek_yaml_serialize',
  description: 'Serialize a JavaScript object into a YAML string.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      data: {
        oneOf: [{ type: 'object' }, { type: 'array' }],
        description: 'Data to serialize to YAML',
      },
      indent: {
        type: 'number',
        description: 'Indentation spaces (default: 2)',
      },
      lineWidth: {
        type: 'number',
        description: 'Line width before wrapping (default: 80)',
      },
    },
    required: ['data'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const data = args.data;
    const indent = (args.indent as number) || 2;
    const lineWidth = (args.lineWidth as number) || 80;

    try {
      const yaml = serializeYaml(data, {
        indent,
        lineWidth,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                yaml,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  },
};

// ============================================================================
// XML Tools
// ============================================================================

export const xmlParseTool: ToolDefinition = {
  name: 'rek_xml_parse',
  description: 'Parse an XML string into a JavaScript object.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      xml: {
        type: 'string',
        description: 'XML content to parse',
      },
    },
    required: ['xml'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const xml = args.xml as string;

    try {
      const result = parseXML(xml);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                data: result,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  },
};

export const xmlSerializeTool: ToolDefinition = {
  name: 'rek_xml_serialize',
  description: 'Serialize a JavaScript object into an XML string.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      data: {
        type: 'object',
        additionalProperties: true,
        description: 'Object to serialize to XML',
      },
      rootName: {
        type: 'string',
        description: 'Root element name (default: root)',
      },
    },
    required: ['data'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const data = args.data as Record<string, unknown>;
    const rootName = (args.rootName as string) || 'root';

    try {
      const xml = serializeXML(data, rootName);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                xml,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  },
};

// ============================================================================
// Export all tools
// ============================================================================

export const parsingTools: ToolDefinition[] = [
  graphqlQueryTool,
  graphqlIntrospectTool,
  jsonrpcCallTool,
  jsonrpcBatchTool,
  csvParseTool,
  csvSerializeTool,
  yamlParseTool,
  yamlSerializeTool,
  xmlParseTool,
  xmlSerializeTool,
];
