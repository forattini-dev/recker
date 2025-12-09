/**
 * Conversation Memory Tests
 *
 * Tests for the ConversationMemory class used by ClientAI
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationMemory } from '../../src/ai/memory.js';

describe('ConversationMemory', () => {
  let memory: ConversationMemory;

  beforeEach(() => {
    memory = new ConversationMemory();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const config = memory.getConfig();
      expect(config.maxPairs).toBe(12);
      expect(config.systemPrompt).toBe('');
    });

    it('should create with custom config', () => {
      memory = new ConversationMemory({
        maxPairs: 5,
        systemPrompt: 'You are a helpful assistant.',
      });
      const config = memory.getConfig();
      expect(config.maxPairs).toBe(5);
      expect(config.systemPrompt).toBe('You are a helpful assistant.');
    });

    it('should initialize system message when systemPrompt provided', () => {
      memory = new ConversationMemory({
        systemPrompt: 'You are helpful.',
      });
      const messages = memory.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        role: 'system',
        content: 'You are helpful.',
      });
    });
  });

  describe('addUserMessage()', () => {
    it('should add user message to history', () => {
      memory.addUserMessage('Hello!');
      const conversation = memory.getConversation();
      expect(conversation).toHaveLength(1);
      expect(conversation[0]).toEqual({
        role: 'user',
        content: 'Hello!',
      });
    });

    it('should add multiple user messages', () => {
      memory.addUserMessage('Hello!');
      memory.addUserMessage('How are you?');
      const conversation = memory.getConversation();
      expect(conversation).toHaveLength(2);
    });
  });

  describe('addAssistantMessage()', () => {
    it('should add assistant message to history', () => {
      memory.addAssistantMessage('Hi there!');
      const conversation = memory.getConversation();
      expect(conversation).toHaveLength(1);
      expect(conversation[0]).toEqual({
        role: 'assistant',
        content: 'Hi there!',
      });
    });
  });

  describe('addMessage()', () => {
    it('should add regular message to history', () => {
      memory.addMessage({ role: 'user', content: 'Test' });
      const conversation = memory.getConversation();
      expect(conversation).toHaveLength(1);
    });

    it('should update system prompt when system message added', () => {
      memory.addMessage({ role: 'system', content: 'New system prompt' });
      expect(memory.getSystemPrompt()).toBe('New system prompt');
      // System messages don't go into conversation history
      expect(memory.getConversation()).toHaveLength(0);
    });
  });

  describe('setSystemPrompt()', () => {
    it('should set system prompt', () => {
      memory.setSystemPrompt('You are helpful.');
      expect(memory.getSystemPrompt()).toBe('You are helpful.');
    });

    it('should include system message in getMessages()', () => {
      memory.setSystemPrompt('You are helpful.');
      memory.addUserMessage('Hi');
      const messages = memory.getMessages();
      expect(messages[0]).toEqual({
        role: 'system',
        content: 'You are helpful.',
      });
    });

    it('should clear system message when empty string provided', () => {
      memory.setSystemPrompt('Something');
      memory.setSystemPrompt('');
      const messages = memory.getMessages();
      expect(messages).toHaveLength(0);
    });
  });

  describe('buildMessages()', () => {
    it('should add user message and return full history', () => {
      memory.setSystemPrompt('You are helpful.');
      const messages = memory.buildMessages('Hello!');
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
      expect(messages[1].content).toBe('Hello!');
    });

    it('should include conversation history', () => {
      memory.addUserMessage('First');
      memory.addAssistantMessage('Response 1');
      const messages = memory.buildMessages('Second');
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('First');
      expect(messages[1].content).toBe('Response 1');
      expect(messages[2].content).toBe('Second');
    });
  });

  describe('recordResponse()', () => {
    it('should add assistant response to history', () => {
      memory.addUserMessage('Hi');
      memory.recordResponse('Hello!');
      const conversation = memory.getConversation();
      expect(conversation).toHaveLength(2);
      expect(conversation[1]).toEqual({
        role: 'assistant',
        content: 'Hello!',
      });
    });
  });

  describe('getMessages()', () => {
    it('should return system + conversation messages', () => {
      memory.setSystemPrompt('System');
      memory.addUserMessage('User');
      memory.addAssistantMessage('Assistant');
      const messages = memory.getMessages();
      expect(messages).toHaveLength(3);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
      expect(messages[2].role).toBe('assistant');
    });

    it('should work without system prompt', () => {
      memory.addUserMessage('User');
      const messages = memory.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
    });
  });

  describe('getConversation()', () => {
    it('should return only conversation messages (no system)', () => {
      memory.setSystemPrompt('System');
      memory.addUserMessage('User');
      const conversation = memory.getConversation();
      expect(conversation).toHaveLength(1);
      expect(conversation[0].role).toBe('user');
    });
  });

  describe('getPairCount()', () => {
    it('should return 0 for empty memory', () => {
      expect(memory.getPairCount()).toBe(0);
    });

    it('should return 0 for single user message', () => {
      memory.addUserMessage('Hi');
      expect(memory.getPairCount()).toBe(0);
    });

    it('should return 1 for complete pair', () => {
      memory.addUserMessage('Hi');
      memory.addAssistantMessage('Hello');
      expect(memory.getPairCount()).toBe(1);
    });

    it('should return correct count for multiple pairs', () => {
      for (let i = 0; i < 5; i++) {
        memory.addUserMessage(`User ${i}`);
        memory.addAssistantMessage(`Assistant ${i}`);
      }
      expect(memory.getPairCount()).toBe(5);
    });
  });

  describe('clear()', () => {
    it('should clear conversation but keep system prompt', () => {
      memory.setSystemPrompt('Keep me');
      memory.addUserMessage('Hi');
      memory.addAssistantMessage('Hello');
      memory.clear();
      expect(memory.getConversation()).toHaveLength(0);
      expect(memory.getSystemPrompt()).toBe('Keep me');
      expect(memory.getMessages()).toHaveLength(1);
    });
  });

  describe('reset()', () => {
    it('should clear everything including system prompt', () => {
      memory.setSystemPrompt('Remove me');
      memory.addUserMessage('Hi');
      memory.reset();
      expect(memory.getConversation()).toHaveLength(0);
      expect(memory.getSystemPrompt()).toBe('');
      expect(memory.getMessages()).toHaveLength(0);
    });
  });

  describe('setConfig()', () => {
    it('should update maxPairs', () => {
      memory.setConfig({ maxPairs: 5 });
      expect(memory.getConfig().maxPairs).toBe(5);
    });

    it('should update systemPrompt', () => {
      memory.setConfig({ systemPrompt: 'New prompt' });
      expect(memory.getSystemPrompt()).toBe('New prompt');
    });

    it('should prune when maxPairs reduced', () => {
      // Add 10 pairs
      for (let i = 0; i < 10; i++) {
        memory.addUserMessage(`User ${i}`);
        memory.addAssistantMessage(`Assistant ${i}`);
      }
      // Reduce to 3 pairs
      memory.setConfig({ maxPairs: 3 });
      expect(memory.getConversation()).toHaveLength(6); // 3 pairs = 6 messages
    });
  });

  describe('pruning (sliding window)', () => {
    it('should prune old messages when exceeding maxPairs', () => {
      memory = new ConversationMemory({ maxPairs: 3 });

      // Add 5 pairs
      for (let i = 0; i < 5; i++) {
        memory.addUserMessage(`User ${i}`);
        memory.addAssistantMessage(`Assistant ${i}`);
      }

      const conversation = memory.getConversation();
      expect(conversation).toHaveLength(6); // 3 pairs = 6 messages

      // Should have kept the last 3 pairs (indices 2, 3, 4)
      expect(conversation[0].content).toBe('User 2');
      expect(conversation[1].content).toBe('Assistant 2');
      expect(conversation[4].content).toBe('User 4');
      expect(conversation[5].content).toBe('Assistant 4');
    });

    it('should preserve system message during pruning', () => {
      memory = new ConversationMemory({
        maxPairs: 2,
        systemPrompt: 'System prompt',
      });

      for (let i = 0; i < 5; i++) {
        memory.addUserMessage(`User ${i}`);
        memory.addAssistantMessage(`Assistant ${i}`);
      }

      const messages = memory.getMessages();
      expect(messages[0]).toEqual({
        role: 'system',
        content: 'System prompt',
      });
      expect(messages).toHaveLength(5); // 1 system + 2 pairs = 5
    });

    it('should handle default maxPairs of 12', () => {
      // Add 15 pairs
      for (let i = 0; i < 15; i++) {
        memory.addUserMessage(`User ${i}`);
        memory.addAssistantMessage(`Assistant ${i}`);
      }

      const conversation = memory.getConversation();
      expect(conversation).toHaveLength(24); // 12 pairs = 24 messages

      // First message should be User 3 (indices 0-2 pruned)
      expect(conversation[0].content).toBe('User 3');
    });
  });

  describe('isEmpty()', () => {
    it('should return true for empty memory', () => {
      expect(memory.isEmpty()).toBe(true);
    });

    it('should return true with only system prompt', () => {
      memory.setSystemPrompt('System');
      expect(memory.isEmpty()).toBe(true);
    });

    it('should return false with messages', () => {
      memory.addUserMessage('Hi');
      expect(memory.isEmpty()).toBe(false);
    });
  });

  describe('getMessageCount()', () => {
    it('should return 0 for empty memory', () => {
      expect(memory.getMessageCount()).toBe(0);
    });

    it('should return correct count', () => {
      memory.addUserMessage('1');
      memory.addAssistantMessage('2');
      memory.addUserMessage('3');
      expect(memory.getMessageCount()).toBe(3);
    });

    it('should not count system message', () => {
      memory.setSystemPrompt('System');
      memory.addUserMessage('User');
      expect(memory.getMessageCount()).toBe(1);
    });
  });

  describe('toJSON() / fromJSON()', () => {
    it('should serialize memory state', () => {
      memory.setSystemPrompt('System');
      memory.addUserMessage('User');
      memory.addAssistantMessage('Assistant');

      const json = memory.toJSON();
      expect(json.systemPrompt).toBe('System');
      expect(json.messages).toHaveLength(2);
      expect(json.config.maxPairs).toBe(12);
    });

    it('should deserialize memory state', () => {
      const data = {
        config: { maxPairs: 5 },
        systemPrompt: 'Restored system',
        messages: [
          { role: 'user' as const, content: 'Restored user' },
          { role: 'assistant' as const, content: 'Restored assistant' },
        ],
      };

      const restored = ConversationMemory.fromJSON(data);
      expect(restored.getSystemPrompt()).toBe('Restored system');
      expect(restored.getConversation()).toHaveLength(2);
      expect(restored.getConfig().maxPairs).toBe(5);
    });

    it('should handle empty data', () => {
      const restored = ConversationMemory.fromJSON({});
      expect(restored.isEmpty()).toBe(true);
      expect(restored.getConfig().maxPairs).toBe(12);
    });

    it('should roundtrip correctly', () => {
      memory.setSystemPrompt('Test system');
      memory.addUserMessage('Hello');
      memory.addAssistantMessage('Hi');

      const restored = ConversationMemory.fromJSON(memory.toJSON());
      expect(restored.getSystemPrompt()).toBe(memory.getSystemPrompt());
      expect(restored.getConversation()).toEqual(memory.getConversation());
    });
  });
});
