/**
 * Conversation Memory Manager
 *
 * Manages conversation history for AI chat with sliding window.
 * Keeps last N message pairs (user + assistant) plus system prompt.
 */

import type { ChatMessage } from '../types/ai.js';
import type { AIMemoryConfig } from '../types/ai-client.js';

/**
 * Default configuration
 */
const DEFAULT_MAX_PAIRS = 12;

/**
 * Conversation Memory
 *
 * Implements a sliding window for conversation history:
 * - System prompt is always kept (if set)
 * - Keeps last N pairs of messages (user + assistant)
 * - Automatically prunes old messages when limit is reached
 *
 * @example
 * ```typescript
 * const memory = new ConversationMemory({ maxPairs: 12 });
 * memory.setSystemPrompt('You are a helpful assistant.');
 *
 * memory.addUserMessage('Hello!');
 * memory.addAssistantMessage('Hi! How can I help you?');
 *
 * const messages = memory.getMessages();
 * // [
 * //   { role: 'system', content: 'You are a helpful assistant.' },
 * //   { role: 'user', content: 'Hello!' },
 * //   { role: 'assistant', content: 'Hi! How can I help you?' }
 * // ]
 * ```
 */
export class ConversationMemory {
  private config: Required<AIMemoryConfig>;
  private systemMessage: ChatMessage | null = null;
  private messages: ChatMessage[] = [];

  constructor(config: AIMemoryConfig = {}) {
    this.config = {
      maxPairs: config.maxPairs ?? DEFAULT_MAX_PAIRS,
      systemPrompt: config.systemPrompt ?? '',
    };

    // Initialize system prompt if provided
    if (this.config.systemPrompt) {
      this.systemMessage = {
        role: 'system',
        content: this.config.systemPrompt,
      };
    }
  }

  /**
   * Set or update system prompt
   */
  setSystemPrompt(prompt: string): void {
    this.config.systemPrompt = prompt;
    if (prompt) {
      this.systemMessage = {
        role: 'system',
        content: prompt,
      };
    } else {
      this.systemMessage = null;
    }
  }

  /**
   * Get current system prompt
   */
  getSystemPrompt(): string {
    return this.config.systemPrompt;
  }

  /**
   * Add a user message to history
   */
  addUserMessage(content: string): void {
    this.messages.push({
      role: 'user',
      content,
    });
    this.prune();
  }

  /**
   * Add an assistant message to history
   */
  addAssistantMessage(content: string): void {
    this.messages.push({
      role: 'assistant',
      content,
    });
    this.prune();
  }

  /**
   * Add a message to history
   */
  addMessage(message: ChatMessage): void {
    // System messages update the system prompt
    if (message.role === 'system') {
      this.setSystemPrompt(typeof message.content === 'string' ? message.content : '');
      return;
    }
    this.messages.push(message);
    this.prune();
  }

  /**
   * Add user message and return full message history for API call
   * This is the main method used for chat requests
   */
  buildMessages(userPrompt: string): ChatMessage[] {
    this.addUserMessage(userPrompt);
    return this.getMessages();
  }

  /**
   * Record assistant response
   * Call this after receiving the AI response
   */
  recordResponse(content: string): void {
    this.addAssistantMessage(content);
  }

  /**
   * Get all messages including system prompt
   */
  getMessages(): ChatMessage[] {
    const result: ChatMessage[] = [];

    // Always include system message first
    if (this.systemMessage) {
      result.push(this.systemMessage);
    }

    // Add conversation messages
    result.push(...this.messages);

    return result;
  }

  /**
   * Get messages without system prompt (conversation only)
   */
  getConversation(): readonly ChatMessage[] {
    return this.messages;
  }

  /**
   * Get number of message pairs
   */
  getPairCount(): number {
    // Count pairs (user + assistant)
    let pairs = 0;
    for (let i = 0; i < this.messages.length - 1; i += 2) {
      if (
        this.messages[i].role === 'user' &&
        this.messages[i + 1]?.role === 'assistant'
      ) {
        pairs++;
      }
    }
    return pairs;
  }

  /**
   * Clear conversation history (keeps system prompt)
   */
  clear(): void {
    this.messages = [];
  }

  /**
   * Clear everything including system prompt
   */
  reset(): void {
    this.messages = [];
    this.systemMessage = null;
    this.config.systemPrompt = '';
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<AIMemoryConfig>): void {
    if (config.maxPairs !== undefined) {
      this.config.maxPairs = config.maxPairs;
      this.prune(); // Re-prune with new limit
    }
    if (config.systemPrompt !== undefined) {
      this.setSystemPrompt(config.systemPrompt);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): AIMemoryConfig {
    return { ...this.config };
  }

  /**
   * Prune old messages to stay within maxPairs limit
   *
   * Strategy: Remove oldest pairs first
   * A pair = user message + assistant message
   */
  private prune(): void {
    const maxMessages = this.config.maxPairs * 2;

    if (this.messages.length > maxMessages) {
      // Remove pairs from the beginning
      const excess = this.messages.length - maxMessages;
      // Round up to remove complete pairs
      const toRemove = Math.ceil(excess / 2) * 2;
      this.messages = this.messages.slice(toRemove);
    }
  }

  /**
   * Check if memory has any messages
   */
  isEmpty(): boolean {
    return this.messages.length === 0;
  }

  /**
   * Get total message count (excluding system)
   */
  getMessageCount(): number {
    return this.messages.length;
  }

  /**
   * Export memory state for serialization
   */
  toJSON(): {
    config: AIMemoryConfig;
    systemPrompt: string | null;
    messages: ChatMessage[];
  } {
    return {
      config: this.config,
      systemPrompt: this.systemMessage?.content as string | null,
      messages: [...this.messages],
    };
  }

  /**
   * Restore memory from serialized state
   */
  static fromJSON(data: {
    config?: AIMemoryConfig;
    systemPrompt?: string | null;
    messages?: ChatMessage[];
  }): ConversationMemory {
    const memory = new ConversationMemory(data.config);
    if (data.systemPrompt) {
      memory.setSystemPrompt(data.systemPrompt);
    }
    if (data.messages) {
      for (const msg of data.messages) {
        memory.addMessage(msg);
      }
    }
    return memory;
  }
}
