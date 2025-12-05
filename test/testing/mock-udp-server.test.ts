import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { MockUDPServer, createMockUDPServer } from '../../src/testing/mock-udp-server.js';
import dgram from 'node:dgram';

describe('MockUDPServer', () => {
  let server: MockUDPServer;
  let client: dgram.Socket;

  beforeEach(async () => {
    client = dgram.createSocket('udp4');
  });

  afterEach(async () => {
    if (server?.isRunning) {
      await server.stop();
    }
    client.close();
  });

  describe('Basic Operations', () => {
    it('should start and stop', async () => {
      server = new MockUDPServer();
      await server.start();
      expect(server.isRunning).toBe(true);
      expect(server.port).toBeGreaterThan(0);

      await server.stop();
      expect(server.isRunning).toBe(false);
    });

    it('should not start if already running', async () => {
      server = new MockUDPServer();
      await server.start();
      await expect(server.start()).rejects.toThrow('Server already started');
    });

    it('should not stop if not running', async () => {
      server = new MockUDPServer();
      await expect(server.stop()).resolves.toBeUndefined(); // Should not throw
    });

    it('should expose address and port', async () => {
      server = new MockUDPServer({ host: '127.0.0.1' });
      await server.start();
      expect(server.address).toBe('127.0.0.1');
      expect(server.port).toBeGreaterThan(0);
    });
  });

  describe('Echo Mode', () => {
    it('should echo messages by default', async () => {
      server = await MockUDPServer.create();
      
      const promise = new Promise<string>((resolve) => {
        client.on('message', (msg) => resolve(msg.toString()));
      });

      client.send('ping', server.port, server.address);
      
      const response = await promise;
      expect(response).toBe('ping');
      expect(server.messageCount).toBe(1);
    });

    it('should allow disabling echo', async () => {
      server = await MockUDPServer.create({ echo: false });
      
      let received = false;
      client.on('message', () => { received = true; });

      client.send('ping', server.port, server.address);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(received).toBe(false);
      expect(server.messageCount).toBe(1);
    });
  });

  describe('Custom Responses', () => {
    it('should match string pattern', async () => {
      server = await MockUDPServer.create({ echo: false });
      server.setResponse('hello', 'world');

      const promise = new Promise<string>((resolve) => {
        client.on('message', (msg) => resolve(msg.toString()));
      });

      client.send('hello', server.port, server.address);
      
      const response = await promise;
      expect(response).toBe('world');
    });

    it('should match regex pattern', async () => {
      server = await MockUDPServer.create({ echo: false });
      server.setResponse(/^get_/, 'got it');

      const promise = new Promise<string>((resolve) => {
        client.on('message', (msg) => resolve(msg.toString()));
      });

      client.send('get_data', server.port, server.address);
      
      const response = await promise;
      expect(response).toBe('got it');
    });

    it('should support functional response', async () => {
      server = await MockUDPServer.create({ echo: false });
      server.setResponse('mirror', (msg) => Buffer.from(msg.toString().split('').reverse().join('')));

      const promise = new Promise<string>((resolve) => {
        client.on('message', (msg) => resolve(msg.toString()));
      });

      client.send('mirror', server.port, server.address);
      
      const response = await promise;
      expect(response).toBe('rorrim');
    });

    it('should support returning null to not respond', async () => {
      server = await MockUDPServer.create({ echo: false });
      server.setResponse('quiet', () => null);

      let received = false;
      client.on('message', () => { received = true; });

      client.send('quiet', server.port, server.address);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(received).toBe(false);
    });
  });

  describe('Simulation Features', () => {
    it('should simulate delay', async () => {
      server = await MockUDPServer.create({ delay: 100 });
      
      const start = Date.now();
      const promise = new Promise<void>((resolve) => {
        client.on('message', () => resolve());
      });

      client.send('ping', server.port, server.address);
      
      await promise;
      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(100);
    });

    it('should simulate packet loss (drop rate)', async () => {
      server = await MockUDPServer.create({ dropRate: 1.0 }); // 100% loss
      
      let dropped = false;
      server.on('dropped', () => { dropped = true; });

      client.send('ping', server.port, server.address);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(dropped).toBe(true);
      expect(server.messageCount).toBe(1); // It was received, just dropped
    });

    it('should send unsolicited messages', async () => {
      server = await MockUDPServer.create();
      
      const promise = new Promise<string>((resolve) => {
        client.bind(0, () => {
            server.sendTo('unsolicited', client.address().port);
        });
        client.on('message', (msg) => resolve(msg.toString()));
      });

      const response = await promise;
      expect(response).toBe('unsolicited');
    });
  });

  describe('State Management', () => {
    it('should clear messages', async () => {
      server = await MockUDPServer.create();
      client.send('one', server.port, server.address);
      
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(server.messageCount).toBe(1);

      server.clearMessages();
      expect(server.messageCount).toBe(0);
    });

    it('should reset server', async () => {
        server = await MockUDPServer.create({ delay: 500, dropRate: 0.5, echo: false });
        server.setResponse('test', 'response');
        
        server.reset();
        
        // Defaults check
        expect(server.messageCount).toBe(0);
        // options are private but behaviors should reset
        
        // Echo should be back
        const promise = new Promise<string>((resolve) => {
            client.on('message', (msg) => resolve(msg.toString()));
        });
        client.send('ping', server.port, server.address);
        
        const response = await promise;
        expect(response).toBe('ping');
    });

    it('should wait for messages', async () => {
        server = await MockUDPServer.create();
        
        // Start sending delayed messages
        setTimeout(() => client.send('1', server.port, server.address), 10);
        setTimeout(() => client.send('2', server.port, server.address), 30);
        
        const messages = await server.waitForMessages(2);
        expect(messages).toHaveLength(2);
        expect(messages[0].data.toString()).toBe('1');
        expect(messages[1].data.toString()).toBe('2');
    });

    it('should timeout waiting for messages', async () => {
        server = await MockUDPServer.create();
        
        await expect(server.waitForMessages(1, 100)).rejects.toThrow(/Timeout/);
    });
  });

  describe('Helper Function', () => {
      it('should create pre-configured server', async () => {
          server = await createMockUDPServer({
              'ping': 'pong',
              'hello': 'world'
          });

          expect(server.isRunning).toBe(true);
          
          // Test configured response
          const promise = new Promise<string>((resolve) => {
            client.on('message', (msg) => resolve(msg.toString()));
          });
          client.send('ping', server.port, server.address);
          expect(await promise).toBe('pong');
      });
  });
});
