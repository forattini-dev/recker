import type { MCPTool, MCPToolResult } from '../types.js';
import { matchesPattern } from '../profiles.js';
import { getToolCategory, listCategories, type ToolCategory, type CategoryInfo } from './categories.js';

export type MCPToolHandler = (args: Record<string, unknown>) => Promise<MCPToolResult>;

export interface ToolModule {
  tools: MCPTool[];
  handlers: Record<string, MCPToolHandler>;
}

export interface ToolListOptions {
  /** Filter by category */
  category?: ToolCategory | string;
  /** Filter by tags (tool must have all specified tags) */
  tags?: string[];
  /** Search in name and description */
  search?: string;
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
   * Get all registered tools with optional filtering.
   */
  listTools(options?: ToolListOptions): MCPTool[] {
    let tools = Array.from(this.tools.values());

    // Apply profile-based pattern filtering
    if (this.enabledPatterns.length > 0) {
      tools = tools.filter(tool => this.isToolEnabled(tool.name));
    }

    // Apply category filter
    if (options?.category) {
      tools = tools.filter(tool => {
        const toolCategory = tool.category || getToolCategory(tool.name);
        return toolCategory === options.category;
      });
    }

    // Apply tags filter
    if (options?.tags && options.tags.length > 0) {
      tools = tools.filter(tool => {
        if (!tool.tags) return false;
        return options.tags!.every(tag => tool.tags!.includes(tag));
      });
    }

    // Apply search filter
    if (options?.search) {
      const searchLower = options.search.toLowerCase();
      tools = tools.filter(tool => {
        const nameMatch = tool.name.toLowerCase().includes(searchLower);
        const descMatch = tool.description?.toLowerCase().includes(searchLower);
        return nameMatch || descMatch;
      });
    }

    // Enrich tools with category if not set
    return tools.map(tool => ({
      ...tool,
      category: tool.category || getToolCategory(tool.name),
    }));
  }

  /**
   * Get all registered tools without filtering.
   */
  listAllTools(): MCPTool[] {
    return Array.from(this.tools.values()).map(tool => ({
      ...tool,
      category: tool.category || getToolCategory(tool.name),
    }));
  }

  /**
   * List all available categories with tool counts.
   */
  listCategories(): CategoryInfo[] {
    const enabledTools = this.listTools();
    const counts: Record<string, number> = {};

    for (const tool of enabledTools) {
      const category = tool.category || getToolCategory(tool.name);
      counts[category] = (counts[category] || 0) + 1;
    }

    return listCategories().map(cat => ({
      ...cat,
      toolCount: counts[cat.name] || 0,
    }));
  }

  /**
   * Get tools grouped by category.
   */
  listToolsByCategory(): Record<string, MCPTool[]> {
    const tools = this.listTools();
    const grouped: Record<string, MCPTool[]> = {};

    for (const tool of tools) {
      const category = tool.category || getToolCategory(tool.name);
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(tool);
    }

    return grouped;
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
