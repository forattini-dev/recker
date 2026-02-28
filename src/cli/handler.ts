import { createClient } from '../core/client.js';
import { requireOptional } from '../utils/optional-require.js';
import colors from '../utils/colors.js';
import type { CliRequestHeaders, CliRequestOptions } from './types.js';
import { createSpinner } from './tui/spinner.js';

// Lazy-loaded optional dependency
type HighlightFn = (code: string, opts?: { theme?: string }) => string;
let highlight: HighlightFn;

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

export async function handleRequest(options: CliRequestOptions) {
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
  const spinner = options.quiet ? null : createSpinner({
    text: `${colors.bold(options.method)} ${colors.cyan(options.url)}`,
    color: 'cyan'
  }).start();

  const start = performance.now();

  try {
    const finalClientOptions: ClientOptions = options.clientOptions || {}; // Start with provided clientOptions
    const legacyBase = 'base' in finalClientOptions ? (finalClientOptions as { base?: string }).base : undefined;

    // If no baseUrl explicitly set in finalClientOptions, try to derive from URL
    if (!finalClientOptions.baseUrl && !legacyBase) {
      try {
        const urlObj = new URL(options.url);
        finalClientOptions.baseUrl = urlObj.origin;
      } catch {
        // Fallback: Use default client if URL is not absolute and no baseUrl is set
        // createClient will fallback to client with no base URL
      }
    }
    
    // Ensure headers are merged: options.headers (from parseMixedArgs) take precedence over clientOptions.headers
    const requestHeaders: CliRequestHeaders = {
      ...(finalClientOptions.headers as CliRequestHeaders | undefined),
      ...options.headers,
    };
    finalClientOptions.headers = requestHeaders;

    const client = createClient(finalClientOptions);

    // Serialize body if present
    let requestBody: string | undefined;
    const headers = { ...requestHeaders };
    if (options.body) {
      // If body is already a string, use it as-is (e.g., from stdin pipe)
      // Otherwise, serialize as JSON
      if (typeof options.body === 'string') {
        requestBody = options.body;
        // Try to detect if it's JSON content
        if (!headers['Content-Type'] && !headers['content-type']) {
          try {
            JSON.parse(options.body);
            headers['Content-Type'] = 'application/json';
          } catch {
            // Not JSON, use text/plain
            headers['Content-Type'] = 'text/plain';
          }
        }
      } else {
        requestBody = JSON.stringify(options.body);
        // Ensure Content-Type is set
        if (!headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = 'application/json';
        }
      }
    }

    const method = options.method;
    const response = await client.request(options.url, {
      method,
      headers,
      ...(requestBody === undefined ? {} : { body: requestBody }),
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
      `${statusColor(colors.bold(String(response.status)))} ${statusColor(response.statusText)} ` +
      `${colors.gray(`(${duration}ms)`)}`
    );

    // Verbose: Request details
    if (options.verbose) {
        console.log(colors.gray('\n--- Request ---'));
        console.log(`${colors.bold(options.method)} ${options.url}`);
        Object.entries(headers).forEach(([k, v]) => {
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
