import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../../src/core/client.js';
import { interfaceRotator } from '../../src/plugins/interface-rotator.js';
import { Agent } from 'undici';

describe('Interface Rotator Plugin', () => {
    it('should rotate between provided IPs', async () => {
        const ips = ['10.0.0.1', '10.0.0.2'];
        const client = createClient({
            baseUrl: 'http://test.com',
            // Transport mock that checks the dispatcher configuration
            transport: {
                dispatch: async (req: any) => {
                    // Extract localAddress from the injected dispatcher (Agent)
                    // We can't easily inspect Agent internals without private access or spy.
                    // But we can check if req._localAddress (debug prop) was set by our plugin.
                    return {
                        ok: true,
                        status: 200,
                        headers: new Headers({ 'x-local-ip': req._localAddress }),
                        json: async () => ({})
                    } as any;
                }
            },
            plugins: [interfaceRotator({ ips, strategy: 'round-robin' })]
        });

        const res1 = await client.get('/');
        const res2 = await client.get('/');
        const res3 = await client.get('/');

        expect(res1.headers.get('x-local-ip')).toBe('10.0.0.1');
        expect(res2.headers.get('x-local-ip')).toBe('10.0.0.2');
        expect(res3.headers.get('x-local-ip')).toBe('10.0.0.1');
    });

    it('should inject dispatcher', async () => {
        const client = createClient({ 
            baseUrl: 'http://test.com',
            transport: { dispatch: async () => ({ ok: true } as any) }
        });
        
        let capturedReq: any;

        // Register plugin manually
        interfaceRotator({ ips: ['127.0.0.1'] })(client);
        
        client.beforeRequest((req) => {
            capturedReq = req;
        });

        await client.get('/');

        expect(capturedReq).toBeDefined();
        expect(capturedReq._dispatcher).toBeDefined();
        expect(capturedReq._dispatcher).toBeInstanceOf(Agent);
    });
});
