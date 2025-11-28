import { describe, it, expect, vi, afterEach } from 'vitest';
import { createClient } from '../src/core/client.js';
import { graphql, graphqlPlugin, GraphQLError } from '../src/plugins/graphql.js';
import { harRecorder } from '../src/plugins/har-recorder.js';
import { harPlayer } from '../src/plugins/har-player.js';
import { serverTiming } from '../src/plugins/server-timing.js';
import { ReckerRequest } from '../src/types/index.js';
import { writeFileSync, readFileSync } from 'node:fs';

// Mock fs
vi.mock('node:fs', async () => {
    const actual = await vi.importActual('node:fs');
    return {
        ...actual,
        writeFileSync: vi.fn(),
        readFileSync: vi.fn()
    };
});

class MockTransport {
    async dispatch(req: ReckerRequest) {
        if (req.url.includes('/graphql')) {
            const body = JSON.parse(req.body as string);
            if (body.query.includes('error')) {
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers({ 'content-type': 'application/json' }),
                    json: async () => ({ errors: [{ message: 'Boom' }] }),
                    clone: function() { return this; } // Proper clone mock
                } as any;
            }
            return {
                ok: true,
                status: 200,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: async () => ({ data: { user: { name: 'Alice' } } }),
                clone: () => this as any
            } as any;
        }

        if (req.url.includes('/timing')) {
            return {
                ok: true,
                status: 200,
                headers: new Headers({ 'server-timing': 'db;dur=50;desc="Postgres", render;dur=100' }),
                json: async () => ({}),
                clone: () => this as any
            } as any;
        }

        return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) } as any;
    }
}

describe('New Plugins', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('GraphQL: should handle success via helper', async () => {
        // Need baseUrl ending in /graphql for mock to match
        const client = createClient({ 
            baseUrl: 'http://test/graphql',
            transport: new MockTransport() 
        });
        const res = await graphql(client, 'query { user { name } }');
        expect(res).toEqual({ user: { name: 'Alice' } });
    });

    it('GraphQL: should throw on errors with plugin', async () => {
        const client = createClient({ 
            baseUrl: 'http://test/graphql', // Fix URL matching
            transport: new MockTransport(),
            plugins: [graphqlPlugin()]
        });

        await expect(client.post('', { query: 'error' })).rejects.toThrow(GraphQLError);
    });

    it('Server-Timing: should parse headers', async () => {
        const client = createClient({
            baseUrl: 'http://test',
            transport: new MockTransport(),
            plugins: [serverTiming()]
        });

        const res: any = await client.get('/timing');
        expect(res.serverTimings).toBeDefined();
        expect(res.serverTimings[0]).toEqual({ name: 'db', duration: 50, description: 'Postgres' });
    });

    it('HAR Recorder: should record entry', async () => {
        const client = createClient({
            baseUrl: 'http://test',
            transport: new MockTransport(),
            plugins: [harRecorder({ path: 'test.har' })]
        });

        await client.get('/test');
        
        expect(writeFileSync).toHaveBeenCalled();
        const args = vi.mocked(writeFileSync).mock.calls[0];
        expect(args[0]).toBe('test.har');
        expect(args[1]).toContain('"creator":');
    });

    it('HAR Player: should replay response', async () => {
        const harData = {
            log: {
                entries: [{
                    request: { method: 'GET', url: 'http://replay.com/' },
                    response: {
                        status: 201,
                        statusText: 'Created',
                        headers: [{ name: 'x-foo', value: 'bar' }],
                        content: { text: '{"success":true}' }
                    }
                }]
            }
        };

        vi.mocked(readFileSync).mockReturnValue(JSON.stringify(harData));

        const client = createClient({
            baseUrl: 'http://replay.com', // Satisfy constructor
            transport: new MockTransport(), // Dummy transport (should be bypassed)
            plugins: [harPlayer({ path: 'test.har' })]
        });

        const res = await client.get('http://replay.com/');
        expect(res.status).toBe(201);
        expect(await res.json()).toEqual({ success: true });
    });
});
