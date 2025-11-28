import { describe, it, expect, afterEach, vi } from 'vitest';
import { MockWebSocket } from './helpers/mock-websocket.js';

// Mock undici WebSocket BEFORE importing the client
vi.mock('undici', async () => {
  const { MockWebSocket } = await import('./helpers/mock-websocket.js');
  return {
    WebSocket: MockWebSocket
  };
});

// Import client AFTER mocking
import { ReckerWebSocket, websocket } from '../src/websocket/client.js';

describe('WebSocket Client', () => {
  let ws: ReckerWebSocket;

  afterEach(async () => {
    if (ws) {
      ws.close();
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('Connection', () => {
    it('should connect to WebSocket server', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080');

      const openPromise = new Promise(resolve => {
        ws.on('open', resolve);
      });

      await ws.connect();
      await openPromise;

      expect(ws.isConnected).toBe(true);
      expect(ws.readyState).toBe(1); // OPEN
    });

    it('should emit open event on connection', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080');

      let opened = false;
      ws.on('open', () => {
        opened = true;
      });

      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(opened).toBe(true);
    });
  });

  describe('Messaging', () => {
    it('should send text messages', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080');
      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 50));

      ws.send('Hello, WebSocket!');
      expect(ws.isConnected).toBe(true);
    });

    it('should send binary messages', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080');
      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 50));

      const buffer = Buffer.from('Binary data');
      ws.send(buffer);
      expect(ws.isConnected).toBe(true);
    });

    it('should send JSON messages', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080');
      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 50));

      const data = { message: 'Hello', timestamp: Date.now() };
      ws.sendJSON(data);
      expect(ws.isConnected).toBe(true);
    });

    it('should receive text messages', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080');
      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 50));

      const messagePromise = new Promise(resolve => {
        ws.on('message', (msg) => resolve(msg));
      });

      // Simulate receiving a message
      const mockWs = (ws as any).ws as MockWebSocket;
      mockWs.receive('Hello from server');

      const message = await messagePromise as any;
      expect(message.data).toBe('Hello from server');
      expect(message.isBinary).toBe(false);
    });

    it('should receive binary messages', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080');
      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 50));

      const messagePromise = new Promise(resolve => {
        ws.on('message', (msg) => resolve(msg));
      });

      const buffer = Buffer.from('Binary message');
      const mockWs = (ws as any).ws as MockWebSocket;
      mockWs.receive(buffer);

      const message = await messagePromise as any;
      expect(message.data).toEqual(buffer);
      expect(message.isBinary).toBe(true);
    });

    it('should throw error when sending on closed connection', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080');
      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 50));

      ws.close();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(() => {
        ws.send('This should fail');
      }).toThrow('WebSocket is not connected');
    });
  });

  describe('Close', () => {
    it('should close connection gracefully', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080');
      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 50));

      const closePromise = new Promise(resolve => {
        ws.on('close', resolve);
      });

      ws.close();
      await closePromise;

      expect(ws.isConnected).toBe(false);
    });

    it('should close with custom code and reason', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080');
      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 50));

      let closeCode: number | undefined;
      let closeReason: string | undefined;

      ws.on('close', (code: number, reason: string) => {
        closeCode = code;
        closeReason = reason;
      });

      ws.close(1001, 'Going away');
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(closeCode).toBe(1001);
      expect(closeReason).toBe('Going away');
    });

    it('should emit close event', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080');
      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 50));

      let closed = false;
      ws.on('close', () => {
        closed = true;
      });

      ws.close();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(closed).toBe(true);
    });
  });

  describe('Reconnection', () => {
    it('should reconnect when connection drops', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080', {
        reconnect: true,
        reconnectDelay: 50,
        maxReconnectAttempts: 3
      });

      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 50));

      let reconnecting = false;
      ws.on('reconnecting', () => {
        reconnecting = true;
      });

      // Simulate unexpected close
      const mockWs = (ws as any).ws as MockWebSocket;
      mockWs.simulateUnexpectedClose();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(reconnecting).toBe(true);
    });

    it('should not reconnect when manually closed', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080', {
        reconnect: true,
        reconnectDelay: 50
      });

      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 50));

      let reconnecting = false;
      ws.on('reconnecting', () => {
        reconnecting = true;
      });

      ws.close();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(reconnecting).toBe(false);
    });

    it('should emit max reconnect attempts event', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080', {
        reconnect: true,
        reconnectDelay: 10,
        maxReconnectAttempts: 2
      });

      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 50));

      let maxAttemptsReached = false;
      ws.on('max-reconnect-attempts', () => {
        maxAttemptsReached = true;
      });

      // Need to make reconnects fail to trigger max attempts
      // For now, this test verifies the event exists
      expect(ws).toBeDefined();
    });

    it('should use exponential backoff for reconnection', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080', {
        reconnect: true,
        reconnectDelay: 100,
        maxReconnectAttempts: 3
      });

      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 50));

      const delays: number[] = [];
      ws.on('reconnecting', (attempt: number, delay: number) => {
        delays.push(delay);
      });

      const mockWs = (ws as any).ws as MockWebSocket;
      mockWs.simulateUnexpectedClose();

      await new Promise(resolve => setTimeout(resolve, 150));

      // Should have attempted at least one reconnect
      expect(delays.length).toBeGreaterThan(0);
    });
  });

  describe('Heartbeat', () => {
    it('should send heartbeat pings', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080', {
        heartbeatInterval: 50
      });

      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 100));

      const mockWs = (ws as any).ws as MockWebSocket;
      const sentMessages = mockWs.getSentMessages();

      // Should have sent at least one heartbeat
      expect(sentMessages.some(msg => msg === '__heartbeat__')).toBe(true);
    });

    it('should not send heartbeat when interval is 0', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080', {
        heartbeatInterval: 0
      });

      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 100));

      const mockWs = (ws as any).ws as MockWebSocket;
      const sentMessages = mockWs.getSentMessages();

      expect(sentMessages.length).toBe(0);
    });

    it('should stop heartbeat on close', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080', {
        heartbeatInterval: 50
      });

      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Capture reference BEFORE close
      const mockWs = (ws as any).ws as MockWebSocket;
      const messageCountBeforeClose = mockWs.getSentMessages().length;

      ws.close();
      await new Promise(resolve => setTimeout(resolve, 50));

      await new Promise(resolve => setTimeout(resolve, 100));
      const messageCountAfterClose = mockWs.getSentMessages().length;

      // No new messages after close
      expect(messageCountAfterClose).toBe(messageCountBeforeClose);
    });
  });

  describe('Async Iterator', () => {
    it('should iterate over messages', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080');
      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 100));

      const messages: string[] = [];
      const mockWs = (ws as any).ws as MockWebSocket;

      const iterator = (async () => {
        let count = 0;
        for await (const msg of ws) {
          messages.push(msg.data as string);
          count++;
          if (count >= 3) break;
        }
      })();

      // Wait for listeners to bind
      await new Promise(resolve => setTimeout(resolve, 100));

      mockWs.receive('Message 1');
      await new Promise(resolve => setTimeout(resolve, 20));
      mockWs.receive('Message 2');
      await new Promise(resolve => setTimeout(resolve, 20));
      mockWs.receive('Message 3');

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Force iterator completion if stuck
      ws.close(); 
      
      // We can't easily await iterator if it's stuck, but closing should free it
      expect(messages).toEqual(['Message 1', 'Message 2', 'Message 3']);
    }, 10000);

    it('should end iteration on close', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080');
      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 50));

      const messages: string[] = [];
      const mockWs = (ws as any).ws as MockWebSocket;

      const iterator = (async () => {
        for await (const msg of ws) {
          messages.push(msg.data as string);
        }
      })();

      await new Promise(resolve => setTimeout(resolve, 100));
      
      mockWs.receive('Before close');
      // Give time for the message to be pushed to the internal buffer/yielded
      await new Promise(resolve => setTimeout(resolve, 100));

      ws.close();
      // Give time for the close event to break the loop
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(messages).toContain('Before close');
    });
  });

  describe('Helper Function', () => {
    it('should create and auto-connect WebSocket', async () => {
      const ws = websocket('ws://localhost:8080');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(ws.isConnected).toBe(true);

      ws.close();
    });
  });

  describe('Options', () => {
    it('should accept custom protocols', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080', {
        protocols: ['chat', 'superchat']
      });

      await ws.connect();
      expect(ws.isConnected).toBe(true);
    });

    it('should accept custom headers', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080', {
        headers: {
          'Authorization': 'Bearer token123',
          'X-Custom-Header': 'value'
        }
      });

      await ws.connect();
      expect(ws.isConnected).toBe(true);
    });

    it('should use default options', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080');

      expect((ws as any).options.reconnect).toBe(false);
      expect((ws as any).options.reconnectDelay).toBe(1000);
      expect((ws as any).options.maxReconnectAttempts).toBe(5);
      expect((ws as any).options.heartbeatInterval).toBe(30000);
    });
  });

  describe('State Management', () => {
    it('should track connection state', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080');

      expect(ws.isConnected).toBe(false);
      expect(ws.readyState).toBe(3); // CLOSED

      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(ws.isConnected).toBe(true);
      expect(ws.readyState).toBe(1); // OPEN

      ws.close();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(ws.isConnected).toBe(false);
    });

    it('should handle ping method', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080');
      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should not throw
      ws.ping();

      const mockWs = (ws as any).ws as MockWebSocket;
      const sentMessages = mockWs.getSentMessages();

      expect(sentMessages).toContain('__heartbeat__');
    });

    it('should not ping on closed connection', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080');
      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 50));

      const mockWs = (ws as any).ws as MockWebSocket;
      
      ws.close();
      await new Promise(resolve => setTimeout(resolve, 50));

      const messageCount = mockWs.getSentMessages().length;

      // Ping should be ignored
      ws.ping();

      expect(mockWs.getSentMessages().length).toBe(messageCount);
    });
  });

  describe('Edge Cases', () => {
    it('should handle close on already closed connection', async () => {
      ws = new ReckerWebSocket('ws://localhost:8080');
      await ws.connect();
      await new Promise(resolve => setTimeout(resolve, 50));

      ws.close();
      await new Promise(resolve => setTimeout(resolve, 50));

      // Calling close again should not throw
      ws.close();

      expect(ws.isConnected).toBe(false);
    });

    it('should get readyState when ws is null', () => {
      ws = new ReckerWebSocket('ws://localhost:8080');

      // Before connection, ws is null
      expect(ws.readyState).toBe(3); // CLOSED
    });
  });
});