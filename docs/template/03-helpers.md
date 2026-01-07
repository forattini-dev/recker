# Built-in Helpers

Recker's template engine includes 50+ built-in helpers organized by category.

## Control Flow

### if / unless

Conditional rendering based on truthiness.

```handlebars
{{#if user}}
  Hello, {{user.name}}!
{{else}}
  Please log in
{{/if}}

{{#unless loggedIn}}
  <a href="/login">Login</a>
{{/unless}}
```

### each

Iterate over arrays or objects.

```handlebars
{{#each items}}
  {{@index}}: {{this}}
{{else}}
  No items
{{/each}}

{{#each user}}
  {{@key}}: {{this}}
{{/each}}
```

**Available Variables:**
- `{{this}}` - Current item
- `{{@index}}` - Zero-based index
- `{{@first}}` - `true` if first iteration
- `{{@last}}` - `true` if last iteration
- `{{@key}}` - Key name (for objects)

### with

Switch context for a block.

```handlebars
{{#with user.profile}}
  Name: {{name}}
  Bio: {{bio}}
{{else}}
  No profile
{{/with}}
```

### range

Generate numeric sequences.

```handlebars
{{#range 1 5}}
  Item {{this}}
{{/range}}
<!-- 1, 2, 3, 4, 5 -->

{{#range 0 10 2}}
  {{this}}
{{/range}}
<!-- 0, 2, 4, 6, 8, 10 -->
```

## Comparison

### eq / ne

Equality comparison.

```handlebars
{{#if (eq status "active")}}Active{{/if}}
{{#if (ne type "admin")}}Not admin{{/if}}
```

### lt / lte / gt / gte

Numeric comparison.

```handlebars
{{#if (gt age 18)}}Adult{{/if}}
{{#if (lte score 100)}}Valid score{{/if}}
```

## Logic

### and / or / not

Boolean logic.

```handlebars
{{#if (and isActive isVerified)}}
  Full access
{{/if}}

{{#if (or isAdmin isModerator)}}
  Can moderate
{{/if}}

{{#if (not isBlocked)}}
  Welcome!
{{/if}}
```

## String Helpers

### uppercase / lowercase / capitalize

```handlebars
{{uppercase name}}       <!-- JOHN -->
{{lowercase name}}       <!-- john -->
{{capitalize name}}      <!-- John -->
{{titleCase title}}      <!-- Hello World -->
```

### Case Conversions

```handlebars
{{camelCase "hello world"}}    <!-- helloWorld -->
{{snakeCase "helloWorld"}}     <!-- hello_world -->
{{kebabCase "helloWorld"}}     <!-- hello-world -->
{{pascalCase "hello world"}}   <!-- HelloWorld -->
```

### String Manipulation

```handlebars
{{trim "  hello  "}}           <!-- "hello" -->
{{trimStart "  hello"}}        <!-- "hello" -->
{{trimEnd "hello  "}}          <!-- "hello" -->
{{replace text "old" "new"}}   <!-- Replace first -->
{{replaceAll text "a" "b"}}    <!-- Replace all -->
{{repeat "ab" 3}}              <!-- "ababab" -->
{{reverse "hello"}}            <!-- "olleh" -->
```

### Substring & Padding

```handlebars
{{substring text 0 5}}         <!-- First 5 chars -->
{{truncate text 50}}           <!-- Truncate with "..." -->
{{truncate text 50 "→"}}       <!-- Custom suffix -->
{{padStart num 5 "0"}}         <!-- "00042" -->
{{padEnd text 10 "."}}         <!-- "hello....." -->
```

### Split & Join

```handlebars
{{split "a,b,c" ","}}          <!-- ["a", "b", "c"] -->
{{join items ", "}}            <!-- "a, b, c" -->
{{concat a " " b}}             <!-- "hello world" -->
```

## Crypto Helpers

### Encoding

```handlebars
{{base64 data}}                <!-- Base64 encode -->
{{base64decode encoded}}       <!-- Base64 decode -->
{{hex data}}                   <!-- Hex encode -->
{{hexDecode hexStr}}           <!-- Hex decode -->
```

### Hashing

```handlebars
{{hash "sha256" data}}         <!-- SHA-256 hash -->
{{hash "sha512" data}}         <!-- SHA-512 hash -->
{{hash "md5" data}}            <!-- MD5 hash -->
{{hmac "sha256" secret data}}  <!-- HMAC signature -->
```

### Random

```handlebars
{{uuid}}                       <!-- UUID v4 -->
{{randomInt 1 100}}            <!-- Random 1-100 -->
{{randomString 16}}            <!-- Random alphanumeric -->
{{randomBytes 32}}             <!-- Random hex bytes -->
```

## Date Helpers

### Current Time

```handlebars
{{timestamp}}                  <!-- Unix timestamp (seconds) -->
{{timestampMs}}                <!-- Unix timestamp (milliseconds) -->
{{now "YYYY-MM-DD"}}           <!-- Formatted current date -->
{{today}}                      <!-- Today's date (YYYY-MM-DD) -->
```

### Date Formatting

```handlebars
{{date value "YYYY-MM-DD"}}
{{date value "HH:mm:ss"}}
{{date value "MMMM D, YYYY"}}
```

**Format Tokens:**

| Token | Output |
|-------|--------|
| `YYYY` | 2024 |
| `YY` | 24 |
| `MM` | 01-12 |
| `M` | 1-12 |
| `DD` | 01-31 |
| `D` | 1-31 |
| `HH` | 00-23 |
| `H` | 0-23 |
| `mm` | 00-59 |
| `ss` | 00-59 |
| `SSS` | 000-999 |
| `dddd` | Monday |
| `ddd` | Mon |
| `MMMM` | January |
| `MMM` | Jan |

### Date Arithmetic

```handlebars
{{dateAdd date 7 "days"}}
{{dateAdd date 1 "month"}}
{{dateAdd date -1 "year"}}
{{dateSub date 30 "minutes"}}
```

### Date Comparison

```handlebars
{{dateDiff start end "days"}}
{{dateDiff start end "hours"}}
```

## Environment Helpers

### env

Access environment variables.

```handlebars
{{env "API_KEY"}}              <!-- Get env var -->
{{env "PORT" "3000"}}          <!-- With default -->
{{envRequired "SECRET"}}       <!-- Throws if missing -->
```

### Conditional Environment

```handlebars
{{#ifEnv "DEBUG"}}
  Debug mode enabled
{{/ifEnv}}

{{#hasEnv "API_KEY"}}
  API key configured
{{/hasEnv}}
```

## Utility Helpers

### json

Serialize to JSON.

```handlebars
{{json data}}                  <!-- Compact JSON -->
{{json data 2}}                <!-- Pretty (2-space indent) -->
```

### len

Get length of array or string.

```handlebars
{{len items}}                  <!-- Array length -->
{{len text}}                   <!-- String length -->
```

### default / coalesce

Fallback values.

```handlebars
{{default value "N/A"}}        <!-- Use if null/undefined -->
{{coalesce a b c "default"}}   <!-- First non-null value -->
```

### typeof

Get value type.

```handlebars
{{typeof value}}               <!-- "string", "number", "array", "object", etc. -->
```

### lookup

Dynamic property access.

```handlebars
{{lookup user "email"}}        <!-- user.email -->
{{lookup items 0}}             <!-- items[0] -->
```

### concat

Join multiple values.

```handlebars
{{concat "Hello" " " "World"}}
{{concat firstName " " lastName}}
```

## Custom Helpers

Register your own helpers:

```typescript
engine.registerHelper('shout', (value) => {
  return String(value).toUpperCase() + '!';
});

// Block helper
engine.registerHelper('times', function(n, options) {
  let result = '';
  for (let i = 0; i < n; i++) {
    result += options.fn({ index: i });
  }
  return result;
});
```

Usage:

```handlebars
{{shout name}}
<!-- JOHN! -->

{{#times 3}}
  Iteration {{index}}
{{/times}}
```

## Helper Categories

| Category | Helpers |
|----------|---------|
| **Control** | if, unless, each, with, range |
| **Comparison** | eq, ne, lt, lte, gt, gte |
| **Logic** | and, or, not |
| **String** | uppercase, lowercase, capitalize, trim, replace, split, join, concat, etc. |
| **Crypto** | base64, hash, hmac, uuid, randomInt, randomString |
| **Date** | timestamp, now, date, dateAdd, dateSub, dateDiff |
| **Environment** | env, envRequired, hasEnv, ifEnv |
| **Utility** | json, len, default, coalesce, typeof, lookup |
