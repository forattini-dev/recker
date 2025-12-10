# YAML Plugin

Native YAML support for HTTP requests and responses. **Recker is the first HTTP client with built-in YAML support!**

## Why YAML?

- More readable than JSON for configuration data
- Supports comments, multi-line strings, and anchors
- Widely used in DevOps (Kubernetes, Docker Compose, Ansible)
- Now officially standardized: [RFC 9512](https://datatracker.ietf.org/doc/rfc9512/) (February 2024)

## RFC 9512 Compliance

Recker implements the official YAML media type:

- **Media type**: `application/yaml` (official)
- **Structured suffix**: `+yaml` for specific types
- **Legacy support**: `text/yaml`, `application/x-yaml`

## Quick Start

### Parse YAML Response

```typescript
import { createClient } from 'recker';

const client = createClient({ baseUrl: 'https://api.example.com' });

// Parse YAML response with .yaml() method
const config = await client.get('/config.yaml').yaml();

// With TypeScript type
interface Config {
  server: { port: number; host: string };
  database: { url: string };
}
const typedConfig = await client.get('/config.yaml').yaml<Config>();
```

### Send YAML Request Body

```typescript
// Using yaml option (auto-sets Content-Type: application/yaml)
await client.post('/config', {
  yaml: {
    server: {
      host: 'localhost',
      port: 3000,
      ssl: true
    },
    database: {
      url: 'postgres://localhost/db'
    }
  }
});
```

### Direct Functions

```typescript
import { parseYaml, serializeYaml } from 'recker';

// Parse YAML string
const data = parseYaml(`
server:
  host: localhost
  port: 3000
  ssl: true
`);

// Serialize to YAML
const yaml = serializeYaml({
  server: { host: 'localhost', port: 3000 }
});
```

## Features

### YAML 1.2 Support

Full support for YAML 1.2 specification:

- **Scalars**: strings, numbers, booleans, null
- **Collections**: sequences (arrays), mappings (objects)
- **Multi-line strings**: literal (`|`) and folded (`>`)
- **Anchors & Aliases**: `&name` and `*name`
- **Flow style**: `[a, b, c]` and `{a: 1, b: 2}`
- **Comments**: `# ignored`
- **Date/time**: ISO 8601 parsing

### Type Coercion

```yaml
# Booleans (case insensitive)
enabled: true     # true, True, TRUE, yes, Yes, YES, on, On, ON
disabled: false   # false, False, FALSE, no, No, NO, off, Off, OFF

# Null
empty: null       # null, Null, NULL, ~

# Special numbers
infinity: .inf    # .inf, .Inf, .INF
neg_inf: -.inf    # Negative infinity
not_a_number: .nan

# Hex and Octal
hex: 0x1A3F
octal: 0o755

# Dates (when parseDates: true)
date: 2024-02-14
datetime: 2024-02-14T10:30:00Z
```

### Multi-line Strings

```yaml
# Literal block (preserves newlines)
literal: |
  Line 1
  Line 2
  Line 3

# Literal with chomp (removes trailing newline)
literal_chomp: |-
  No trailing newline

# Folded block (joins lines)
folded: >
  This is a long
  sentence that will
  be joined.

# Folded with chomp
folded_chomp: >-
  No trailing newline
```

### Anchors and Aliases

```yaml
defaults: &defaults
  adapter: postgres
  host: localhost

development:
  database: dev_db
  <<: *defaults

production:
  database: prod_db
  <<: *defaults
```

## Parse Options

```typescript
interface YamlParseOptions {
  // Allow duplicate keys (last one wins)
  allowDuplicateKeys?: boolean;  // default: false

  // Parse dates as Date objects
  parseDates?: boolean;  // default: true

  // Custom tag handlers
  customTags?: Record<string, (value: string) => any>;

  // Maximum nesting depth (security)
  maxDepth?: number;  // default: 100

  // Maximum number of keys (security)
  maxKeys?: number;  // default: 10000
}
```

### Custom Tags

```typescript
const data = parseYaml(`
env: !env DATABASE_URL
timestamp: !timestamp 1707900000
`, {
  customTags: {
    'env': (value) => process.env[value],
    'timestamp': (value) => new Date(parseInt(value) * 1000)
  }
});
```

## Serialize Options

```typescript
interface YamlSerializeOptions {
  // Indentation spaces
  indent?: number;  // default: 2

  // Line width before wrapping
  lineWidth?: number;  // default: 80

  // Quote all strings
  forceQuotes?: boolean;  // default: false

  // Use flow style for small collections
  flowStyle?: boolean;  // default: false

  // Sort object keys
  sortKeys?: boolean;  // default: false

  // Skip undefined values
  skipUndefined?: boolean;  // default: true

  // Include document markers (---, ...)
  documentMarkers?: boolean;  // default: false
}
```

### Serialization Examples

```typescript
// Default style
serializeYaml({ a: 1, b: [1, 2, 3] });
// a: 1
// b:
//   - 1
//   - 2
//   - 3

// Flow style for small collections
serializeYaml({ a: 1, b: [1, 2, 3] }, { flowStyle: true });
// a: 1
// b: [1, 2, 3]

// With document markers
serializeYaml({ version: '1.0' }, { documentMarkers: true });
// ---
// version: "1.0"
// ...

// Sorted keys
serializeYaml({ z: 1, a: 2, m: 3 }, { sortKeys: true });
// a: 2
// m: 3
// z: 1
```

## Security

Built-in protection against common attacks:

### Maximum Depth

Prevents stack overflow from deeply nested structures:

```typescript
// Throws YamlError if depth > 100
parseYaml(deeplyNestedYaml, { maxDepth: 50 });
```

### Maximum Keys

Prevents "billion laughs" attack (entity expansion):

```typescript
// Throws YamlError if keys > 10000
parseYaml(hugeYaml, { maxKeys: 1000 });
```

## Error Handling

```typescript
import { YamlError } from 'recker';

try {
  parseYaml(invalidYaml);
} catch (error) {
  if (error instanceof YamlError) {
    console.log(`Parse error at line ${error.line}: ${error.message}`);
  }
}
```

## Comparison with Competitors

| Feature | Recker | Axios | Got | Ky |
|---------|--------|-------|-----|-----|
| Native YAML parsing | ✅ | ❌ | ❌ | ❌ |
| YAML request body | ✅ | ❌ | ❌ | ❌ |
| RFC 9512 compliant | ✅ | N/A | N/A | N/A |
| Zero dependencies | ✅ | - | - | - |

Other HTTP clients require:
1. Calling `.text()` to get raw response
2. Using external library (js-yaml, yaml) to parse
3. Manually setting Content-Type header for requests

Recker does all this natively with `.yaml()`.

## Use Cases

### Kubernetes Config

```typescript
const kubeconfig = await client
  .get('/api/v1/namespaces/default/configmaps/app-config')
  .yaml<KubeConfigMap>();
```

### Docker Compose

```typescript
const compose = parseYaml(fs.readFileSync('docker-compose.yml', 'utf8'));
```

### CI/CD Pipelines

```typescript
const pipeline = await client.get('/pipelines/main.yaml').yaml();
```

### OpenAPI/Swagger

```typescript
const spec = await client.get('/openapi.yaml').yaml<OpenAPISpec>();
```

## See Also

- [XML Plugin](/plugins/18-xml.md) - XML serialization and parsing
- [GraphQL Plugin](/plugins/graphql.md) - GraphQL client
- [Request Options](/http/03-request-options.md) - All request options
