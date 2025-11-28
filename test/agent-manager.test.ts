import { describe, it, expect } from 'vitest';
import { AgentManager } from '../src/utils/agent-manager.js';
import { Agent } from 'undici';

describe('Agent Manager', () => {
    it('should create global agent', () => {
        const mgr = new AgentManager({ connections: 10 });
        const dispatcher = mgr.getAgentForUrl('https://api.com');
        expect(dispatcher).toBeInstanceOf(Agent);
        // check options if possible, or behavior
    });

    it('should pool per domain', () => {
        const mgr = new AgentManager({ perDomainPooling: true });
        const d1 = mgr.getAgentForUrl('https://api1.com');
        const d2 = mgr.getAgentForUrl('https://api2.com');
        const d3 = mgr.getAgentForUrl('https://api1.com'); // Same domain

        expect(d1).not.toBe(d2);
        expect(d1).toBe(d3);
    });

    it('should return stats', () => {
        const mgr = new AgentManager({ perDomainPooling: true });
        mgr.getAgentForUrl('https://api1.com');
        
        const stats = mgr.getStats();
        expect(stats.agentCount).toBe(2); // 1 global + 1 domain
        expect(stats.domains).toContain('api1.com');
    });
});
