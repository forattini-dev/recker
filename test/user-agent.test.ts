import { describe, it, expect } from 'vitest';
import { createClient } from '../src/core/client.js';
import { userAgentRotator, browserHeaders } from '../src/plugins/user-agent.js';

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
            plugins: [userAgentRotator({ userAgents: uas, strategy: 'round-robin' })]
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
});
