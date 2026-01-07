/**
 * Template MCP Tools
 *
 * Provides MCP tools for template rendering, validation, and parsing.
 */

import type { MCPTool, MCPToolResult } from '../types.js';
import type { MCPToolHandler } from './registry.js';
import {
  template,
  TemplateEngine,
  parse,
  validate,
  extractVariables,
  hasTemplateExpressions,
} from '../../template/index.js';
import type { TemplateFormat } from '../../template/types.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: MCPTool['inputSchema'];
  handler: MCPToolHandler;
}

// ============================================================================
// Template Render Tool
// ============================================================================

export const templateRenderTool: ToolDefinition = {
  name: 'rek_template_render',
  description:
    'Render a template string with the provided context. Supports {{variable}}, {{#if}}, {{#each}}, pipe filters, and 50+ built-in helpers.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      template: {
        type: 'string',
        description: 'Template string with {{expressions}}',
      },
      context: {
        type: 'object',
        additionalProperties: true,
        description: 'Data context for template variables',
      },
      format: {
        type: 'string',
        enum: ['raw', 'json', 'html', 'xml', 'url', 'csv'],
        default: 'raw',
        description: 'Output format for escaping (raw, json, html, xml, url, csv)',
      },
      strict: {
        type: 'boolean',
        default: false,
        description: 'Throw on undefined variables',
      },
    },
    required: ['template'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const templateStr = args.template as string;
    const context = (args.context as Record<string, unknown>) || {};
    const format = (args.format as TemplateFormat) || 'raw';
    const strict = args.strict === true;

    try {
      const engine = new TemplateEngine({ format, strict });
      const result = await engine.render(templateStr, context);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                result,
                format,
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
      };
    }
  },
};

// ============================================================================
// Template Validate Tool
// ============================================================================

export const templateValidateTool: ToolDefinition = {
  name: 'rek_template_validate',
  description:
    'Validate a template string for syntax errors. Returns validation result with errors and warnings.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      template: {
        type: 'string',
        description: 'Template string to validate',
      },
    },
    required: ['template'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const templateStr = args.template as string;

    try {
      const result = validate(templateStr);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                valid: result.valid,
                errors: result.errors,
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
                valid: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  },
};

// ============================================================================
// Template Parse Tool
// ============================================================================

export const templateParseTool: ToolDefinition = {
  name: 'rek_template_parse',
  description:
    'Parse a template string into an AST (Abstract Syntax Tree). Useful for analyzing template structure.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      template: {
        type: 'string',
        description: 'Template string to parse',
      },
    },
    required: ['template'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const templateStr = args.template as string;

    try {
      const ast = parse(templateStr);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                ast,
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
      };
    }
  },
};

// ============================================================================
// Template Variables Tool
// ============================================================================

export const templateVariablesTool: ToolDefinition = {
  name: 'rek_template_variables',
  description:
    'Extract all variable names used in a template. Useful for understanding required context.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      template: {
        type: 'string',
        description: 'Template string to analyze',
      },
    },
    required: ['template'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const templateStr = args.template as string;

    try {
      const variables = extractVariables(templateStr);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                variables,
                count: variables.length,
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
      };
    }
  },
};

// ============================================================================
// Template Check Tool
// ============================================================================

export const templateCheckTool: ToolDefinition = {
  name: 'rek_template_check',
  description:
    'Check if a string contains template expressions ({{...}}). Fast detection without parsing.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      text: {
        type: 'string',
        description: 'Text to check for template expressions',
      },
    },
    required: ['text'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const text = args.text as string;
    const hasExpressions = hasTemplateExpressions(text);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              hasExpressions,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

// ============================================================================
// Template Helpers List Tool
// ============================================================================

export const templateHelpersTool: ToolDefinition = {
  name: 'rek_template_helpers',
  description:
    'List all available template helpers by category. Returns helper names and descriptions.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      category: {
        type: 'string',
        description: 'Filter by category (core, comparison, logic, string, crypto, date, env, utility)',
      },
    },
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const category = args.category as string | undefined;

    const helpers: Record<string, string[]> = {
      core: ['if', 'unless', 'each', 'with', 'range'],
      comparison: ['eq', 'ne', 'lt', 'lte', 'gt', 'gte'],
      logic: ['and', 'or', 'not'],
      string: [
        'uppercase', 'lowercase', 'capitalize', 'titleCase',
        'camelCase', 'snakeCase', 'kebabCase', 'pascalCase',
        'trim', 'trimStart', 'trimEnd',
        'replace', 'replaceAll', 'split', 'join', 'concat',
        'substring', 'truncate', 'padStart', 'padEnd',
        'repeat', 'reverse',
      ],
      crypto: [
        'base64', 'base64decode', 'hex', 'hexDecode',
        'hash', 'hmac', 'uuid', 'randomInt', 'randomString', 'randomBytes',
      ],
      date: [
        'timestamp', 'timestampMs', 'now', 'today',
        'date', 'dateAdd', 'dateSub', 'dateDiff',
      ],
      env: ['env', 'envRequired', 'hasEnv', 'ifEnv'],
      utility: ['json', 'len', 'default', 'coalesce', 'typeof', 'lookup'],
    };

    const result = category && helpers[category]
      ? { [category]: helpers[category] }
      : helpers;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
};

// ============================================================================
// Export All Tools
// ============================================================================

export const templateTools: ToolDefinition[] = [
  templateRenderTool,
  templateValidateTool,
  templateParseTool,
  templateVariablesTool,
  templateCheckTool,
  templateHelpersTool,
];

export const tools: MCPTool[] = templateTools.map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: t.inputSchema,
  category: 'template',
}));

export const handlers: Record<string, MCPToolHandler> = Object.fromEntries(
  templateTools.map((t) => [t.name, t.handler])
);
