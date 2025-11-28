import { Plugin, Middleware, ReckerRequest, ReckerResponse } from '../types/index.js';
import { readFileSync } from 'node:fs';
import { HttpResponse } from '../core/response.js';
import { ReckerError } from '../core/errors.js';

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
}

export function harPlayer(options: HarPlayerOptions): Plugin {
  let entries: HarEntry[] = [];

  try {
    const content = readFileSync(options.path, 'utf-8');
    const har = JSON.parse(content);
    entries = har.log.entries;
  } catch (err) {
    throw new ReckerError(
      `Failed to load HAR file: ${options.path}`,
      undefined,
      undefined,
      [
        'Ensure the HAR file exists at the specified path.',
        'Check that the file is valid JSON.',
        'Verify the HAR file has the correct structure (log.entries).'
      ]
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
      throw new ReckerError(
        `[Recker HAR Player] No matching recording found for ${req.method} ${req.url}`,
        req,
        undefined,
        [
          'Ensure the HAR file contains an entry for this URL/method.',
          'Normalize query parameters or body to match the recorded request.',
          'Regenerate the HAR with the exact same request.'
        ]
      );
    }

    // Pass through if not strict (mixed mode)
    return next(req);
  };

  return (client) => {
    client.use(middleware);
  };
}
