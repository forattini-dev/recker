/**
 * robots.txt Parser and Validator
 *
 * Parses and validates robots.txt files according to the Robots Exclusion Standard.
 * @see https://www.robotstxt.org/robotstxt.html
 */

export interface RobotsDirective {
  type: 'user-agent' | 'allow' | 'disallow' | 'sitemap' | 'crawl-delay' | 'host' | 'clean-param';
  value: string;
  line: number;
}

export interface RobotsUserAgentBlock {
  userAgents: string[];
  rules: Array<{
    type: 'allow' | 'disallow';
    path: string;
    line: number;
  }>;
  crawlDelay?: number;
}

export interface RobotsParseResult {
  /** Successfully parsed */
  valid: boolean;
  /** Parse errors */
  errors: Array<{ line: number; message: string }>;
  /** Parse warnings */
  warnings: Array<{ line: number; message: string }>;
  /** All directives in order */
  directives: RobotsDirective[];
  /** User-agent blocks */
  userAgentBlocks: RobotsUserAgentBlock[];
  /** Sitemap URLs found */
  sitemaps: string[];
  /** Host directive (Yandex extension) */
  host?: string;
  /** Whether all robots are blocked */
  blocksAllRobots: boolean;
  /** Whether important pages are blocked */
  blocksImportantPaths: boolean;
  /** File size in bytes */
  size: number;
}

export interface RobotsValidationIssue {
  type: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  line?: number;
  recommendation?: string;
}

export interface RobotsValidationResult {
  valid: boolean;
  issues: RobotsValidationIssue[];
  parseResult: RobotsParseResult;
}

/**
 * Important paths that should generally not be blocked
 */
const IMPORTANT_PATHS = [
  '/',
  '/sitemap.xml',
  '/sitemap',
  '/.well-known/',
  '/robots.txt',
];

/**
 * Common SEO-critical paths
 */
const SEO_CRITICAL_PATHS = [
  '/css',
  '/js',
  '/images',
  '/assets',
  '/static',
  '/fonts',
];

/**
 * Parse a robots.txt file content
 */
export function parseRobotsTxt(content: string): RobotsParseResult {
  const lines = content.split(/\r?\n/);
  const directives: RobotsDirective[] = [];
  const errors: Array<{ line: number; message: string }> = [];
  const warnings: Array<{ line: number; message: string }> = [];
  const sitemaps: string[] = [];
  const userAgentBlocks: RobotsUserAgentBlock[] = [];

  let currentBlock: RobotsUserAgentBlock | null = null;
  let host: string | undefined;
  let blocksAllRobots = false;
  let blocksImportantPaths = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    let line = lines[i].trim();

    // Remove comments
    const commentIndex = line.indexOf('#');
    if (commentIndex !== -1) {
      line = line.substring(0, commentIndex).trim();
    }

    if (!line) continue;

    // Parse directive
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      errors.push({ line: lineNum, message: `Invalid syntax: missing colon` });
      continue;
    }

    const directiveType = line.substring(0, colonIndex).trim().toLowerCase();
    const value = line.substring(colonIndex + 1).trim();

    switch (directiveType) {
      case 'user-agent':
        if (!value) {
          errors.push({ line: lineNum, message: 'Empty user-agent value' });
          continue;
        }

        // Start new block or add to current
        if (!currentBlock || currentBlock.rules.length > 0) {
          currentBlock = { userAgents: [value], rules: [] };
          userAgentBlocks.push(currentBlock);
        } else {
          currentBlock.userAgents.push(value);
        }

        directives.push({ type: 'user-agent', value, line: lineNum });
        break;

      case 'disallow':
        if (!currentBlock) {
          warnings.push({ line: lineNum, message: 'Disallow without preceding User-agent' });
          currentBlock = { userAgents: ['*'], rules: [] };
          userAgentBlocks.push(currentBlock);
        }

        currentBlock.rules.push({ type: 'disallow', path: value, line: lineNum });
        directives.push({ type: 'disallow', value, line: lineNum });

        // Check for blocking all
        if (value === '/' && currentBlock.userAgents.includes('*')) {
          blocksAllRobots = true;
        }

        // Check for blocking important paths
        for (const importantPath of IMPORTANT_PATHS) {
          if (value === importantPath || (value.endsWith('/') && importantPath.startsWith(value))) {
            blocksImportantPaths = true;
          }
        }
        break;

      case 'allow':
        if (!currentBlock) {
          warnings.push({ line: lineNum, message: 'Allow without preceding User-agent' });
          currentBlock = { userAgents: ['*'], rules: [] };
          userAgentBlocks.push(currentBlock);
        }

        currentBlock.rules.push({ type: 'allow', path: value, line: lineNum });
        directives.push({ type: 'allow', value, line: lineNum });
        break;

      case 'sitemap':
        if (!value) {
          errors.push({ line: lineNum, message: 'Empty sitemap URL' });
          continue;
        }

        try {
          new URL(value);
          sitemaps.push(value);
          directives.push({ type: 'sitemap', value, line: lineNum });
        } catch {
          errors.push({ line: lineNum, message: `Invalid sitemap URL: ${value}` });
        }
        break;

      case 'crawl-delay':
        if (!currentBlock) {
          warnings.push({ line: lineNum, message: 'Crawl-delay without preceding User-agent' });
        } else {
          const delay = parseFloat(value);
          if (isNaN(delay) || delay < 0) {
            errors.push({ line: lineNum, message: `Invalid crawl-delay value: ${value}` });
          } else {
            currentBlock.crawlDelay = delay;
            if (delay > 10) {
              warnings.push({ line: lineNum, message: `High crawl-delay (${delay}s) may slow indexing` });
            }
          }
        }
        directives.push({ type: 'crawl-delay', value, line: lineNum });
        break;

      case 'host':
        host = value;
        directives.push({ type: 'host', value, line: lineNum });
        break;

      case 'clean-param':
        directives.push({ type: 'clean-param', value, line: lineNum });
        break;

      default:
        warnings.push({ line: lineNum, message: `Unknown directive: ${directiveType}` });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    directives,
    userAgentBlocks,
    sitemaps,
    host,
    blocksAllRobots,
    blocksImportantPaths,
    size: content.length,
  };
}

/**
 * Validate a robots.txt file
 */
export function validateRobotsTxt(content: string, baseUrl?: string): RobotsValidationResult {
  const parseResult = parseRobotsTxt(content);
  const issues: RobotsValidationIssue[] = [];

  // Convert parse errors to validation issues
  for (const error of parseResult.errors) {
    issues.push({
      type: 'error',
      code: 'PARSE_ERROR',
      message: error.message,
      line: error.line,
    });
  }

  // Convert parse warnings to validation issues
  for (const warning of parseResult.warnings) {
    issues.push({
      type: 'warning',
      code: 'PARSE_WARNING',
      message: warning.message,
      line: warning.line,
    });
  }

  // Check if file is empty
  if (content.trim().length === 0) {
    issues.push({
      type: 'warning',
      code: 'EMPTY_FILE',
      message: 'robots.txt is empty',
      recommendation: 'Add at least User-agent: * and basic Allow/Disallow rules',
    });
  }

  // Check if all robots are blocked
  if (parseResult.blocksAllRobots) {
    issues.push({
      type: 'error',
      code: 'BLOCKS_ALL_ROBOTS',
      message: 'robots.txt blocks all search engines (Disallow: /)',
      recommendation: 'Remove "Disallow: /" or add specific Allow rules for indexable content',
    });
  }

  // Check for missing sitemap
  if (parseResult.sitemaps.length === 0) {
    issues.push({
      type: 'warning',
      code: 'NO_SITEMAP',
      message: 'No Sitemap directive found',
      recommendation: 'Add Sitemap: https://example.com/sitemap.xml to help search engines discover your content',
    });
  }

  // Check sitemap URLs
  if (baseUrl) {
    const baseHost = new URL(baseUrl).hostname;
    for (const sitemap of parseResult.sitemaps) {
      try {
        const sitemapHost = new URL(sitemap).hostname;
        if (sitemapHost !== baseHost) {
          issues.push({
            type: 'warning',
            code: 'SITEMAP_CROSS_DOMAIN',
            message: `Sitemap points to different domain: ${sitemap}`,
            recommendation: 'Ensure sitemap URLs are on the same domain',
          });
        }
      } catch {
        // Already handled in parse
      }
    }
  }

  // Check for blocking CSS/JS (affects rendering)
  for (const block of parseResult.userAgentBlocks) {
    if (block.userAgents.includes('*') || block.userAgents.includes('Googlebot')) {
      for (const rule of block.rules) {
        if (rule.type === 'disallow') {
          for (const criticalPath of SEO_CRITICAL_PATHS) {
            if (rule.path.includes(criticalPath)) {
              issues.push({
                type: 'warning',
                code: 'BLOCKS_RESOURCES',
                message: `Blocking ${rule.path} may prevent proper rendering`,
                line: rule.line,
                recommendation: 'Allow CSS, JS, and image files for proper page rendering',
              });
            }
          }
        }
      }
    }
  }

  // Check file size (max 500KB recommended)
  if (parseResult.size > 500 * 1024) {
    issues.push({
      type: 'warning',
      code: 'FILE_TOO_LARGE',
      message: `robots.txt is ${Math.round(parseResult.size / 1024)}KB (recommended max: 500KB)`,
      recommendation: 'Simplify robots.txt to reduce file size',
    });
  }

  // Check for no user-agent blocks
  if (parseResult.userAgentBlocks.length === 0 && content.trim().length > 0) {
    issues.push({
      type: 'warning',
      code: 'NO_USER_AGENT',
      message: 'No User-agent directive found',
      recommendation: 'Add at least User-agent: * for universal rules',
    });
  }

  // Check for very high crawl-delay
  for (const block of parseResult.userAgentBlocks) {
    if (block.crawlDelay && block.crawlDelay > 30) {
      issues.push({
        type: 'error',
        code: 'EXCESSIVE_CRAWL_DELAY',
        message: `Crawl-delay of ${block.crawlDelay}s is excessive for ${block.userAgents.join(', ')}`,
        recommendation: 'Crawl-delay over 30 seconds may significantly slow indexing',
      });
    }
  }

  return {
    valid: issues.filter(i => i.type === 'error').length === 0,
    issues,
    parseResult,
  };
}

/**
 * Check if a URL path is allowed by robots.txt
 */
export function isPathAllowed(
  parseResult: RobotsParseResult,
  path: string,
  userAgent: string = '*'
): boolean {
  // Find matching user-agent block
  let matchingBlock: RobotsUserAgentBlock | undefined;

  // First, try to find specific user-agent
  for (const block of parseResult.userAgentBlocks) {
    if (block.userAgents.some(ua =>
      ua.toLowerCase() === userAgent.toLowerCase() ||
      userAgent.toLowerCase().includes(ua.toLowerCase())
    )) {
      matchingBlock = block;
      break;
    }
  }

  // Fall back to wildcard
  if (!matchingBlock) {
    matchingBlock = parseResult.userAgentBlocks.find(b => b.userAgents.includes('*'));
  }

  if (!matchingBlock) {
    return true; // No rules = allowed
  }

  // Check rules in order, longest match wins
  let isAllowed = true;
  let longestMatch = -1;

  for (const rule of matchingBlock.rules) {
    const pattern = rule.path;

    // Convert robots.txt pattern to regex
    let regex: RegExp;
    try {
      const escapedPattern = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\\\$/g, '$');
      regex = new RegExp(`^${escapedPattern}`);
    } catch {
      continue;
    }

    if (regex.test(path)) {
      const matchLength = pattern.replace(/\*/g, '').length;
      if (matchLength > longestMatch) {
        longestMatch = matchLength;
        isAllowed = rule.type === 'allow';
      }
    }
  }

  return isAllowed;
}

/**
 * Fetch and validate robots.txt from a URL
 */
export async function fetchAndValidateRobotsTxt(
  url: string,
  fetcher?: (url: string) => Promise<{ status: number; text: string }>
): Promise<RobotsValidationResult & { exists: boolean; status?: number }> {
  const robotsUrl = new URL('/robots.txt', url).href;

  try {
    let response: { status: number; text: string };

    if (fetcher) {
      response = await fetcher(robotsUrl);
    } else {
      const fetchResponse = await fetch(robotsUrl);
      response = {
        status: fetchResponse.status,
        text: await fetchResponse.text(),
      };
    }

    if (response.status === 404) {
      return {
        exists: false,
        status: 404,
        valid: false,
        issues: [{
          type: 'warning',
          code: 'NOT_FOUND',
          message: 'robots.txt not found (404)',
          recommendation: 'Create a robots.txt file to control search engine crawling',
        }],
        parseResult: {
          valid: false,
          errors: [],
          warnings: [],
          directives: [],
          userAgentBlocks: [],
          sitemaps: [],
          blocksAllRobots: false,
          blocksImportantPaths: false,
          size: 0,
        },
      };
    }

    if (response.status >= 400) {
      return {
        exists: false,
        status: response.status,
        valid: false,
        issues: [{
          type: 'error',
          code: 'FETCH_ERROR',
          message: `Failed to fetch robots.txt (HTTP ${response.status})`,
        }],
        parseResult: {
          valid: false,
          errors: [],
          warnings: [],
          directives: [],
          userAgentBlocks: [],
          sitemaps: [],
          blocksAllRobots: false,
          blocksImportantPaths: false,
          size: 0,
        },
      };
    }

    const validation = validateRobotsTxt(response.text, url);
    return {
      ...validation,
      exists: true,
      status: response.status,
    };
  } catch (error) {
    return {
      exists: false,
      valid: false,
      issues: [{
        type: 'error',
        code: 'FETCH_ERROR',
        message: `Failed to fetch robots.txt: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }],
      parseResult: {
        valid: false,
        errors: [],
        warnings: [],
        directives: [],
        userAgentBlocks: [],
        sitemaps: [],
        blocksAllRobots: false,
        blocksImportantPaths: false,
        size: 0,
      },
    };
  }
}
