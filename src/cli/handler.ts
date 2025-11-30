import { createClient } from '../core/client.js';
import { requireOptional } from '../utils/optional-require.js';
import pc from '../utils/colors.js';
import oraImport from 'ora';

// Lazy-loaded optional dependency
let highlight: (code: string, opts?: any) => string;
const ora = oraImport;

/**
 * Initialize CLI dependencies dynamically
 */
async function initDependencies() {
  if (!highlight) {
    try {
      const cardinal = await requireOptional<{ highlight: typeof highlight }>('cardinal', 'recker/cli');
      highlight = cardinal.highlight;
    } catch {
      // Fallback: no syntax highlighting if cardinal not installed
      highlight = (code: string) => code;
    }
  }
}

interface RequestOptions {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: any;
  verbose?: boolean;
  presetConfig?: any;
}

export async function handleRequest(options: RequestOptions) {
  // Load dependencies on first call
  await initDependencies();

  const spinner = ora({
    text: `${pc.bold(options.method)} ${pc.cyan(options.url)}`,
    color: 'cyan',
    spinner: 'dots'
  }).start();

  const start = performance.now();

  try {
    let client;

    if (options.presetConfig) {
      client = createClient(options.presetConfig);
    } else {
      // Standard mode: derive base from URL
      try {
        const urlObj = new URL(options.url);
        client = createClient({ baseUrl: urlObj.origin });
      } catch {
        // Fallback for when URL is actually a relative path (shouldn't happen in standard mode but possible)
        client = createClient();
      }
    }

    // Serialize body if present
    let requestBody = undefined;
    if (options.body) {
      // If body is already a string, use it as-is (e.g., from stdin pipe)
      // Otherwise, serialize as JSON
      if (typeof options.body === 'string') {
        requestBody = options.body;
        // Try to detect if it's JSON content
        if (!options.headers['Content-Type'] && !options.headers['content-type']) {
          try {
            JSON.parse(options.body);
            options.headers['Content-Type'] = 'application/json';
          } catch {
            // Not JSON, use text/plain
            options.headers['Content-Type'] = 'text/plain';
          }
        }
      } else {
        requestBody = JSON.stringify(options.body);
        // Ensure Content-Type is set
        if (!options.headers['Content-Type'] && !options.headers['content-type']) {
          options.headers['Content-Type'] = 'application/json';
        }
      }
    }

    const response = await client.request(options.url, {
      method: options.method as any,
      headers: options.headers,
      body: requestBody
    });

    const duration = Math.round(performance.now() - start);
    spinner.stop();

    // Status Line
    const statusColor = response.ok ? pc.green : pc.red;
    console.log(
      `${statusColor(pc.bold(response.status))} ${statusColor(response.statusText)} ` +
      `${pc.gray(`(${duration}ms)`)}`
    );

    // Verbose: Request details
    if (options.verbose) {
        console.log(pc.gray('\n--- Request ---'));
        console.log(`${pc.bold(options.method)} ${options.url}`);
        Object.entries(options.headers).forEach(([k, v]) => {
            console.log(`${pc.blue(k)}: ${v}`);
        });
        if (options.body) {
            console.log(pc.gray('Body:'), JSON.stringify(options.body, null, 2));
        }
        console.log(pc.gray('---------------\n'));
    }

    // Verbose: Response Headers
    if (options.verbose) {
        console.log(pc.gray('--- Response Headers ---'));
        response.headers.forEach((value, key) => {
            console.log(`${pc.blue(key)}: ${value}`);
        });
        console.log(pc.gray('------------------------\n'));
    }

    // Response Body
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    if (!text) return;

    if (contentType.includes('application/json')) {
      try {
        // Pretty print JSON
        const jsonObj = JSON.parse(text);
        const jsonString = JSON.stringify(jsonObj, null, 2);
        // Highlight syntax
        console.log(highlight(jsonString));
      } catch {
        console.log(text);
      }
    } else {
      // TODO: HTML highlighting later
      console.log(text);
    }

  } catch (error) {
    spinner.fail(pc.red('Request Failed'));
    throw error;
  }
}
