import type { MCPTool, MCPToolResult } from '../types.js';
import { matchesPattern } from '../profiles.js';

export type MCPToolHandler = (args: Record<string, unknown>) => Promise<MCPToolResult>;

export interface ToolModule {
  tools: MCPTool[];
  handlers: Record<string, MCPToolHandler>;
}

/**
 * Registry for managing MCP tools and their handlers.
 */
export class ToolRegistry {
  private tools: Map<string, MCPTool> = new Map();
  private handlers: Map<string, MCPToolHandler> = new Map();
  private enabledPatterns: string[] = [];

  constructor() {}

  /**
   * Set patterns for enabled tools (from profiles)
   * Empty array means all tools are enabled
   */
  setEnabledPatterns(patterns: string[]): void {
    this.enabledPatterns = patterns;
  }

  /**
   * Get current enabled patterns
   */
  getEnabledPatterns(): string[] {
    return this.enabledPatterns;
  }

  /**
   * Register a single tool.
   */
  registerTool(tool: MCPTool, handler: MCPToolHandler): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    this.handlers.set(tool.name, handler);
  }

  /**
   * Register a module containing multiple tools.
   */
  registerModule(module: ToolModule): void {
    for (const tool of module.tools) {
      const handler = module.handlers[tool.name];
      if (!handler) {
        throw new Error(`Handler missing for tool: ${tool.name}`);
      }
      this.registerTool(tool, handler);
    }
  }

  /**
   * Get a tool definition by name.
   */
  getTool(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools (respects enabled patterns).
   */
  listTools(): MCPTool[] {
    const allTools = Array.from(this.tools.values());

    // If no patterns set, return all tools
    if (this.enabledPatterns.length === 0) {
      return allTools;
    }

    // Filter by enabled patterns
    return allTools.filter(tool => this.isToolEnabled(tool.name));
  }

  /**
   * Get all registered tools without filtering.
   */
  listAllTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Check if a tool is enabled based on current patterns.
   */
  isToolEnabled(name: string): boolean {
    if (this.enabledPatterns.length === 0) {
      return true;
    }
    return matchesPattern(name, this.enabledPatterns);
  }

  /**
   * Call a tool by name.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return handler(args);
  }

  /**
   * Check if a tool exists.
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }
}
