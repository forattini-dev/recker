/**
 * HelpView - Markdown-based help documentation
 *
 * Renders shell help documentation using tuiuiu's Markdown component.
 */

import {
  Box,
  Text,
  Markdown,
} from 'tuiuiu.js';
import { themeColor } from '../shared/theme-helper.js';
import type { VNode } from 'tuiuiu.js';

// =============================================================================
// Help Content
// =============================================================================

const HELP_CONTENT = `
# Recker Shell

Welcome to the **rek shell** - an interactive HTTP client with rich network tools.

## Quick Start

\`\`\`
httpbin.org/json          # GET request
POST api.com/users        # POST request
dns google.com            # DNS lookup
whois github.com          # WHOIS lookup
ping api.com:443          # TCP ping
\`\`\`

## HTTP Requests

| Command | Description |
|---------|-------------|
| \`<url>\` | GET request |
| \`GET <url>\` | Explicit GET |
| \`POST <url> [body]\` | POST request |
| \`PUT <url> [body]\` | PUT request |
| \`DELETE <url>\` | DELETE request |
| \`HEAD <url>\` | HEAD request |

### Headers & Body

\`\`\`
GET api.com Authorization:"Bearer token"
POST api.com Content-Type:json {"name":"John"}
\`\`\`

## Network Tools

| Command | Description |
|---------|-------------|
| \`dns <domain>\` | DNS lookup (A, AAAA, MX, TXT) |
| \`whois <domain>\` | WHOIS registration info |
| \`rdap <domain>\` | RDAP (modern WHOIS) |
| \`ping <host>[:port]\` | TCP connectivity test |
| \`tls <host>\` | TLS certificate inspection |
| \`ip <address>\` | GeoIP lookup |

## Background Jobs

| Command | Description |
|---------|-------------|
| \`live download <m3u8>\` | Download HLS stream |
| \`live watch <m3u8>\` | Monitor stream status |
| \`spider <url>\` | Crawl website links |
| \`jobs\` | List active jobs |
| \`stop <id>\` | Stop a job |

## Variables & Context

| Command | Description |
|---------|-------------|
| \`base <url>\` | Set base URL |
| \`set <name> <value>\` | Set variable |
| \`$last\` | Reference last response |
| \`$headers\` | Last response headers |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| \`Ctrl+C\` | Exit shell |
| \`Ctrl+L\` | Clear history |
| \`Ctrl+P\` | Command palette |
| \`Ctrl+F\` | Search history |
| \`J\` | Toggle jobs panel |
| \`PageUp/Down\` | Scroll history |
| \`↑/↓\` | Navigate command history |

## Output

| Command | Description |
|---------|-------------|
| \`output <dir>\` | Set output directory |
| \`> <file>\` | Save response to file |
| \`json\` | Force JSON output |
| \`headers\` | Show only headers |
`;

// =============================================================================
// Component
// =============================================================================

export interface HelpViewProps {
  width?: number;
  section?: 'all' | 'http' | 'network' | 'jobs' | 'shortcuts';
}

/**
 * HelpView - Renders help documentation with Markdown
 */
export function HelpView(props: HelpViewProps): VNode {
  return Box(
    { flexDirection: 'column', paddingX: 1 },
    Markdown({
      content: HELP_CONTENT,
    }),
  );
}

/**
 * Get help content as markdown string
 */
export function getHelpMarkdown(): string {
  return HELP_CONTENT;
}

/**
 * Get a quick help summary (for inline display)
 */
export function getQuickHelp(): VNode {
  return Box(
    { flexDirection: 'column', paddingX: 1 },
    Text({ color: themeColor('primary'), bold: true }, '📚 Recker Shell Help'),
    Text({ color: themeColor('muted') }, '─'.repeat(40)),
    Text({}, ''),
    Text({ color: themeColor('accent') }, 'Quick Commands:'),
    Text({ color: themeColor('foreground') }, '  httpbin.org/json    GET request'),
    Text({ color: themeColor('foreground') }, '  dns google.com      DNS lookup'),
    Text({ color: themeColor('foreground') }, '  whois github.com    WHOIS info'),
    Text({ color: themeColor('foreground') }, '  ping api.com:443    TCP ping'),
    Text({}, ''),
    Text({ color: themeColor('accent') }, 'Shortcuts:'),
    Text({ color: themeColor('foreground') }, '  Ctrl+P  Command palette'),
    Text({ color: themeColor('foreground') }, '  Ctrl+L  Clear history'),
    Text({ color: themeColor('foreground') }, '  J       Toggle jobs'),
    Text({}, ''),
    Text({ color: themeColor('mutedForeground'), dim: true }, 'Type "help full" for complete documentation.'),
  );
}
