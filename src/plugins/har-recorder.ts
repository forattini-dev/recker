import { Plugin, ReckerRequest, ReckerResponse } from '../types/index.js';
import { writeFileSync } from 'node:fs';

export interface HarOptions {
  path?: string; // If provided, writes to disk automatically
  onEntry?: (entry: any) => void; // Callback for each entry
}

export function harRecorderPlugin(options: HarOptions = {}): Plugin {
  const entries: any[] = [];
  const startTime = new Date().toISOString();

  return (client: any) => {
    // We need to store start time per request
    const requestMap = new WeakMap<ReckerRequest, { start: number, req: ReckerRequest }>();

    client.beforeRequest((req: ReckerRequest) => {
      requestMap.set(req, { start: Date.now(), req });
    });

    client.afterResponse(async (req: ReckerRequest, res: ReckerResponse) => {
      const meta = requestMap.get(req);
      if (!meta) return;

      const time = Date.now() - meta.start;
      
      // Basic HAR Entry Structure
      const entry = {
        startedDateTime: new Date(meta.start).toISOString(),
        time: time,
        request: {
          method: req.method,
          url: req.url,
          httpVersion: "HTTP/1.1", // Should detect from connection
          cookies: [],
          headers: [...req.headers].map(([name, value]) => ({ name, value })),
          queryString: [], // TODO: parse from url
          headersSize: -1,
          bodySize: -1
        },
        response: {
          status: res.status,
          statusText: res.statusText,
          httpVersion: "HTTP/1.1",
          cookies: [],
          headers: [...res.headers].map(([name, value]) => ({ name, value })),
          content: {
            size: -1,
            mimeType: res.headers.get('content-type') || '',
            text: '' // We might need to clone to read without consuming
          },
          redirectURL: "",
          headersSize: -1,
          bodySize: -1
        },
        cache: {},
        timings: {
          send: 0,
          wait: res.timings?.firstByte || 0,
          receive: 0
        }
      };

      entries.push(entry);
      
      if (options.onEntry) {
          options.onEntry(entry);
      }

      if (options.path) {
          // Write entire log (inefficient for huge sessions, but simple)
          const har = {
              log: {
                  version: "1.2",
                  creator: { name: "Recker", version: "1.0.0" },
                  pages: [],
                  entries: entries
              }
          };
          writeFileSync(options.path, JSON.stringify(har, null, 2));
      }
    });
  };
}
