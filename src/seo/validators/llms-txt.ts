/**
 * llms.txt Parser and Validator
 *
 * Parses and validates llms.txt files according to the llmstxt.org specification.
 * @see https://llmstxt.org/
 *
 * The llms.txt file provides a standardized way to give LLMs information about websites.
 * Format:
 * - First line: Site name (# heading)
 * - Second line: Brief description (> blockquote)
 * - Optional sections with ## headings
 * - Links in markdown format [text](url)
 * - Optional llms-full.txt for complete content
 */

export interface LlmsTxtLink {
  text: string;
  url: string;
  description?: string;
  section?: string;
}

export interface LlmsTxtSection {
  title: string;
  content: string;
  links: LlmsTxtLink[];
}

export interface LlmsTxtParseResult {
  /** Successfully parsed */
  valid: boolean;
  /** Parse errors */
  errors: string[];
  /** Parse warnings */
  warnings: string[];
  /** Site name (from # heading) */
  siteName?: string;
  /** Site description (from > blockquote) */
  siteDescription?: string;
  /** Main content sections */
  sections: LlmsTxtSection[];
  /** All links found */
  links: LlmsTxtLink[];
  /** Whether llms-full.txt is referenced */
  hasFullVersion: boolean;
  /** Raw content */
  rawContent: string;
  /** File size in bytes */
  size: number;
}

export interface LlmsTxtValidationIssue {
  type: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  line?: number;
  recommendation?: string;
}

export interface LlmsTxtValidationResult {
  valid: boolean;
  issues: LlmsTxtValidationIssue[];
  parseResult: LlmsTxtParseResult;
}

// Recommended max sizes
const MAX_FILE_SIZE = 100 * 1024; // 100KB recommended max
const MIN_DESCRIPTION_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 500;
const OPTIMAL_MIN_LINKS = 10;
const OPTIMAL_MAX_LINKS = 30;

/**
 * Parse llms.txt file content
 */
export function parseLlmsTxt(content: string): LlmsTxtParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sections: LlmsTxtSection[] = [];
  const links: LlmsTxtLink[] = [];

  let siteName: string | undefined;
  let siteDescription: string | undefined;
  let hasFullVersion = false;
  let currentSection: LlmsTxtSection | null = null;

  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip empty lines
    if (!trimmedLine) continue;

    // Parse site name (# heading on first line)
    if (trimmedLine.startsWith('# ') && !siteName) {
      siteName = trimmedLine.substring(2).trim();
      continue;
    }

    // Parse site description (> blockquote)
    if (trimmedLine.startsWith('> ') && !siteDescription) {
      siteDescription = trimmedLine.substring(2).trim();
      continue;
    }

    // Parse section headings (## heading)
    if (trimmedLine.startsWith('## ')) {
      const title = trimmedLine.substring(3).trim();
      currentSection = { title, content: '', links: [] };
      sections.push(currentSection);
      continue;
    }

    // Parse markdown links
    const linkMatches = trimmedLine.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
    for (const match of linkMatches) {
      const linkText = match[1];
      const linkUrl = match[2];

      // Check for llms-full.txt reference
      if (linkUrl.includes('llms-full.txt') || linkUrl.includes('llms_full.txt')) {
        hasFullVersion = true;
      }

      const link: LlmsTxtLink = {
        text: linkText,
        url: linkUrl,
        section: currentSection?.title,
      };

      // Extract description from surrounding text
      const afterLink = trimmedLine.substring(trimmedLine.indexOf(match[0]) + match[0].length).trim();
      if (afterLink.startsWith(':') || afterLink.startsWith('-')) {
        link.description = afterLink.substring(1).trim();
      }

      links.push(link);
      if (currentSection) {
        currentSection.links.push(link);
      }
    }

    // Add content to current section
    if (currentSection && !trimmedLine.startsWith('##')) {
      if (currentSection.content) {
        currentSection.content += '\n' + trimmedLine;
      } else {
        currentSection.content = trimmedLine;
      }
    }
  }

  // Validation during parsing
  if (!siteName) {
    errors.push('Missing site name (should be first line starting with #)');
  }

  if (!siteDescription) {
    warnings.push('Missing site description (should be a > blockquote after site name)');
  }

  if (links.length === 0) {
    warnings.push('No links found in llms.txt');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    siteName,
    siteDescription,
    sections,
    links,
    hasFullVersion,
    rawContent: content,
    size: content.length,
  };
}

/**
 * Validate llms.txt content
 */
export function validateLlmsTxt(content: string, baseUrl?: string): LlmsTxtValidationResult {
  const parseResult = parseLlmsTxt(content);
  const issues: LlmsTxtValidationIssue[] = [];

  // Convert parse errors
  for (const error of parseResult.errors) {
    issues.push({
      type: 'error',
      code: 'PARSE_ERROR',
      message: error,
    });
  }

  // Convert parse warnings
  for (const warning of parseResult.warnings) {
    issues.push({
      type: 'warning',
      code: 'PARSE_WARNING',
      message: warning,
    });
  }

  // Check file size
  if (parseResult.size > MAX_FILE_SIZE) {
    issues.push({
      type: 'warning',
      code: 'FILE_TOO_LARGE',
      message: `llms.txt is ${Math.round(parseResult.size / 1024)}KB (recommended max: 100KB)`,
      recommendation: 'Keep llms.txt concise; use llms-full.txt for detailed content',
    });
  }

  // Check description length
  if (parseResult.siteDescription) {
    if (parseResult.siteDescription.length < MIN_DESCRIPTION_LENGTH) {
      issues.push({
        type: 'info',
        code: 'SHORT_DESCRIPTION',
        message: `Site description is short (${parseResult.siteDescription.length} chars)`,
        recommendation: `Provide at least ${MIN_DESCRIPTION_LENGTH} characters of description`,
      });
    } else if (parseResult.siteDescription.length > MAX_DESCRIPTION_LENGTH) {
      issues.push({
        type: 'info',
        code: 'LONG_DESCRIPTION',
        message: `Site description is long (${parseResult.siteDescription.length} chars)`,
        recommendation: `Keep description under ${MAX_DESCRIPTION_LENGTH} characters`,
      });
    }
  }

  // Check for essential sections
  const sectionTitles = parseResult.sections.map(s => s.title.toLowerCase());
  const recommendedSections = ['docs', 'documentation', 'api', 'getting started', 'about'];
  const hasSomeRecommended = recommendedSections.some(s =>
    sectionTitles.some(t => t.includes(s))
  );
  if (!hasSomeRecommended && parseResult.sections.length === 0) {
    issues.push({
      type: 'info',
      code: 'NO_SECTIONS',
      message: 'No content sections found',
      recommendation: 'Add sections like ## Docs, ## API, ## About for better organization',
    });
  }

  // Validate links
  if (baseUrl) {
    const baseHost = new URL(baseUrl).hostname;
    for (const link of parseResult.links) {
      try {
        const linkUrl = new URL(link.url, baseUrl);
        // Check for broken relative URLs
        if (!link.url.startsWith('http') && !link.url.startsWith('/')) {
          issues.push({
            type: 'warning',
            code: 'RELATIVE_URL',
            message: `Relative URL may not resolve correctly: ${link.url}`,
            recommendation: 'Use absolute URLs or URLs starting with /',
          });
        }
      } catch {
        issues.push({
          type: 'error',
          code: 'INVALID_URL',
          message: `Invalid URL: ${link.url}`,
        });
      }
    }
  }

  // Check for llms-full.txt recommendation
  if (!parseResult.hasFullVersion && parseResult.size > 10000) {
    issues.push({
      type: 'info',
      code: 'CONSIDER_FULL_VERSION',
      message: 'Large llms.txt without llms-full.txt reference',
      recommendation: 'Consider creating llms-full.txt for detailed content',
    });
  }

  // Check for duplicate links
  const seenUrls = new Set<string>();
  for (const link of parseResult.links) {
    const normalized = link.url.toLowerCase();
    if (seenUrls.has(normalized)) {
      issues.push({
        type: 'info',
        code: 'DUPLICATE_LINK',
        message: `Duplicate link: ${link.url}`,
      });
    } else {
      seenUrls.add(normalized);
    }
  }

  // Check optimal link count (10-30 recommended)
  const linkCount = parseResult.links.length;
  if (linkCount > 0 && linkCount < OPTIMAL_MIN_LINKS) {
    issues.push({
      type: 'info',
      code: 'FEW_LINKS',
      message: `Only ${linkCount} link(s) found in llms.txt`,
      recommendation: `Consider adding ${OPTIMAL_MIN_LINKS}-${OPTIMAL_MAX_LINKS} of your most valuable pages for better AI coverage`,
    });
  } else if (linkCount > OPTIMAL_MAX_LINKS) {
    issues.push({
      type: 'info',
      code: 'MANY_LINKS',
      message: `${linkCount} links found in llms.txt`,
      recommendation: `Focus on quality over quantity. ${OPTIMAL_MIN_LINKS}-${OPTIMAL_MAX_LINKS} high-value links are recommended to help AI systems identify your truly important content`,
    });
  }

  return {
    valid: issues.filter(i => i.type === 'error').length === 0,
    issues,
    parseResult,
  };
}

/**
 * Fetch and validate llms.txt from a URL
 */
export async function fetchAndValidateLlmsTxt(
  url: string,
  fetcher?: (url: string) => Promise<{ status: number; text: string }>
): Promise<LlmsTxtValidationResult & { exists: boolean; status?: number; fullVersionExists?: boolean }> {
  const llmsTxtUrl = new URL('/llms.txt', url).href;

  try {
    let response: { status: number; text: string };

    if (fetcher) {
      response = await fetcher(llmsTxtUrl);
    } else {
      const fetchResponse = await fetch(llmsTxtUrl);
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
          type: 'info',
          code: 'NOT_FOUND',
          message: 'llms.txt not found',
          recommendation: 'Create llms.txt to optimize for AI/LLM discovery (see llmstxt.org)',
        }],
        parseResult: {
          valid: false,
          errors: [],
          warnings: [],
          sections: [],
          links: [],
          hasFullVersion: false,
          rawContent: '',
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
          message: `Failed to fetch llms.txt (HTTP ${response.status})`,
        }],
        parseResult: {
          valid: false,
          errors: [],
          warnings: [],
          sections: [],
          links: [],
          hasFullVersion: false,
          rawContent: '',
          size: 0,
        },
      };
    }

    const validation = validateLlmsTxt(response.text, url);

    // Check for llms-full.txt
    let fullVersionExists = false;
    if (validation.parseResult.hasFullVersion) {
      try {
        const fullUrl = new URL('/llms-full.txt', url).href;
        let fullResponse: { status: number };
        if (fetcher) {
          fullResponse = await fetcher(fullUrl);
        } else {
          fullResponse = await fetch(fullUrl, { method: 'HEAD' });
        }
        fullVersionExists = fullResponse.status === 200;
      } catch {
        // Ignore errors checking full version
      }
    }

    return {
      ...validation,
      exists: true,
      status: response.status,
      fullVersionExists,
    };
  } catch (error) {
    return {
      exists: false,
      valid: false,
      issues: [{
        type: 'error',
        code: 'FETCH_ERROR',
        message: `Failed to fetch llms.txt: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }],
      parseResult: {
        valid: false,
        errors: [],
        warnings: [],
        sections: [],
        links: [],
        hasFullVersion: false,
        rawContent: '',
        size: 0,
      },
    };
  }
}

/**
 * Generate a basic llms.txt template
 */
export function generateLlmsTxtTemplate(options: {
  siteName: string;
  siteDescription: string;
  sections?: Array<{ title: string; links: Array<{ text: string; url: string; description?: string }> }>;
}): string {
  const lines: string[] = [];

  // Site name
  lines.push(`# ${options.siteName}`);
  lines.push('');

  // Site description
  lines.push(`> ${options.siteDescription}`);
  lines.push('');

  // Sections
  if (options.sections) {
    for (const section of options.sections) {
      lines.push(`## ${section.title}`);
      lines.push('');
      for (const link of section.links) {
        if (link.description) {
          lines.push(`- [${link.text}](${link.url}): ${link.description}`);
        } else {
          lines.push(`- [${link.text}](${link.url})`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
