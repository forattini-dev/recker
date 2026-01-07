# Format-Specific Escaping

Recker's template engine automatically escapes output based on the target format, preventing injection attacks and ensuring valid output.

## Formats

| Format | Use Case | Escapes |
|--------|----------|---------|
| `raw` | Plain text, no escaping | Nothing |
| `json` | JSON bodies | `"`, `\`, `\n`, `\r`, `\t`, control chars |
| `html` | HTML content | `<`, `>`, `&`, `"`, `'` |
| `xml` | XML content | `<`, `>`, `&`, `"`, `'`, control chars |
| `url` | URL components | Non-URL-safe characters |
| `csv` | CSV fields | Quotes fields with `,`, `"`, `\n` |

## Using Formats

### With TemplateEngine

```typescript
const engine = new TemplateEngine();

// Specific format methods
await engine.json(template, context);  // JSON escaping
await engine.html(template, context);  // HTML escaping
await engine.xml(template, context);   // XML escaping
await engine.url(template, context);   // URL encoding
await engine.csv(template, context);   // CSV escaping
```

### With Options

```typescript
const engine = new TemplateEngine({ format: 'json' });
await engine.render(template, context);

// Or per-render
await engine.render(template, context, { format: 'html' });
```

## JSON Escaping

Ensures valid JSON string values:

```typescript
const result = await engine.json('{"name": "{{name}}"}', {
  name: 'O\'Brien\nJr.'
});
// → {"name": "O'Brien\nJr."}
```

**Escaped Characters:**
- `"` → `\"`
- `\` → `\\`
- `\n` → `\\n`
- `\r` → `\\r`
- `\t` → `\\t`
- `\f` → `\\f`
- `\b` → `\\b`
- Control chars (0x00-0x1F) → `\\uXXXX`

## HTML Escaping

Prevents XSS attacks in HTML:

```typescript
const result = await engine.html('<p>{{content}}</p>', {
  content: '<script>alert("xss")</script>'
});
// → <p>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</p>
```

**Escaped Characters:**
- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`
- `'` → `&#39;`

## XML Escaping

Similar to HTML but also removes invalid control characters:

```typescript
const result = await engine.xml('<name>{{name}}</name>', {
  name: 'A & B'
});
// → <name>A &amp; B</name>
```

**Escaped Characters:**
- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`
- `'` → `&apos;`
- Control chars (except `\t`, `\n`, `\r`) → removed

## URL Escaping

Percent-encodes for safe URL inclusion:

```typescript
const result = await engine.url(
  'https://api.com/search?q={{query}}&page={{page}}',
  { query: 'hello world', page: 1 }
);
// → https://api.com/search?q=hello%20world&page=1
```

**Encodes:**
- Spaces → `%20`
- Special characters → `%XX`
- Non-ASCII → UTF-8 percent encoding

## CSV Escaping

Properly quotes fields for CSV format:

```typescript
const result = await engine.csv('{{name}},{{city}},{{note}}', {
  name: 'John, Jr.',
  city: 'New York',
  note: 'Says "hello"'
});
// → "John, Jr.",New York,"Says ""hello"""
```

**Rules:**
- Fields with `,`, `"`, `\n`, `\r` are quoted
- Quotes within fields are doubled (`"` → `""`)

## Raw Output (No Escaping)

### Triple Braces

```handlebars
{{variable}}    <!-- Escaped -->
{{{variable}}}  <!-- Raw, no escaping -->
```

### SafeString

Mark content as pre-escaped:

```typescript
import { safe, SafeString } from 'recker';

const context = {
  html: safe('<b>Bold</b>')
};

await engine.html('{{html}}', context);
// → <b>Bold</b> (not escaped because it's SafeString)
```

## Escaping Functions

Use standalone escaping functions:

```typescript
import {
  escapeHtml,
  escapeJson,
  escapeXml,
  escapeUrl,
  escapeCsv,
  escapeRegex,
  escapeYaml
} from 'recker';

escapeHtml('<script>');      // &lt;script&gt;
escapeJson('line\nbreak');   // line\\nbreak
escapeUrl('hello world');    // hello%20world
escapeXml('A & B');          // A &amp; B
escapeCsv('a,b');            // "a,b"
escapeRegex('a.b*c');        // a\\.b\\*c
escapeYaml('true');          // "true"
```

## Unescape Functions

```typescript
import {
  unescapeHtml,
  unescapeJson,
  unescapeUrl
} from 'recker';

unescapeHtml('&lt;b&gt;');   // <b>
unescapeJson('line\\nbreak'); // line\nbreak
unescapeUrl('hello%20world'); // hello world
```

## Validation Functions

Check if content is valid for a format:

```typescript
import { isValidJson, isValidXml, isValidUrl } from 'recker';

isValidJson('{"a": 1}');     // true
isValidJson('{invalid}');     // false
isValidXml('<a>text</a>');   // true
isValidUrl('https://a.com'); // true
```

## Best Practices

### 1. Use the Right Format

```typescript
// For JSON APIs
await engine.json('{"data": "{{value}}"}', context);

// For HTML responses
await engine.html('<div>{{content}}</div>', context);

// For URL parameters
await engine.url('/search?q={{query}}', context);
```

### 2. Use Raw Only When Safe

```handlebars
<!-- Only for trusted content -->
{{{trustedHtml}}}

<!-- User input should ALWAYS be escaped -->
{{userInput}}
```

### 3. Pre-escape Complex HTML

```typescript
const context = {
  widget: safe(renderWidget(data))
};

await engine.html('{{widget}}', context);
```

### 4. Validate Before Rendering

```typescript
import { validate } from 'recker';

const result = validate(template);
if (!result.valid) {
  console.error(result.errors);
}
```

## Security Considerations

1. **Never trust user input** - Always escape
2. **Use format-specific methods** - `engine.json()` not `engine.render()` for JSON
3. **Validate templates** - Check for syntax errors before rendering
4. **Review raw output** - Audit all `{{{...}}}` usage
5. **Use SafeString sparingly** - Only for pre-validated content
