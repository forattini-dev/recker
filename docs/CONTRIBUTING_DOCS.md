# Documentation Guidelines

Guidelines for writing and maintaining Recker documentation.

## Structure

```
docs/
├── index.html          # Docsify config
├── README.md           # Homepage
├── _sidebar.md         # Navigation
├── _navbar.md          # Top navigation
├── _coverpage.md       # Cover page
├── getting-started/    # Installation, quickstart
├── guides/             # All guides (flat structure)
├── api/                # API reference
└── *.md                # Top-level pages (benchmarks, changelog, etc.)
```

## Page Template

```markdown
# Page Title

Brief description (1-2 sentences).

## Quick Start

\`\`\`typescript
// Minimal working example
import { createClient } from 'recker';
const client = createClient({ baseUrl: 'https://api.example.com' });
\`\`\`

---

## Feature 1

Explanation with code examples.

---

## Feature 2

More content...

---

## Best Practices

1. **Tip 1** - Explanation
2. **Tip 2** - Explanation

---

> [!TIP]
> Related: [Link to related page](path/to/page.md)
```

## Writing Style

### DO ✅

- Start with a working code example
- Use horizontal rules (`---`) to separate sections
- Keep code examples minimal and focused
- Use tables for options/configuration
- Include TypeScript types inline
- Add "Best Practices" section at the end
- Link to related pages

### DON'T ❌

- Don't use emojis excessively
- Don't write long paragraphs
- Don't duplicate content across pages
- Don't forget to update the sidebar
- Don't use relative paths for images

## Docsify Features

### Alerts

```markdown
> [!NOTE]
> Information the user should notice.

> [!TIP]
> Optional information to help a user be more successful.

> [!WARNING]
> Urgent info that needs immediate attention.

> [!ATTENTION]
> Information that users should be aware of.
```

### Tabs

```markdown
<!-- tabs:start -->

#### **Tab 1**

Content for tab 1

#### **Tab 2**

Content for tab 2

<!-- tabs:end -->
```

### Code with Filename

```markdown
<!-- filename: src/example.ts -->
\`\`\`typescript
const x = 1;
\`\`\`
```

### Mermaid Diagrams

```markdown
\`\`\`mermaid
graph LR
    A[Client] --> B[Middleware]
    B --> C[Transport]
\`\`\`
```

## Code Examples

### Minimal Examples

```typescript
// Good: Shows one thing clearly
const response = await client.get('/users').json();
```

### Complete Examples

```typescript
// Good: Complete with error handling
import { createClient, HttpError } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com'
});

try {
  const users = await client.get('/users').json();
  console.log(users);
} catch (error) {
  if (error instanceof HttpError) {
    console.error(`HTTP ${error.status}: ${error.statusText}`);
  }
}
```

## Tables

### Options Tables

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeout` | number | 30000 | Request timeout in ms |
| `retry` | boolean | true | Enable automatic retry |

### Comparison Tables

| Feature | Recker | axios | got |
|---------|--------|-------|-----|
| HTTP/2 | ✅ | ❌ | ✅ |
| Streaming | ✅ | ⚠️ | ✅ |

## File Naming

- Use kebab-case: `error-handling.md`
- Be descriptive: `circuit-breaker.md` not `cb.md`
- Single topic per file

## Updating Documentation

1. Make changes to the relevant `.md` file
2. Update `_sidebar.md` if adding new pages
3. Test locally with `pnpm docs:serve`
4. Submit PR with clear description

## Testing Locally

```bash
# Run from project root
pnpm docs

# Or manually
npx serve docs -p 3000

# Open http://localhost:3000
```

## Review Checklist

- [ ] Code examples are tested and work
- [ ] Links are valid (no broken links)
- [ ] Sidebar is updated if needed
- [ ] No duplicate content
- [ ] Follows page template
- [ ] TypeScript examples have types
