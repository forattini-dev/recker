# Template Engine

Recker includes a powerful template engine with 50+ built-in helpers, pipe filters, and format-specific escaping. Perfect for generating dynamic HTTP request bodies, headers, and URLs.

## Quick Start

```typescript
import { template, TemplateEngine } from 'recker';

// Quick render
const result = await template('Hello {{name}}!', { name: 'World' });
// → "Hello World!"

// With engine instance
const engine = new TemplateEngine({ format: 'json' });
const json = await engine.render('{"user": "{{user}}"}', { user: 'John' });
// → '{"user": "John"}'
```

## Features

- **Expression Syntax**: `{{variable}}`, `{{{raw}}}`, `{{#block}}...{{/block}}`
- **50+ Built-in Helpers**: Comparisons, loops, crypto, dates, strings, and more
- **Pipe Filters**: Chain transformations with `{{value | uppercase | trim}}`
- **Format Escaping**: Automatic escaping for JSON, XML, HTML, URL, CSV
- **Partials**: Reusable template fragments with `{{> partial}}`
- **Safe Strings**: Pre-escaped content with `SafeString`
- **Async Support**: All helpers support async operations
- **Template Caching**: LRU cache with configurable TTL

## Use Cases

### Dynamic HTTP Bodies

```typescript
const body = await template(`{
  "user": "{{env "USER"}}",
  "timestamp": {{timestamp}},
  "token": "{{uuid}}"
}`, {});
```

### Conditional Content

```typescript
const result = await template(`
{{#if premium}}
  Premium features enabled
{{else}}
  Standard account
{{/if}}
`, { premium: true });
```

### Data Iteration

```typescript
const result = await template(`
{{#each users}}
  - {{this.name}} ({{this.email}})
{{/each}}
`, { users: [{ name: 'John', email: 'john@example.com' }] });
```

### Pipe Filters

```typescript
const result = await template(
  '{{name | uppercase | truncate 10}}',
  { name: 'hello world' }
);
// → "HELLO WORL"
```

## Engine Configuration

```typescript
const engine = new TemplateEngine({
  // Output format (determines escaping)
  format: 'json', // 'raw' | 'json' | 'xml' | 'html' | 'url' | 'csv'

  // Throw on undefined variables
  strict: false,

  // Enable template caching
  cache: true,

  // Cache TTL in ms
  cacheTTL: 300000, // 5 minutes

  // Custom delimiters (advanced)
  delimiters: ['{{', '}}'],
  rawDelimiters: ['{{{', '}}}'],

  // Register custom helpers
  helpers: {
    shout: (value) => String(value).toUpperCase() + '!'
  },

  // Register custom filters
  filters: {
    double: (value) => value * 2
  },

  // Register partials
  partials: {
    header: '<h1>{{title}}</h1>'
  }
});
```

## Format-Specific Rendering

```typescript
const engine = new TemplateEngine();

// JSON - escapes quotes, newlines, backslashes
await engine.json('{"name": "{{name}}"}', { name: "O'Brien" });
// → {"name": "O'Brien"}

// HTML - escapes < > & " '
await engine.html('<p>{{html}}</p>', { html: '<script>xss</script>' });
// → <p>&lt;script&gt;xss&lt;/script&gt;</p>

// XML - escapes entities + removes control chars
await engine.xml('<name>{{name}}</name>', { name: 'A & B' });
// → <name>A &amp; B</name>

// URL - percent encoding
await engine.url('https://api.com/search?q={{query}}', { query: 'hello world' });
// → https://api.com/search?q=hello%20world

// CSV - quotes fields with special chars
await engine.csv('{{name}},{{value}}', { name: 'John, Jr.', value: 42 });
// → "John, Jr.",42
```

## API Reference

### Functions

| Function | Description |
|----------|-------------|
| `template(str, ctx)` | Quick render with default engine |
| `createTemplateEngine(options)` | Create configured engine |
| `parse(template)` | Parse template to AST |
| `validate(template)` | Validate template syntax |
| `extractVariables(template)` | Get list of used variables |
| `hasTemplateExpressions(str)` | Check if string contains `{{...}}` |

### TemplateEngine Methods

| Method | Description |
|--------|-------------|
| `render(template, context)` | Render with format escaping |
| `json(template, context)` | Render with JSON escaping |
| `html(template, context)` | Render with HTML escaping |
| `xml(template, context)` | Render with XML escaping |
| `url(template, context)` | Render with URL encoding |
| `csv(template, context)` | Render with CSV escaping |
| `compile(template)` | Pre-compile for reuse |
| `registerHelper(name, fn)` | Add custom helper |
| `registerPartial(name, template)` | Add partial template |
| `clearCache()` | Clear compiled template cache |

## Next Steps

- [Syntax Reference](/template/02-syntax.md) - Full syntax documentation
- [Helpers Reference](/template/03-helpers.md) - All 50+ built-in helpers
- [Filters Reference](/template/04-filters.md) - Pipe filter chain syntax
- [Escaping Guide](/template/05-escaping.md) - Format-specific escaping
