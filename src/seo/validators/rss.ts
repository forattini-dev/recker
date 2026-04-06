import { createClient } from '../../core/client.js';

export interface RssFeed {
  url: string;
  type: 'rss' | 'atom' | 'unknown';
  title?: string;
  description?: string;
  itemCount: number;
  lastBuildDate?: string;
  isValid: boolean;
  error?: string;
}

const COMMON_PATHS = [
  '/rss.xml',
  '/feed.xml',
  '/rss',
  '/feed',
  '/atom.xml',
  '/feeds/posts/default',
  '/index.xml'
];

/**
 * Discover RSS/Atom feeds for a given base URL and optional HTML content
 */
export async function discoverFeeds(baseUrl: string, html?: string): Promise<RssFeed[]> {
  const candidateUrls = new Set<string>();
  const feeds: RssFeed[] = [];
  
  // 1. Discover from HTML <link> tags
  if (html) {
    // Regex to match <link rel="alternate" type="application/rss+xml" ... href="...">
    // Handling flexible attribute order and quotes
    const linkRegex = /<link[^>]+?type=["']application\/(rss\+xml|atom\+xml)["'][^>]*?>/gi;
    const hrefRegex = /href=["']([^"']+)["']/;
    const titleRegex = /title=["']([^"']+)["']/;
    
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const tag = match[0];
      const hrefMatch = hrefRegex.exec(tag);
      if (hrefMatch) {
        let href = hrefMatch[1];
        try {
          // Resolve relative URLs
          href = new URL(href, baseUrl).toString();
          candidateUrls.add(href);
        } catch {
          // Invalid URL, skip
        }
      }
    }
  }

  // Optimization: If feeds were discovered via HTML tags, skip brute-force guessing
  // as HTML declaration is the authoritative source.
  if (candidateUrls.size === 0) {
    // 2. Add common paths to candidates
    for (const path of COMMON_PATHS) {
      try {
        const url = new URL(path, baseUrl).toString();
        candidateUrls.add(url);
      } catch {
        // Invalid URL, skip
      }
    }
  }

  // 3. Verify candidates
  // Use a client with short timeout
  const client = createClient({ timeout: 8000 });

  await Promise.all(Array.from(candidateUrls).map(async (url) => {
    try {
      // Fetch the feed content
      const response = await client.get(url);
      
      if (response.status !== 200) return;
      
      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();
      
      // Basic validation: must verify content structure, not just content-type
      // because some servers return 200 OK for /rss but send HTML (404 page)
      
      let type: 'rss' | 'atom' | 'unknown' = 'unknown';
      let isValid = false;
      let itemCount = 0;
      let title: string | undefined;
      let description: string | undefined;
      let lastBuildDate: string | undefined;

      // Check for RSS 2.0
      if (text.includes('<rss') && text.includes('version="2.0"')) {
        type = 'rss';
        isValid = true;
        // Simple regex extraction (XML parsing is heavy, regex is fast for basic info)
        itemCount = (text.match(/<item>/g) || []).length;
        
        const titleMatch = text.match(/<channel>[\s\S]*?<title>(.*?)<\/title>/);
        if (titleMatch) title = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
        
        const descMatch = text.match(/<channel>[\s\S]*?<description>(.*?)<\/description>/);
        if (descMatch) description = descMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();

        const dateMatch = text.match(/<lastBuildDate>(.*?)<\/lastBuildDate>/);
        if (dateMatch) lastBuildDate = dateMatch[1];

      } else if (text.includes('<feed') && text.includes('xmlns="http://www.w3.org/2005/Atom"')) {
        type = 'atom';
        isValid = true;
        itemCount = (text.match(/<entry>/g) || []).length;
        
        const titleMatch = text.match(/<title>(.*?)<\/title>/); // Atom title is direct child of feed
        if (titleMatch) title = titleMatch[1].trim();
      }

      if (isValid) {
        feeds.push({
          url,
          type,
          isValid,
          title,
          description,
          itemCount,
          lastBuildDate
        });
      }

    } catch (err) {
      // Ignore errors for common paths, but maybe report for explicitly linked ones?
      // For now, silent fail
    }
  }));

  return feeds;
}
