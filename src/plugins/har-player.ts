import { Plugin, Middleware, ReckerRequest, ReckerResponse } from '../types/index.js';
import { readFileSync } from 'node:fs';
import { HttpResponse } from '../core/response.js';
import { ParseError, NotFoundError } from '../core/errors.js';
import type { Client } from '../core/client.js';

export interface HarPlayerOptions {
  path: string; // Path to .har file
  /** If true, throws error if no matching request is found in HAR (Strict Mode) */
  strict?: boolean;
}

interface HarEntry {
  request: {
    method: string;
    url: string;
    postData?: { text: string };
  };
  response: {
    status: number;
    statusText: string;
    headers: { name: string; value: string }[];
    content: { mimeType: string; text: string };
  };
  startedDateTime?: string;
}

export function harPlayerPlugin(options: HarPlayerOptions): Plugin {
  let entries: HarEntry[] = [];

  try {
    const content = readFileSync(options.path, 'utf-8');
    const har = JSON.parse(content);
    entries = har.log.entries;
  } catch (err) {
    throw new ParseError(
      `Failed to load HAR file: ${options.path}`,
      {
        format: 'har',
      }
    );
  }

  // Helper to match request against HAR entry
  const matchEntry = (req: ReckerRequest, entry: HarEntry) => {
    // 1. Method
    if (req.method !== entry.request.method) return false;
    
    // 2. URL (Exact match for now)
    // TODO: Ignore dynamic query params?
    if (req.url !== entry.request.url) return false;

    // 3. Body (if applicable)
    if (entry.request.postData?.text && req.body) {
        // Naive check: exact string match.
        // Ideally we should normalize JSON.
        if (String(req.body) !== entry.request.postData.text) {
            try {
                // Try JSON deep equal check
                const reqJson = JSON.parse(String(req.body));
                const entryJson = JSON.parse(entry.request.postData.text);
                if (JSON.stringify(reqJson) !== JSON.stringify(entryJson)) return false;
            } catch {
                return false;
            }
        }
    }

    return true;
  };

  const middleware: Middleware = async (req, next) => {
    const entry = entries.find(e => matchEntry(req, e));

    if (entry) {
      // Reconstruct Response from HAR
      const headers = new Headers();
      entry.response.headers.forEach(h => headers.append(h.name, h.value));

      // Create native Response
      const nativeRes = new Response(entry.response.content.text, {
        status: entry.response.status,
        statusText: entry.response.statusText,
        headers: headers
      });

      // Return wrapped
      return new HttpResponse(nativeRes);
    }

    if (options.strict) {
      throw new NotFoundError(
        `[Recker HAR Player] No matching recording found for ${req.method} ${req.url}`,
        {
          resource: `${req.method} ${req.url}`,
          request: req,
        }
      );
    }

    // Pass through if not strict (mixed mode)
    return next(req);
  };

  return (client) => {
    client.use(middleware);
  };
}

export async function harInfo(path: string) {
  const content = readFileSync(path, 'utf-8');
  const har = JSON.parse(content);
  const entries: HarEntry[] = har.log.entries;
  
  const hosts = new Set<string>();
  entries.forEach((e) => {
    try {
        const url = new URL(e.request.url);
        hosts.add(url.hostname);
    } catch {}
  });

  return {
    entryCount: entries.length,
    startedDateTime: entries[0]?.startedDateTime || new Date().toISOString(),
    topHosts: Array.from(hosts).slice(0, 5)
  };
}

export async function harPlayer(
    client: Client, 
    path: string, 
    options: { count?: number; delay?: number; overrideHeaders?: Record<string, string>; onProgress?: (p: { completed: number, total: number }) => void }
) {
    const content = readFileSync(path, 'utf-8');
    const har = JSON.parse(content);
    const entries: HarEntry[] = har.log.entries;
    const results = [];
    
    const count = options.count || 1;
    const total = entries.length * count;
    let completed = 0;

    for (let i = 0; i < count; i++) {
        for (const entry of entries) {
            if (options.delay) await new Promise(r => setTimeout(r, options.delay));
            
            const req = entry.request;
            try {
                const headers = { ...options.overrideHeaders };
                
                await client.request(req.url, {
                    method: req.method as any,
                    headers,
                    body: req.postData?.text
                });
                results.push({ url: req.url, status: 200 });
            } catch (e) {
                results.push({ url: req.url, error: e });
            }
            completed++;
            options.onProgress?.({ completed, total });
        }
    }
    return results;
}