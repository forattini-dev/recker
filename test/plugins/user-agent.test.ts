import { describe, it, expect } from 'vitest';
import { createClient } from '../../src/core/client.js';
import { userAgentRotatorPlugin, browserHeaders } from '../../src/plugins/user-agent.js';

describe('User Agent Tools', () => {
    it('should rotate user agents', async () => {
        const uas = ['UA1', 'UA2'];
        const client = createClient({
            baseUrl: 'http://test.com',
            transport: {
                dispatch: async (req: any) => {
                    return {
                        ok: true,
                        status: 200,
                        headers: new Headers({ 'x-received-ua': req.headers.get('user-agent') }),
                        json: async () => ({})
                    } as any;
                }
            },
            plugins: [userAgentRotatorPlugin({ userAgents: uas, strategy: 'round-robin' })]
        });

        const res1 = await client.get('/');
        const res2 = await client.get('/');
        const res3 = await client.get('/');

        expect(res1.headers.get('x-received-ua')).toBe('UA1');
        expect(res2.headers.get('x-received-ua')).toBe('UA2');
        expect(res3.headers.get('x-received-ua')).toBe('UA1');
    });

    it('should generate browser headers', () => {
        const headers = browserHeaders('desktop');
        expect(headers['Sec-Ch-Ua-Mobile']).toBe('?0');
        expect(headers['Accept-Encoding']).toContain('gzip');
    });

    it('should generate mobile browser headers', () => {
        const headers = browserHeaders('mobile');
        expect(headers['Sec-Ch-Ua-Mobile']).toBe('?1');
        expect(headers['Sec-Ch-Ua-Platform']).toBe('"Android"');
        expect(headers['Accept-Encoding']).toContain('gzip');
    });

    it('should use random strategy', async () => {
        const uas = ['UA1', 'UA2', 'UA3'];
        const client = createClient({
            baseUrl: 'http://test.com',
            transport: {
                dispatch: async (req: any) => {
                    return {
                        ok: true,
                        status: 200,
                        headers: new Headers({ 'x-received-ua': req.headers.get('user-agent') }),
                        json: async () => ({})
                    } as any;
                }
            },
            plugins: [userAgentRotatorPlugin({ userAgents: uas, strategy: 'random' })]
        });

        const receivedUAs: string[] = [];
        for (let i = 0; i < 10; i++) {
            const res = await client.get('/');
            const ua = res.headers.get('x-received-ua');
            if (ua) receivedUAs.push(ua);
        }

        // All received UAs should be from the list
        expect(receivedUAs.every(ua => uas.includes(ua))).toBe(true);
    });
});
