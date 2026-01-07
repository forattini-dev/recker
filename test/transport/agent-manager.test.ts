import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
    AgentManager,
    createAgent,
    extractDomain,
    analyzeBatchDomains
} from '../../src/utils/agent-manager.js';
import { ProtocolCache } from '../../src/utils/protocol-cache.js';
import { Agent } from 'undici';

describe('Agent Manager', () => {
    let manager: AgentManager | null = null;

    afterEach(async () => {
        // Clean up any created agents
        if (manager) {
            await manager.destroy();
            manager = null;
        }
    });

    describe('AgentManager class', () => {
        it('should create with default options', () => {
            manager = new AgentManager();
            const agent = manager.getGlobalAgent();
            expect(agent).toBeInstanceOf(Agent);
        });

        it('should create global agent', () => {
            manager = new AgentManager({ connections: 10 });
            const dispatcher = manager.getAgentForUrl('https://api.com');
            expect(dispatcher).toBeInstanceOf(Agent);
        });

        it('should reuse global agent', () => {
            manager = new AgentManager({ connections: 10 });
            const agent1 = manager.getGlobalAgent();
            const agent2 = manager.getGlobalAgent();
            expect(agent1).toBe(agent2);
        });

        it('should pool per domain', () => {
            manager = new AgentManager({ perDomainPooling: true });
            const d1 = manager.getAgentForUrl('https://api1.com');
            const d2 = manager.getAgentForUrl('https://api2.com');
            const d3 = manager.getAgentForUrl('https://api1.com'); // Same domain

            expect(d1).not.toBe(d2);
            expect(d1).toBe(d3);
        });

        it('should use global agent when perDomainPooling is false', () => {
            manager = new AgentManager({ perDomainPooling: false });
            const d1 = manager.getAgentForDomain('api1.com');
            const d2 = manager.getAgentForDomain('api2.com');

            expect(d1).toBe(d2);
        });

        it('should return global agent for invalid URLs', () => {
            manager = new AgentManager();
            const agent = manager.getAgentForUrl('not-a-valid-url');
            expect(agent).toBeInstanceOf(Agent);
        });

        it('should return stats', () => {
            manager = new AgentManager({ perDomainPooling: true, connections: 5 });
            manager.getAgentForUrl('https://api1.com');
            manager.getAgentForUrl('https://api2.com');

            const stats = manager.getStats();
            expect(stats.agentCount).toBe(3); // 1 global + 2 domains
            expect(stats.domains).toContain('api1.com');
            expect(stats.domains).toContain('api2.com');
            expect(stats.totalConnections).toBe(15); // 3 agents * 5 connections
        });

        it('should get agent for domain with custom options', () => {
            manager = new AgentManager({ perDomainPooling: true });
            const agent = manager.getAgentForDomain('api.example.com', { connections: 20 });
            expect(agent).toBeInstanceOf(Agent);
        });

        it('should create batch agent', () => {
            manager = new AgentManager();
            const agent = manager.createBatchAgent(10, 100);
            expect(agent).toBeInstanceOf(Agent);
        });

        it('should create batch agent with smart connection sizing', () => {
            manager = new AgentManager();

            // Small batch
            const smallAgent = manager.createBatchAgent(2, 5);
            expect(smallAgent).toBeInstanceOf(Agent);

            // Large batch - should enable pipelining
            const largeAgent = manager.createBatchAgent(50, 1000);
            expect(largeAgent).toBeInstanceOf(Agent);
        });

        it('should create batch agent with custom options', () => {
            manager = new AgentManager();
            const agent = manager.createBatchAgent(10, 100, { connections: 25, pipelining: 4 });
            expect(agent).toBeInstanceOf(Agent);
        });

        it('should close domain agent', async () => {
            manager = new AgentManager({ perDomainPooling: true });
            manager.getAgentForDomain('api1.com');
            manager.getAgentForDomain('api2.com');

            let stats = manager.getStats();
            expect(stats.domains).toHaveLength(2);

            await manager.closeDomainAgent('api1.com');

            stats = manager.getStats();
            expect(stats.domains).toHaveLength(1);
            expect(stats.domains).not.toContain('api1.com');
        });

        it('should handle closing non-existent domain agent', async () => {
            manager = new AgentManager({ perDomainPooling: true });
            // Should not throw
            await manager.closeDomainAgent('nonexistent.com');
        });

        it('should close all agents', async () => {
            manager = new AgentManager({ perDomainPooling: true });
            manager.getGlobalAgent();
            manager.getAgentForDomain('api1.com');
            manager.getAgentForDomain('api2.com');

            await manager.closeAll();

            // After closeAll, a new global agent would be created
            const newAgent = manager.getGlobalAgent();
            expect(newAgent).toBeInstanceOf(Agent);
        });

        it('should destroy all agents', async () => {
            manager = new AgentManager({ perDomainPooling: true });
            manager.getGlobalAgent();
            manager.getAgentForDomain('api1.com');

            await manager.destroy();

            // After destroy, stats should be reset
            const stats = manager.getStats();
            expect(stats.domains).toHaveLength(0);
        });

        it('should use custom options', () => {
            manager = new AgentManager({
                connections: 20,
                pipelining: 2,
                keepAlive: false,
                keepAliveTimeout: 5000,
                keepAliveMaxTimeout: 60000,
                keepAliveTimeoutThreshold: 500,
                connectTimeout: 5000,
                localAddress: '127.0.0.1',
                maxRequestsPerClient: 100,
                maxCachedSessions: 50,
                maxHeaderSize: 16384,
            });

            const agent = manager.getGlobalAgent();
            expect(agent).toBeInstanceOf(Agent);
        });
    });

    describe('createAgent function', () => {
        it('should create standalone agent with defaults', () => {
            const agent = createAgent();
            expect(agent).toBeInstanceOf(Agent);
        });

        it('should create standalone agent with options', () => {
            const agent = createAgent({ connections: 15 });
            expect(agent).toBeInstanceOf(Agent);
        });
    });

    describe('extractDomain function', () => {
        it('should extract domain from URL', () => {
            expect(extractDomain('https://api.example.com/path')).toBe('api.example.com');
            expect(extractDomain('http://localhost:3000')).toBe('localhost');
            expect(extractDomain('https://sub.domain.co.uk:8080/path?query=1')).toBe('sub.domain.co.uk');
        });

        it('should return null for invalid URLs', () => {
            expect(extractDomain('not-a-url')).toBeNull();
            expect(extractDomain('')).toBeNull();
            expect(extractDomain('://missing-protocol.com')).toBeNull();
        });
    });

    describe('analyzeBatchDomains function', () => {
        it('should detect single domain batch', () => {
            const result = analyzeBatchDomains([
                'https://api.example.com/users',
                'https://api.example.com/posts',
                'https://api.example.com/comments',
            ]);

            expect(result.strategy).toBe('single');
            expect(result.domains.size).toBe(1);
            expect(result.domains.has('api.example.com')).toBe(true);
        });

        it('should detect multi-domain batch', () => {
            const result = analyzeBatchDomains([
                'https://api.example.com/users',
                'https://api.github.com/users',
                'https://api.gitlab.com/projects',
            ]);

            expect(result.strategy).toBe('multi');
            expect(result.domains.size).toBe(3);
        });

        it('should handle empty URLs array', () => {
            const result = analyzeBatchDomains([]);

            expect(result.strategy).toBe('single');
            expect(result.domains.size).toBe(0);
        });

        it('should skip invalid URLs', () => {
            const result = analyzeBatchDomains([
                'https://api.example.com/users',
                'not-a-valid-url',
                '',
            ]);

            expect(result.strategy).toBe('single');
            expect(result.domains.size).toBe(1);
        });
    });

    describe('Adaptive Pooling', () => {
        let protocolCache: ProtocolCache;

        beforeEach(() => {
            protocolCache = new ProtocolCache();
        });

        afterEach(async () => {
            if (manager) {
                await manager.destroy();
                manager = null;
            }
        });

        it('should create manager with protocol cache', () => {
            manager = new AgentManager({}, protocolCache);
            expect(manager).toBeInstanceOf(AgentManager);
        });

        it('should set protocol cache after creation', () => {
            manager = new AgentManager();
            manager.setProtocolCache(protocolCache);

            // Should not throw when getting adaptive agent
            const agent = manager.getAdaptiveAgentForUrl('https://api.example.com');
            expect(agent).toBeInstanceOf(Agent);
        });

        it('should return optimistic agent for unknown origins', () => {
            manager = new AgentManager({ perDomainPooling: true }, protocolCache);
            const agent = manager.getAdaptiveAgentForUrl('https://unknown.example.com');
            expect(agent).toBeInstanceOf(Agent);
        });

        it('should create HTTP/2 optimized agent when h2 detected', () => {
            protocolCache.set('https://h2.example.com', 'h2');
            manager = new AgentManager({ perDomainPooling: true, connections: 10 }, protocolCache);

            const agent = manager.getAdaptiveAgentForUrl('https://h2.example.com/api');
            expect(agent).toBeInstanceOf(Agent);

            // Agent should be cached for this domain
            const agent2 = manager.getAdaptiveAgentForUrl('https://h2.example.com/other');
            expect(agent2).toBe(agent);
        });

        it('should create HTTP/1.1 optimized agent when http/1.1 detected', () => {
            protocolCache.set('https://h1.example.com', 'http/1.1');
            manager = new AgentManager({ perDomainPooling: true, connections: 2 }, protocolCache);

            const agent = manager.getAdaptiveAgentForUrl('https://h1.example.com/api');
            expect(agent).toBeInstanceOf(Agent);
        });

        it('should reuse existing domain agent', () => {
            manager = new AgentManager({ perDomainPooling: true }, protocolCache);

            // First call creates agent
            const agent1 = manager.getAdaptiveAgentForUrl('https://api.example.com');

            // Update protocol cache
            protocolCache.set('https://api.example.com', 'h2');

            // Second call should reuse existing agent (not recreate)
            const agent2 = manager.getAdaptiveAgentForUrl('https://api.example.com');
            expect(agent2).toBe(agent1);
        });

        it('should fallback to global agent when perDomainPooling disabled', () => {
            manager = new AgentManager({ perDomainPooling: false }, protocolCache);
            protocolCache.set('https://api.example.com', 'h2');

            const agent1 = manager.getAdaptiveAgentForUrl('https://api.example.com');
            const agent2 = manager.getAdaptiveAgentForUrl('https://other.example.com');

            // Both should be the global agent
            expect(agent1).toBe(agent2);
        });

        it('should handle HTTP/3 detected protocol', () => {
            protocolCache.set('https://h3.example.com', 'h3');
            manager = new AgentManager({ perDomainPooling: true }, protocolCache);

            const agent = manager.getAdaptiveAgentForUrl('https://h3.example.com');
            expect(agent).toBeInstanceOf(Agent);
        });
    });
});
