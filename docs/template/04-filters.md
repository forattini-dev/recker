# Pipe Filters

Transform values using chainable filters with the pipe (`|`) operator.

## Syntax

```handlebars
{{value | filter}}
{{value | filter arg1 arg2}}
{{value | filter1 | filter2 | filter3}}
```

## String Filters

### Case Transformation

| Filter | Example | Output |
|--------|---------|--------|
| `uppercase` | `{{"hello" \| uppercase}}` | `HELLO` |
| `lowercase` | `{{"HELLO" \| lowercase}}` | `hello` |
| `capitalize` | `{{"hello world" \| capitalize}}` | `Hello world` |
| `titleCase` | `{{"hello world" \| titleCase}}` | `Hello World` |
| `camelCase` | `{{"hello world" \| camelCase}}` | `helloWorld` |
| `snakeCase` | `{{"helloWorld" \| snakeCase}}` | `hello_world` |
| `kebabCase` | `{{"helloWorld" \| kebabCase}}` | `hello-world` |

### String Manipulation

| Filter | Example | Output |
|--------|---------|--------|
| `trim` | `{{"  hello  " \| trim}}` | `hello` |
| `trimStart` | `{{"  hello" \| trimStart}}` | `hello` |
| `trimEnd` | `{{"hello  " \| trimEnd}}` | `hello` |
| `reverse` | `{{"hello" \| reverse}}` | `olleh` |
| `truncate N` | `{{"hello world" \| truncate 8}}` | `hello...` |
| `truncate N "→"` | `{{"hello world" \| truncate 8 "→"}}` | `hello w→` |
| `slice start end` | `{{"hello" \| slice 1 4}}` | `ell` |

## Encoding Filters

| Filter | Description |
|--------|-------------|
| `base64` | Base64 encode |
| `base64decode` | Base64 decode |
| `urlencode` | URL encode |
| `urldecode` | URL decode |
| `json` | JSON stringify |
| `jsonPretty` | JSON with indentation |

```handlebars
{{data | base64}}
{{encoded | base64decode}}
{{query | urlencode}}
{{obj | json}}
{{obj | jsonPretty}}
```

## Array Filters

| Filter | Description | Example |
|--------|-------------|---------|
| `first` | First element | `{{items \| first}}` |
| `last` | Last element | `{{items \| last}}` |
| `reverse` | Reverse order | `{{items \| reverse}}` |
| `sort` | Sort ascending | `{{items \| sort}}` |
| `unique` | Remove duplicates | `{{items \| unique}}` |
| `join SEP` | Join with separator | `{{items \| join ", "}}` |
| `pluck KEY` | Extract property | `{{users \| pluck "name"}}` |
| `where KEY VAL` | Filter by property | `{{users \| where "active" true}}` |

### Examples

```handlebars
{{#each (items | sort | reverse)}}
  {{this}}
{{/each}}

{{users | pluck "email" | join ", "}}

{{#each (users | where "role" "admin")}}
  {{name}}
{{/each}}
```

## Number Filters

| Filter | Description | Example |
|--------|-------------|---------|
| `abs` | Absolute value | `{{num \| abs}}` |
| `round` | Round to integer | `{{num \| round}}` |
| `floor` | Round down | `{{num \| floor}}` |
| `ceil` | Round up | `{{num \| ceil}}` |
| `toFixed N` | Fixed decimals | `{{num \| toFixed 2}}` |

```handlebars
{{price | toFixed 2}}      <!-- 19.99 -->
{{score | round}}          <!-- 85 -->
{{-5 | abs}}               <!-- 5 -->
```

## Date Filters

| Filter | Description | Example |
|--------|-------------|---------|
| `dateFormat FMT` | Format date | `{{date \| dateFormat "YYYY-MM-DD"}}` |
| `isoDate` | ISO 8601 format | `{{date \| isoDate}}` |
| `relativeTime` | Relative time | `{{date \| relativeTime}}` |

```handlebars
{{createdAt | dateFormat "MMM D, YYYY"}}
{{timestamp | isoDate}}
```

## Escape Filters

| Filter | Description |
|--------|-------------|
| `escape` | HTML escape |
| `escapeJson` | JSON string escape |
| `escapeXml` | XML entity escape |
| `escapeUrl` | URL percent encode |
| `escapeCsv` | CSV field escape |

```handlebars
{{html | escape}}          <!-- HTML entities -->
{{value | escapeJson}}     <!-- JSON string escaping -->
{{url | escapeUrl}}        <!-- Percent encoding -->
```

## Default Values

| Filter | Description | Example |
|--------|-------------|---------|
| `default VAL` | Fallback for null/undefined/empty | `{{name \| default "Anonymous"}}` |

```handlebars
{{email | default "No email"}}
{{count | default 0}}
{{items | default "[]" | json}}
```

## Filter Chaining

Filters are applied left to right:

```handlebars
{{name | trim | uppercase | truncate 10}}
```

Is equivalent to:

```typescript
truncate(uppercase(trim(name)), 10)
```

## Filters vs Helpers

**Use filters for:**
- Simple transformations
- Chaining multiple operations
- Inline value processing

```handlebars
{{name | uppercase | truncate 20}}
```

**Use helpers for:**
- Block operations
- Complex logic
- Multiple arguments

```handlebars
{{#if (gt (len name) 20)}}...{{/if}}
```

## Custom Filters

Register custom filters:

```typescript
const engine = new TemplateEngine({
  filters: {
    double: (value) => value * 2,
    currency: (value, symbol = '$') => `${symbol}${value.toFixed(2)}`,
    mask: (value, char = '*') => char.repeat(value.length)
  }
});
```

Usage:

```handlebars
{{price | double}}           <!-- 200 -->
{{price | currency "€"}}     <!-- €100.00 -->
{{password | mask}}          <!-- ******** -->
```

## Filter with Sub-Expressions

Filters work with sub-expressions:

```handlebars
{{#each (items | sort)}}
  {{this}}
{{/each}}

{{#if (name | len | gt 0)}}
  Has name
{{/if}}
```

## Complete Filter Reference

| Category | Filters |
|----------|---------|
| **String** | uppercase, lowercase, capitalize, titleCase, camelCase, snakeCase, kebabCase, trim, trimStart, trimEnd, reverse, truncate, slice |
| **Encoding** | base64, base64decode, urlencode, urldecode, json, jsonPretty |
| **Array** | first, last, reverse, sort, unique, join, pluck, where |
| **Number** | abs, round, floor, ceil, toFixed |
| **Date** | dateFormat, isoDate, relativeTime |
| **Escape** | escape, escapeJson, escapeXml, escapeUrl, escapeCsv |
| **Utility** | default |
