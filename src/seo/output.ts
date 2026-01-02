/**
 * SEO Output Utilities
 *
 * Filename generation and file writing for SEO/Spider reports.
 * Follows the pattern from src/cli/commands/live.ts
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, isAbsolute } from 'node:path';

// =============================================================================
// Types
// =============================================================================

export type SeoOutputType = 'seo' | 'spider' | 'seo-spider';

export interface OutputOptions {
  /** Explicit output file path */
  output?: string;
  /** Output directory (auto-generates filename) */
  outputDir?: string;
  /** Report type for filename prefix */
  type: SeoOutputType;
  /** Domain being analyzed */
  domain: string;
  /** File extension (default: json) */
  ext?: 'json' | 'txt';
}

export interface WriteOptions {
  /** Pretty-print JSON (default: true) */
  pretty?: boolean;
}

// =============================================================================
// Filename Generation
// =============================================================================

/**
 * Sanitize domain for use in filenames
 */
function sanitizeDomain(domain: string): string {
  return domain
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/\.+$/, '')
    .slice(0, 50);
}

/**
 * Generate timestamp string: YYYY-MM-DD-HH-mm-ss
 */
function generateTimestamp(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('-');
}

/**
 * Generate an auto-named filename for SEO/Spider reports.
 *
 * Pattern: {type}--{domain}--{YYYY-MM-DD-HH-mm-ss}.{ext}
 *
 * @example
 * generateSeoFilename({ type: 'seo', domain: 'example.com' })
 * // => 'seo--example.com--2025-12-29-14-30-45.json'
 */
export function generateSeoFilename(options: Omit<OutputOptions, 'output' | 'outputDir'>): string {
  const { type, domain, ext = 'json' } = options;
  const safeDomain = sanitizeDomain(domain);
  const timestamp = generateTimestamp();
  return `${type}--${safeDomain}--${timestamp}.${ext}`;
}

/**
 * Resolve the final output path based on options.
 *
 * - If `output` is set, use it directly
 * - If `outputDir` is set, generate filename in that directory
 * - If neither is set, return null (output to stdout)
 *
 * @example
 * resolveOutputPath({ output: 'report.json', type: 'seo', domain: 'example.com' })
 * // => 'report.json'
 *
 * resolveOutputPath({ outputDir: '/tmp/reports', type: 'seo', domain: 'example.com' })
 * // => '/tmp/reports/seo--example.com--2025-12-29-14-30-45.json'
 *
 * resolveOutputPath({ type: 'seo', domain: 'example.com' })
 * // => null (no file output)
 */
export function resolveOutputPath(options: OutputOptions): string | null {
  const { output, outputDir, type, domain, ext = 'json' } = options;

  // Explicit output path takes precedence
  if (output) {
    return output;
  }

  // Auto-generate filename in specified directory
  if (outputDir) {
    const filename = generateSeoFilename({ type, domain, ext });
    return join(outputDir, filename);
  }

  // No file output
  return null;
}

// =============================================================================
// File Writing
// =============================================================================

/**
 * Write a report to a file.
 *
 * - Creates parent directories if needed
 * - Supports both JSON objects and string content
 * - Pretty-prints JSON by default
 *
 * @returns The absolute path of the written file
 */
export async function writeReport(
  path: string,
  content: object | string,
  options: WriteOptions = {}
): Promise<string> {
  const { pretty = true } = options;

  // Ensure directory exists
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });

  // Serialize content
  const data =
    typeof content === 'string'
      ? content
      : pretty
        ? JSON.stringify(content, null, 2)
        : JSON.stringify(content);

  // Write file
  await writeFile(path, data, 'utf-8');

  // Return absolute path for display
  return isAbsolute(path) ? path : join(process.cwd(), path);
}

/**
 * Format a report for JSON output.
 *
 * Adds metadata like analyzedAt timestamp and version.
 */
export function formatReportForJson(
  report: object,
  url: string,
  type: SeoOutputType
): object {
  return {
    _meta: {
      type,
      url,
      analyzedAt: new Date().toISOString(),
      generator: 'recker',
    },
    ...report,
  };
}
