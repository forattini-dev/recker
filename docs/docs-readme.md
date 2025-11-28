# Documentation Development

This directory contains the Recker documentation powered by [Docsify](https://docsify.js.org/).

## Running Locally

### Option 1: Using npm/pnpm scripts (Recommended)

```bash
# From project root
pnpm docs:dev
```

Then open http://localhost:3000 in your browser.

### Option 2: Auto-open browser

```bash
pnpm docs:preview
```

This will automatically open the documentation in your default browser.

### Option 3: Direct docsify-cli

```bash
npx docsify-cli serve docs --port 3000
```

## Directory Structure

```
docs/
├── index.html              # Docsify configuration
├── custom.css             # Orange/yellow theme
├── README.md              # Landing page
├── _sidebar.md            # Navigation sidebar
├── _coverpage.md          # Cover page
├── features.md            # Features overview
├── getting-started/
│   ├── installation.md    # Installation guide
│   └── quickstart.md      # Quick start guide
├── guides/
│   ├── client-config.md   # Client configuration
│   ├── websocket.md       # WebSocket support
│   ├── whois.md           # WHOIS lookup
│   ├── dns.md             # Custom DNS
│   ├── plugins.md         # Plugins guide
│   ├── contract.md        # Type contracts
│   ├── streaming.md       # Streaming responses
│   ├── circuit-breaker.md # Circuit breaker
│   ├── error-handling.md  # Error handling
│   ├── observability.md   # Metrics & monitoring
│   └── debug.md           # Debugging
├── api/
│   └── README.md          # API reference
├── examples.md            # Examples
├── migration.md           # Migration guide
├── contributing.md        # Contributing guide
├── changelog.md           # Changelog
└── benchmarks.md          # Performance benchmarks
```

## Writing Documentation

### Adding a New Page

1. Create a markdown file in the appropriate directory
2. Add a link to `_sidebar.md`
3. Use Docsify features:

```markdown
<!-- Info callout -->
> [!NOTE]
> This is a note

<!-- Warning callout -->
> [!WARNING]
> This is a warning

<!-- Tip callout -->
> [!TIP]
> This is a tip

<!-- Code with syntax highlighting -->
\`\`\`typescript
const client = createClient({ baseUrl: 'https://api.example.com' });
\`\`\`

<!-- Inline code -->
Use `createClient()` to create a client.

<!-- Links -->
[Link text](path/to/page.md)
[External link](https://example.com)
```

### Live Reload

Docsify automatically reloads when you save changes to markdown files.

### Theme Colors

Our theme uses orange (#FF8C00) and yellow (#FFD700). Edit `custom.css` to modify.

## Building for Production

The documentation is served directly from markdown files - no build step required!

For GitHub Pages deployment:

```bash
# Already configured in .github/workflows/
# Docs are automatically deployed on push to main
```

## Troubleshooting

### Port Already in Use

```bash
# Change port
npx docsify-cli serve docs --port 4000
```

### Page Not Found

Check that:
1. File exists in the `docs/` directory
2. File extension is `.md`
3. Path in `_sidebar.md` is correct
4. Path uses forward slashes `/` not backslashes `\`

### Styling Not Applied

Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows/Linux)

## Preview

- Local: http://localhost:3000
- Production: https://forattini-dev.github.io/recker (when deployed)

## Resources

- [Docsify Documentation](https://docsify.js.org/)
- [Docsify Plugins](https://docsify.js.org/#/plugins)
- [Markdown Guide](https://www.markdownguide.org/)
