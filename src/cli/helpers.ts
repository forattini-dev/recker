/**
 * CLI Helpers - Shared utilities for CLI commands
 *
 * Provides:
 * - Consistent error formatting with suggestions
 * - Help text formatting
 * - Progress indicators
 * - Color utilities
 */

import {
  classifyError as classifyErrorCore,
  formatErrorForTerminal,
  ClassifiedError,
  type ErrorCategory,
} from '../core/error-handler.js';

// Re-export for convenience
export { classifyErrorCore as classifyError };

// Use picocolors for consistent coloring
import colors from 'picocolors';

export { colors };

/**
 * Format an error for CLI output with suggestion
 */
export function formatCliError(
  error: Error | string | unknown,
  context?: Record<string, unknown>
): string {
  const classified = classifyErrorCore(error, context);
  return formatErrorForTerminal(classified, {
    verbose: process.env.DEBUG === 'true' || process.env.VERBOSE === 'true',
    colors: {
      red: colors.red,
      yellow: colors.yellow,
      cyan: colors.cyan,
      gray: colors.gray,
      magenta: colors.magenta,
      bold: colors.bold,
      green: colors.green,
    },
  });
}

/**
 * Print an error to stderr with formatting
 */
export function printError(error: Error | string | unknown, context?: Record<string, unknown>): void {
  console.error('');
  console.error(formatCliError(error, context));
  console.error('');
}

/**
 * Create a boxed help section
 */
export function helpSection(title: string, content: string): string {
  return `
${colors.bold(colors.cyan(title))}
${content}`;
}

/**
 * Format command usage
 */
export function helpUsage(command: string, args: string, description?: string): string {
  const usage = `  ${colors.green(command)} ${colors.gray(args)}`;
  if (description) {
    return `${usage}
    ${colors.gray(description)}`;
  }
  return usage;
}

/**
 * Format an option for help text
 */
export function helpOption(name: string, description: string, defaultValue?: string): string {
  const def = defaultValue ? colors.gray(` (default: ${defaultValue})`) : '';
  return `  ${colors.white(name.padEnd(20))} ${description}${def}`;
}

/**
 * Format an example for help text
 */
export function helpExample(command: string, description?: string): string {
  const desc = description ? `  ${colors.gray(`# ${description}`)}` : '';
  return `${desc}
  ${colors.green(`$ ${command}`)}`;
}

/**
 * Build complete help text for a command
 */
export interface HelpConfig {
  name: string;
  description: string;
  usage: Array<{ command: string; args: string; description?: string }>;
  options?: Array<{ name: string; description: string; default?: string }>;
  examples: Array<{ command: string; description?: string }>;
  seeAlso?: string[];
  tips?: string[];
}

export function buildHelpText(config: HelpConfig): string {
  const sections: string[] = [];

  // Header
  sections.push(`
${colors.bold(colors.cyan(config.name.toUpperCase()))} - ${config.description}
`);

  // Usage
  sections.push(colors.bold('Usage:'));
  for (const usage of config.usage) {
    sections.push(helpUsage(usage.command, usage.args, usage.description));
  }

  // Options
  if (config.options && config.options.length > 0) {
    sections.push('');
    sections.push(colors.bold('Options:'));
    for (const opt of config.options) {
      sections.push(helpOption(opt.name, opt.description, opt.default));
    }
  }

  // Examples
  sections.push('');
  sections.push(colors.bold('Examples:'));
  for (const ex of config.examples) {
    sections.push(helpExample(ex.command, ex.description));
  }

  // Tips
  if (config.tips && config.tips.length > 0) {
    sections.push('');
    sections.push(colors.bold('Tips:'));
    for (const tip of config.tips) {
      sections.push(`  ${colors.gray('•')} ${tip}`);
    }
  }

  // See Also
  if (config.seeAlso && config.seeAlso.length > 0) {
    sections.push('');
    sections.push(colors.bold('See Also:'));
    sections.push(`  ${config.seeAlso.map((cmd) => colors.green(cmd)).join(', ')}`);
  }

  return sections.join('\n');
}

/**
 * Categorize and format multiple errors (for spider, etc.)
 */
export interface ErrorSummary {
  total: number;
  byType: Map<string, Array<{ url: string; error: string; classified: ClassifiedError }>>;
  retriable: number;
  nonRetriable: number;
}

export function summarizeErrors(
  errors: Array<{ url: string; error: string }>
): ErrorSummary {
  const byType = new Map<string, Array<{ url: string; error: string; classified: ClassifiedError }>>();
  let retriable = 0;
  let nonRetriable = 0;

  for (const err of errors) {
    const classified = classifyErrorCore(err.error);
    const type = classified.category.type;

    if (!byType.has(type)) {
      byType.set(type, []);
    }
    byType.get(type)!.push({ ...err, classified });

    if (classified.retry.should) {
      retriable++;
    } else {
      nonRetriable++;
    }
  }

  return {
    total: errors.length,
    byType,
    retriable,
    nonRetriable,
  };
}

/**
 * Format error summary for terminal
 */
export function formatErrorSummary(summary: ErrorSummary, maxDetails: number = 10): string {
  const lines: string[] = [];

  lines.push(colors.bold('\nErrors Summary:'));

  // By type
  lines.push(colors.gray('  By type:'));
  const sortedTypes = Array.from(summary.byType.entries())
    .sort((a, b) => b[1].length - a[1].length);

  for (const [type, errs] of sortedTypes) {
    const first = errs[0].classified;
    const colorFn = colors[first.category.color] || colors.red;
    const retriableTag = first.retry.should ? colors.green(' [retriable]') : '';
    lines.push(`    ${colorFn(type.padEnd(15))} ${errs.length} error${errs.length > 1 ? 's' : ''}${retriableTag}`);
  }

  // Retriable summary
  if (summary.retriable > 0) {
    lines.push('');
    lines.push(`  ${colors.green('Retriable:')} ${summary.retriable} errors can be fixed by retrying`);
    lines.push(`  ${colors.yellow('Non-retriable:')} ${summary.nonRetriable} errors need manual intervention`);
  }

  // Details
  lines.push('');
  lines.push(colors.gray(`  Details (showing ${Math.min(maxDetails, summary.total)} of ${summary.total}):`));

  let shown = 0;
  for (const [, errs] of sortedTypes) {
    for (const err of errs) {
      if (shown >= maxDetails) break;

      const { classified } = err;
      const colorFn = colors[classified.category.color] || colors.red;
      let path: string;
      try {
        path = new URL(err.url).pathname;
      } catch {
        path = err.url;
      }

      lines.push(`    ${colorFn('✗')} ${colorFn(classified.category.type.padEnd(12))} ${path.slice(0, 30).padEnd(30)} ${colors.gray(classified.message)}`);
      shown++;
    }
    if (shown >= maxDetails) break;
  }

  if (summary.total > maxDetails) {
    lines.push(colors.gray(`    ... and ${summary.total - maxDetails} more errors`));
  }

  // Suggestions for common issues
  const suggestions: string[] = [];

  if (summary.byType.has('TIMEOUT')) {
    suggestions.push('Timeout errors: Try reducing concurrency or increasing timeout');
  }
  if (summary.byType.has('HTTP_429')) {
    suggestions.push('Rate limit (429): Wait for rate limit reset, reduce request frequency');
  }
  if (summary.byType.has('DNS')) {
    suggestions.push('DNS errors: Check domain spelling, verify DNS configuration');
  }
  if (summary.byType.has('CONN_REFUSED') || summary.byType.has('CONN_RESET')) {
    suggestions.push('Connection errors: Server may be down or blocking requests');
  }
  if (summary.byType.has('TLS_INVALID') || summary.byType.has('TLS_EXPIRED')) {
    suggestions.push('TLS errors: Certificate issue on server side');
  }
  if (summary.byType.has('HTTP_401') || summary.byType.has('HTTP_403')) {
    suggestions.push('Auth errors: Check credentials and permissions');
  }

  if (suggestions.length > 0) {
    lines.push('');
    lines.push(colors.bold('  Suggestions:'));
    for (const sug of suggestions) {
      lines.push(`    ${colors.cyan('→')} ${sug}`);
    }
  }

  return lines.join('\n');
}

/**
 * Print a success message
 */
export function printSuccess(message: string): void {
  console.log(`${colors.green('✔')} ${message}`);
}

/**
 * Print a warning message
 */
export function printWarning(message: string): void {
  console.log(`${colors.yellow('⚠')} ${message}`);
}

/**
 * Print an info message
 */
export function printInfo(message: string): void {
  console.log(`${colors.cyan('ℹ')} ${message}`);
}

/**
 * Print a debug message (only if DEBUG is set)
 */
export function printDebug(message: string): void {
  if (process.env.DEBUG) {
    console.log(`${colors.gray('[debug]')} ${message}`);
  }
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

/**
 * Format bytes in human-readable format
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Command help definitions - centralized documentation
 */
export const COMMAND_HELP: Record<string, HelpConfig> = {
  // HTTP Commands
  get: {
    name: 'GET',
    description: 'Make an HTTP GET request',
    usage: [
      { command: 'rek', args: '<url>', description: 'Simple GET request' },
      { command: 'rek get', args: '<url> [headers...]', description: 'GET with headers' },
    ],
    options: [
      { name: '-v, --verbose', description: 'Show full request/response details' },
      { name: '-q, --quiet', description: 'Output only response body' },
      { name: '-o, --output <file>', description: 'Write response to file' },
      { name: '-j, --json', description: 'Force JSON content-type' },
    ],
    examples: [
      { command: 'rek httpbin.org/json', description: 'Simple GET' },
      { command: 'rek api.example.com/users Authorization:"Bearer token"', description: 'With header' },
      { command: 'rek api.example.com/data -o data.json', description: 'Save to file' },
      { command: 'rek @github/user', description: 'Using preset' },
    ],
    tips: [
      'Headers use Key:Value syntax (colon, no space)',
      'Use presets (@github, @openai) for pre-configured APIs',
      'Pipe output with -q for scripting',
    ],
  },

  post: {
    name: 'POST',
    description: 'Make an HTTP POST request',
    usage: [
      { command: 'rek post', args: '<url> [data...]', description: 'POST with data' },
    ],
    options: [
      { name: 'key=value', description: 'String data' },
      { name: 'key:=value', description: 'Typed data (number, boolean, null)' },
      { name: 'Key:Value', description: 'Header' },
    ],
    examples: [
      { command: 'rek post api.com/users name="John" email="john@test.com"', description: 'String data' },
      { command: 'rek post api.com/items count:=42 active:=true', description: 'Typed data' },
      { command: 'rek post api.com/login Content-Type:application/json user="admin"', description: 'With header' },
    ],
    tips: [
      'Use := for numbers, booleans, and null',
      'Use = for strings (can include quotes)',
      'JSON body is auto-detected',
    ],
  },

  // Spider
  spider: {
    name: 'Spider',
    description: 'Crawl a website following internal links',
    usage: [
      { command: 'rek spider', args: '<url> [options]', description: 'Crawl a website' },
    ],
    options: [
      { name: 'depth=N', description: 'Max crawl depth', default: '5' },
      { name: 'limit=N', description: 'Max pages to crawl', default: '100' },
      { name: 'concurrency=N', description: 'Parallel requests', default: '5' },
      { name: 'seo', description: 'Enable SEO analysis mode' },
      { name: 'focus=MODE', description: 'Focus on: links, duplicates, security, ai, resources, all' },
      { name: 'output=FILE', description: 'Save JSON report to file' },
    ],
    examples: [
      { command: 'rek spider example.com', description: 'Basic crawl' },
      { command: 'rek spider example.com depth=2 limit=50', description: 'Quick crawl' },
      { command: 'rek spider example.com seo', description: 'With SEO analysis' },
      { command: 'rek spider example.com seo focus=security output=report.json', description: 'Security audit' },
    ],
    tips: [
      'Start with low limit for testing',
      'Use seo mode for comprehensive audits',
      'Reduce concurrency if getting rate limited',
      'Check robots.txt before crawling',
    ],
    seeAlso: ['seo', 'robots', 'sitemap'],
  },

  // DNS
  dns: {
    name: 'DNS',
    description: 'DNS lookup and diagnostics tools',
    usage: [
      { command: 'rek dns lookup', args: '<domain> [type]', description: 'DNS record lookup' },
      { command: 'rek dns propagate', args: '<domain> [type]', description: 'Check global propagation' },
      { command: 'rek dns health', args: '<domain>', description: 'DNS health check' },
      { command: 'rek dns email', args: '<domain>', description: 'Email DNS audit (SPF, DKIM, DMARC)' },
      { command: 'rek dns spf', args: '<domain>', description: 'Validate SPF record' },
      { command: 'rek dns dmarc', args: '<domain>', description: 'Validate DMARC record' },
      { command: 'rek dns dkim', args: '<domain> [selector]', description: 'Check DKIM record' },
      { command: 'rek dns reverse', args: '<ip>', description: 'Reverse DNS lookup' },
    ],
    examples: [
      { command: 'rek dns lookup google.com', description: 'A record lookup' },
      { command: 'rek dns lookup google.com MX', description: 'MX record lookup' },
      { command: 'rek dns propagate example.com A', description: 'Check propagation' },
      { command: 'rek dns email example.com', description: 'Full email DNS audit' },
      { command: 'rek dns dkim example.com google', description: 'DKIM for Google Workspace' },
    ],
    tips: [
      'Use propagate after DNS changes',
      'Email command checks SPF, DKIM, and DMARC together',
      'Common DKIM selectors: google, selector1, default',
    ],
    seeAlso: ['dig', 'whois', 'rdap'],
  },

  // SEO
  seo: {
    name: 'SEO',
    description: 'Analyze page SEO (title, meta, headings, images, structured data)',
    usage: [
      { command: 'rek seo', args: '<url> [options]', description: 'Analyze single page SEO' },
    ],
    options: [
      { name: '-a, --all', description: 'Show all checks including passed' },
      { name: '--format json', description: 'Output as JSON' },
    ],
    examples: [
      { command: 'rek seo example.com', description: 'Basic SEO analysis' },
      { command: 'rek seo example.com -a', description: 'Show all checks' },
      { command: 'rek seo example.com --format json', description: 'JSON output for CI/CD' },
    ],
    tips: [
      'Use spider with seo mode for site-wide analysis',
      'JSON format is perfect for CI/CD pipelines',
      'Score 80+ is considered good',
    ],
    seeAlso: ['spider', 'robots', 'sitemap', 'llms'],
  },

  // TLS
  tls: {
    name: 'TLS/SSL',
    description: 'Inspect TLS/SSL certificate',
    usage: [
      { command: 'rek tls', args: '<host> [port]', description: 'Inspect certificate' },
      { command: 'rek ssl', args: '<host> [port]', description: 'Alias for tls' },
    ],
    options: [
      { name: 'port', description: 'Port to connect to', default: '443' },
    ],
    examples: [
      { command: 'rek tls google.com', description: 'Check HTTPS certificate' },
      { command: 'rek tls mail.example.com 587', description: 'Check SMTP certificate' },
      { command: 'rek ssl localhost 8443', description: 'Check local dev server' },
    ],
    tips: [
      'Shows expiration date and days remaining',
      'Validates certificate chain',
      'Use port 587/465 for email servers',
    ],
    seeAlso: ['security', 'ping'],
  },

  // Security
  security: {
    name: 'Security',
    description: 'Analyze HTTP security headers',
    usage: [
      { command: 'rek security', args: '<url>', description: 'Analyze security headers' },
    ],
    examples: [
      { command: 'rek security example.com', description: 'Check security headers' },
    ],
    tips: [
      'Checks HSTS, CSP, X-Frame-Options, etc.',
      'Grade A+ requires all major headers',
      'Use for security audits and compliance',
    ],
    seeAlso: ['tls', 'seo'],
  },

  // WHOIS
  whois: {
    name: 'WHOIS',
    description: 'Domain and IP registration lookup',
    usage: [
      { command: 'rek whois', args: '<domain>', description: 'Domain WHOIS lookup' },
      { command: 'rek whois', args: '<ip>', description: 'IP WHOIS lookup' },
    ],
    options: [
      { name: '--raw', description: 'Show raw WHOIS response' },
    ],
    examples: [
      { command: 'rek whois google.com', description: 'Domain lookup' },
      { command: 'rek whois 8.8.8.8', description: 'IP lookup' },
    ],
    tips: [
      'Use rdap for modern, structured data',
      'Shows registrar, dates, and status',
      'IP lookup shows network allocation',
    ],
    seeAlso: ['rdap', 'dns', 'ip'],
  },

  // FTP
  ftp: {
    name: 'FTP',
    description: 'FTP client operations',
    usage: [
      { command: 'rek ftp ls', args: '<host> [path] [options]', description: 'List directory' },
      { command: 'rek ftp get', args: '<host> <remote> [local] [options]', description: 'Download file' },
      { command: 'rek ftp put', args: '<host> <local> [remote] [options]', description: 'Upload file' },
      { command: 'rek ftp rm', args: '<host> <path> [options]', description: 'Delete file' },
      { command: 'rek ftp mkdir', args: '<host> <path> [options]', description: 'Create directory' },
    ],
    options: [
      { name: '-u, --user <user>', description: 'FTP username' },
      { name: '-p, --password <pass>', description: 'FTP password' },
      { name: '-P, --port <port>', description: 'FTP port', default: '21' },
      { name: '-s, --secure', description: 'Use FTPS (TLS)' },
      { name: '--passive', description: 'Use passive mode' },
    ],
    examples: [
      { command: 'rek ftp ls ftp.example.com /pub', description: 'List directory' },
      { command: 'rek ftp get ftp.example.com /file.txt -u admin -p secret', description: 'Download with auth' },
      { command: 'rek ftp put ftp.example.com ./local.txt /remote.txt -s', description: 'Upload via FTPS' },
    ],
    tips: [
      'Use --secure for FTPS connections',
      'Use --passive behind NAT/firewalls',
      'Anonymous FTP often uses "anonymous" with email as password',
    ],
    seeAlso: ['sftp', 'upload', 'download'],
  },

  // HAR
  har: {
    name: 'HAR',
    description: 'HTTP Archive recording and playback',
    usage: [
      { command: 'rek har record', args: '<file> [url]', description: 'Record requests to HAR file' },
      { command: 'rek har play', args: '<file>', description: 'Replay requests from HAR file' },
      { command: 'rek har info', args: '<file>', description: 'Show HAR file info' },
    ],
    options: [
      { name: '-c, --count <n>', description: 'Number of replay iterations', default: '1' },
      { name: '-d, --delay <ms>', description: 'Delay between requests', default: '0' },
    ],
    examples: [
      { command: 'rek har record session.har', description: 'Start recording' },
      { command: 'rek har play session.har', description: 'Replay recorded requests' },
      { command: 'rek har info session.har', description: 'View HAR contents' },
    ],
    tips: [
      'HAR files can be imported from browser DevTools',
      'Great for API testing and debugging',
      'Use replay for load testing scenarios',
    ],
  },

  // HLS
  hls: {
    name: 'HLS',
    description: 'HLS streaming operations',
    usage: [
      { command: 'rek hls info', args: '<url>', description: 'Get stream information' },
      { command: 'rek hls download', args: '<url> [output]', description: 'Download stream' },
    ],
    options: [
      { name: '-q, --quality <level>', description: 'Quality: highest, lowest, or bandwidth number' },
      { name: '-o, --output <file>', description: 'Output filename' },
    ],
    examples: [
      { command: 'rek hls info https://example.com/stream.m3u8', description: 'Stream info' },
      { command: 'rek hls download https://example.com/stream.m3u8 video.ts', description: 'Download' },
      { command: 'rek hls download https://example.com/stream.m3u8 -q lowest', description: 'Download lowest quality' },
    ],
    tips: [
      'Info shows available quality levels',
      'Downloaded segments are merged into one file',
      'Some streams may require authentication',
    ],
  },

  // Serve
  serve: {
    name: 'Serve',
    description: 'Start mock servers for testing',
    usage: [
      { command: 'rek serve http', args: '[options]', description: 'HTTP mock server' },
      { command: 'rek serve webhook', args: '[options]', description: 'Webhook receiver' },
      { command: 'rek serve websocket', args: '[options]', description: 'WebSocket server' },
      { command: 'rek serve sse', args: '[options]', description: 'SSE server' },
      { command: 'rek serve dns', args: '[options]', description: 'DNS server' },
      { command: 'rek serve ftp', args: '[options]', description: 'FTP server' },
    ],
    options: [
      { name: '-p, --port <port>', description: 'Server port' },
      { name: '-h, --host <host>', description: 'Bind address', default: '0.0.0.0' },
    ],
    examples: [
      { command: 'rek serve http -p 3000', description: 'HTTP on port 3000' },
      { command: 'rek serve webhook -p 8080', description: 'Webhook receiver' },
      { command: 'rek serve websocket', description: 'WebSocket on default port' },
    ],
    tips: [
      'Perfect for local testing and development',
      'Webhook server shows incoming request details',
      'Mock servers respond with useful test data',
    ],
  },

  // AI
  ai: {
    name: 'AI',
    description: 'AI chat and completion',
    usage: [
      { command: 'rek ai', args: '<preset> <prompt...>', description: 'Single AI prompt' },
    ],
    options: [
      { name: '-m, --model <model>', description: 'Override default model' },
      { name: '-t, --temperature <n>', description: 'Temperature (0-2)', default: '1' },
      { name: '--max-tokens <n>', description: 'Max response tokens' },
      { name: '-s, --stream', description: 'Stream response' },
    ],
    examples: [
      { command: 'rek ai openai "Explain quantum computing"', description: 'OpenAI' },
      { command: 'rek ai anthropic "Write a haiku about coding"', description: 'Anthropic Claude' },
      { command: 'rek ai groq "Summarize this" -m llama-3.1-70b-versatile', description: 'Groq with model' },
    ],
    tips: [
      'Set API key via environment variable (OPENAI_API_KEY, etc.)',
      'Use shell mode for conversational AI with memory',
      'Stream mode shows response in real-time',
    ],
    seeAlso: ['shell'],
  },

  // Bench
  bench: {
    name: 'Bench',
    description: 'Performance benchmarking tools',
    usage: [
      { command: 'rek bench load', args: '<url> [options]', description: 'Load testing with dashboard' },
    ],
    options: [
      { name: 'users=N', description: 'Concurrent users', default: '50' },
      { name: 'duration=N', description: 'Duration in seconds', default: '300' },
      { name: 'ramp=N', description: 'Ramp-up time in seconds', default: '5' },
      { name: 'mode=MODE', description: 'Mode: realistic, throughput, stress', default: 'realistic' },
      { name: 'http2', description: 'Enable HTTP/2' },
    ],
    examples: [
      { command: 'rek bench load https://api.example.com/health', description: 'Quick load test' },
      { command: 'rek bench load https://api.example.com/users users=100 duration=60', description: '100 users for 1 minute' },
      { command: 'rek bench load https://api.example.com/api mode=stress', description: 'Stress test' },
    ],
    tips: [
      'Start with low users to establish baseline',
      'Use mode=stress to find breaking points',
      'Watch error rate for signs of overload',
      'Press Ctrl+C to stop early',
    ],
  },
};

/**
 * Get help text for a command
 */
export function getCommandHelp(command: string): string | null {
  const help = COMMAND_HELP[command.toLowerCase()];
  if (!help) return null;
  return buildHelpText(help);
}
