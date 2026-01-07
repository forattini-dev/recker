# Template Syntax

Complete reference for Recker's template expression syntax.

## Basic Expressions

### Variable Output

```handlebars
{{variable}}          <!-- Escaped output -->
{{{variable}}}        <!-- Raw output (no escaping) -->
```

### Nested Paths

```handlebars
{{user.profile.name}}       <!-- Object property -->
{{items.[0].id}}            <!-- Array access -->
{{../parent}}               <!-- Parent context -->
{{@index}}                  <!-- Special variables -->
```

### Literals

```handlebars
{{helper "string"}}         <!-- String literal -->
{{helper 42}}               <!-- Number literal -->
{{helper true}}             <!-- Boolean literal -->
{{helper null}}             <!-- Null literal -->
```

## Block Helpers

### Conditionals

```handlebars
{{#if condition}}
  Shown when truthy
{{else}}
  Shown when falsy
{{/if}}

{{#unless condition}}
  Shown when falsy
{{/unless}}
```

### Iteration

```handlebars
{{#each items}}
  {{@index}}: {{this}}
{{else}}
  No items
{{/each}}

{{#each object}}
  {{@key}}: {{this}}
{{/each}}
```

**Loop Variables:**

| Variable | Description |
|----------|-------------|
| `{{this}}` | Current item |
| `{{@index}}` | Zero-based index |
| `{{@first}}` | True if first item |
| `{{@last}}` | True if last item |
| `{{@key}}` | Object key (for objects) |

### Context Switching

```handlebars
{{#with user}}
  Name: {{name}}
  Email: {{email}}
{{else}}
  No user
{{/with}}
```

## Comparison Helpers

```handlebars
{{#if (eq a b)}}Equal{{/if}}
{{#if (ne a b)}}Not equal{{/if}}
{{#if (lt a b)}}Less than{{/if}}
{{#if (lte a b)}}Less than or equal{{/if}}
{{#if (gt a b)}}Greater than{{/if}}
{{#if (gte a b)}}Greater than or equal{{/if}}
```

## Logic Helpers

```handlebars
{{#if (and a b)}}Both truthy{{/if}}
{{#if (or a b)}}Either truthy{{/if}}
{{#if (not a)}}Falsy{{/if}}
```

## Sub-Expressions

Nest helper calls inside parentheses:

```handlebars
{{#if (gt (len items) 0)}}
  Has items
{{/if}}

{{uppercase (concat firstName " " lastName)}}
```

## Pipe Filters

Chain transformations with the pipe operator:

```handlebars
{{name | uppercase}}
{{name | uppercase | truncate 10}}
{{value | default "N/A"}}
{{items | sort | first}}
```

## Hash Arguments

Pass named arguments to helpers:

```handlebars
{{helper key1=value1 key2="literal"}}
{{> partial title="Hello" count=42}}
```

## Comments

```handlebars
{{! This is a comment }}

{{!--
  Multi-line
  comment
--}}
```

## Partials

Include reusable template fragments:

```handlebars
{{> partialName}}
{{> partialName key=value}}
```

Register partials:

```typescript
engine.registerPartial('userCard', `
  <div class="card">
    <h2>{{name}}</h2>
    <p>{{email}}</p>
  </div>
`);
```

## Raw Output

Use triple braces to skip escaping:

```handlebars
{{html}}      <!-- Escaped: &lt;b&gt;text&lt;/b&gt; -->
{{{html}}}    <!-- Raw: <b>text</b> -->
```

Or use the `safe` helper:

```typescript
import { safe } from 'recker';

const context = {
  html: safe('<b>Already escaped</b>')
};
```

## Whitespace Control

Leading/trailing whitespace is preserved by default. Use `~` to trim:

```handlebars
{{~#each items~}}
  {{this}}
{{~/each~}}
```

## Escape Sequences

To output literal `{{`:

```handlebars
\{{not a variable}}
```

## Truthiness

Values considered **falsy** (block won't render):
- `false`
- `null`
- `undefined`
- `''` (empty string)
- `0`
- `[]` (empty array)
- `NaN`

Everything else is **truthy**.

## Path Resolution

### Simple Paths

```handlebars
{{name}}                <!-- context.name -->
{{user.email}}          <!-- context.user.email -->
```

### Array Access

```handlebars
{{items.[0]}}           <!-- First item -->
{{items.[0].name}}      <!-- First item's name -->
{{data.["special-key"]}} <!-- Keys with special chars -->
```

### Parent Context

Inside blocks, access parent with `../`:

```handlebars
{{#each items}}
  {{this}} of {{../total}}
{{/each}}
```

### Data Variables

Special `@` prefixed variables:

```handlebars
{{#each items}}
  {{@index}}: {{this}}
  {{#if @first}}(first){{/if}}
  {{#if @last}}(last){{/if}}
{{/each}}
```

## Examples

### JSON Template

```handlebars
{
  "user": "{{env "USER"}}",
  "timestamp": {{timestamp}},
  "items": [
    {{#each items}}
    "{{this}}"{{#unless @last}},{{/unless}}
    {{/each}}
  ]
}
```

### HTML Template

```handlebars
<ul>
{{#each users}}
  <li>
    <strong>{{name}}</strong>
    <a href="mailto:{{email}}">{{email}}</a>
  </li>
{{else}}
  <li>No users found</li>
{{/each}}
</ul>
```

### URL Template

```handlebars
https://api.example.com/{{version}}/users?
  page={{page}}&
  limit={{limit}}&
  search={{query | urlencode}}
```
