/**
 * Lightweight HTML cleaner optimized for LLM context injection.
 * Removes scripts, styles, comments and extracts semantic text.
 */
export function cleanHtml(html: string): string {
  if (!html) return '';

  let text = html;

  // 1. Remove Scripts and Styles (content is irrelevant for LLM context)
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // 2. Remove Comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // 3. Replace common block tags with newlines to preserve structure
  text = text.replace(/<\/(div|p|h[1-6]|li|ul|ol|tr|table|section|article|main|header|footer|nav)>/gi, '\n');
  text = text.replace(/<(br|hr)\s*\/?>/gi, '\n');

  // 4. Strip all remaining tags
  text = text.replace(/<[^>]+>/g, ' ');

  // 5. Decode HTML Entities (Basic set)
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // 6. Normalize Whitespace
  // Replace multiple spaces/tabs with single space
  text = text.replace(/[ \t]+/g, ' ');
  // Replace multiple newlines with max 2 newlines (paragraphs)
  text = text.replace(/\n\s*\n\s*\n+/g, '\n\n');
  
  return text.trim();
}
