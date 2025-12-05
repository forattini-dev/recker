import { createClient } from '../core/client.js';
import { requireOptional } from '../utils/optional-require.js';
import colors from '../utils/colors.js';
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
  quiet?: boolean;
  output?: string;
  presetConfig?: any;
}

export async function handleRequest(options: RequestOptions) {
  // Load dependencies on first call
  await initDependencies();

  // Handle EPIPE errors gracefully (happens when piping to commands like `head`)
  // This is standard Unix behavior - the reader closed the pipe
  if (options.quiet) {
    process.stdout.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE') {
        process.exit(0); // Success - reader just closed early
      }
    });
  }

  // In quiet mode, skip spinner entirely
  const spinner = options.quiet ? null : ora({
    text: `${colors.bold(options.method)} ${colors.cyan(options.url)}`,
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
    spinner?.stop();

    // Get response body
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    // Quiet mode: raw output only (for piping to bash, etc.)
    if (options.quiet) {
      if (options.output) {
        // Write to file
        const fsPromises = await import('node:fs/promises');
        await fsPromises.writeFile(options.output, text);
        // Exit silently on success, with error code on failure
        if (!response.ok) {
          process.exit(1);
        }
        return;
      }
      // Write raw body to stdout (no formatting, no colors)
      process.stdout.write(text);
      // Exit with error code if response was not ok
      if (!response.ok) {
        process.exit(1);
      }
      return;
    }

    // Status Line
    const statusColor = response.ok ? colors.green : colors.red;
    console.log(
      `${statusColor(colors.bold(response.status))} ${statusColor(response.statusText)} ` +
      `${colors.gray(`(${duration}ms)`)}`
    );

    // Verbose: Request details
    if (options.verbose) {
        console.log(colors.gray('\n--- Request ---'));
        console.log(`${colors.bold(options.method)} ${options.url}`);
        Object.entries(options.headers).forEach(([k, v]) => {
            console.log(`${colors.blue(k)}: ${v}`);
        });
        if (options.body) {
            console.log(colors.gray('Body:'), JSON.stringify(options.body, null, 2));
        }
        console.log(colors.gray('---------------\n'));
    }

    // Verbose: Response Headers
    if (options.verbose) {
        console.log(colors.gray('--- Response Headers ---'));
        response.headers.forEach((value, key) => {
            console.log(`${colors.blue(key)}: ${value}`);
        });
        console.log(colors.gray('------------------------\n'));
    }

    // Output to file if specified
    if (options.output) {
      const fsPromises = await import('node:fs/promises');
      await fsPromises.writeFile(options.output, text);
      console.log(colors.green(`✓ Saved to ${options.output}`));
      return;
    }

    // Response Body
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
    if (options.quiet) {
      // In quiet mode, just exit with error
      process.exit(1);
    }
    spinner?.fail(colors.red('Request Failed'));
    throw error;
  }
}
