# CSV Plugin

Native CSV support following RFC 4180 specification.

## Why CSV?

- Universal data exchange format
- Human-readable and editable
- Supported by Excel, Google Sheets, databases
- Perfect for data import/export APIs
- Officially standardized: [RFC 4180](https://www.rfc-editor.org/rfc/rfc4180)

## Quick Start

### Parse CSV Response

```typescript
import { createClient } from 'recker';

const client = createClient({ baseUrl: 'https://api.example.com' });

// Parse as array of objects (with headers)
const users = await client.get('/users.csv').csv();
// [{ name: 'John', age: '30' }, { name: 'Jane', age: '25' }]

// Parse as array of arrays (no headers)
const data = await client.get('/data.csv').csv({ headers: false });
// [['name', 'age'], ['John', '30'], ['Jane', '25']]

// With TypeScript type
interface User { name: string; age: string }
const users = await client.get('/users.csv').csv<User>();
```

### Send CSV Request Body

```typescript
// Using csv option (auto-sets Content-Type: text/csv)
await client.post('/import', {
  csv: [
    { name: 'John', age: 30, city: 'NYC' },
    { name: 'Jane', age: 25, city: 'LA' }
  ]
});
```

### Direct Functions

```typescript
import { parseCsv, serializeCsv, parseCsvTyped } from 'recker';

// Parse CSV string
const data = parseCsv('name,age\nJohn,30\nJane,25');
// [{ name: 'John', age: '30' }, { name: 'Jane', age: '25' }]

// Parse with automatic type conversion
const typed = parseCsvTyped('name,age,active\nJohn,30,true');
// [{ name: 'John', age: 30, active: true }]

// Serialize to CSV
const csv = serializeCsv([
  { name: 'John', age: 30 },
  { name: 'Jane', age: 25 }
]);
// "name,age\r\nJohn,30\r\nJane,25"
```

## RFC 4180 Compliance

### Field Separator
Fields are separated by commas (`,`).

### Line Ending
RFC 4180 specifies CRLF (`\r\n`), but the parser accepts any line ending.

### Quoting Rules
- Fields containing commas, quotes, or newlines must be quoted
- Double quotes inside quoted fields are escaped by doubling (`""`)

### Header Handling
- First row can optionally be headers
- Use `header` parameter to control behavior

## Parse Options

```typescript
interface CsvParseOptions {
  // First row contains headers (returns objects)
  headers?: boolean;  // default: true

  // Custom header names (overrides first row)
  columns?: string[];

  // Field delimiter
  delimiter?: string;  // default: ','

  // Quote character
  quote?: string;  // default: '"'

  // Skip empty lines
  skipEmptyLines?: boolean;  // default: true

  // Trim whitespace from fields
  trim?: boolean;  // default: false (RFC 4180 says spaces are part of field)

  // Convert numeric strings to numbers
  parseNumbers?: boolean;  // default: false

  // Convert 'true'/'false' to booleans
  parseBooleans?: boolean;  // default: false

  // Comment character (lines starting with this are skipped)
  comment?: string;  // default: undefined

  // Maximum rows (security)
  maxRows?: number;  // default: 100000

  // Maximum columns (security)
  maxColumns?: number;  // default: 1000
}
```

### Examples

```typescript
// Without headers (returns arrays)
const rows = parseCsv('John,30\nJane,25', { headers: false });
// [['John', '30'], ['Jane', '25']]

// Custom columns
const data = parseCsv('John,30\nJane,25', {
  columns: ['name', 'age']
});
// [{ name: 'John', age: '30' }, { name: 'Jane', age: '25' }]

// Tab-separated (TSV)
const tsv = parseCsv('name\tage\nJohn\t30', { delimiter: '\t' });

// With type conversion
const typed = parseCsv('name,age,active\nJohn,30,true', {
  parseNumbers: true,
  parseBooleans: true
});
// [{ name: 'John', age: 30, active: true }]

// Skip comment lines
const data = parseCsv('# Comment\nname,age\nJohn,30', { comment: '#' });
```

## Serialize Options

```typescript
interface CsvSerializeOptions {
  // Include header row
  headers?: boolean;  // default: true

  // Custom header names
  columns?: string[];

  // Field delimiter
  delimiter?: string;  // default: ','

  // Quote character
  quote?: string;  // default: '"'

  // Always quote fields
  alwaysQuote?: boolean;  // default: false

  // Line ending
  lineEnding?: string;  // default: '\r\n' (RFC 4180)

  // Null/undefined representation
  nullValue?: string;  // default: ''
}
```

### Examples

```typescript
// Basic serialization
const csv = serializeCsv([
  { name: 'John', age: 30 },
  { name: 'Jane', age: 25 }
]);
// name,age\r\nJohn,30\r\nJane,25

// Select specific columns
const csv = serializeCsv(data, {
  columns: ['name', 'email']  // Only include these columns
});

// Tab-separated (TSV)
const tsv = serializeCsv(data, { delimiter: '\t' });

// Always quote fields
const csv = serializeCsv(data, { alwaysQuote: true });
// "name","age"\r\n"John","30"

// Array of arrays (no headers)
const csv = serializeCsv([
  ['John', 30],
  ['Jane', 25]
], { headers: false });
```

## Type Inference

Use `parseCsvTyped` for automatic type conversion:

```typescript
const csv = 'name,age,salary,active,joined\nJohn,30,50000.50,true,2024-01-15';

const data = parseCsvTyped(csv);
// [{
//   name: 'John',           // string
//   age: 30,                // number (integer)
//   salary: 50000.50,       // number (float)
//   active: true,           // boolean
//   joined: Date object     // Date (ISO 8601)
// }]
```

Types detected:
- **Integers**: `30`, `-42`
- **Floats**: `3.14`, `-0.5`, `1e10`
- **Booleans**: `true`, `false` (case-insensitive)
- **Dates**: ISO 8601 format (`2024-01-15`, `2024-01-15T10:30:00Z`)
- **Null**: Empty strings become `null`
- **Strings**: Everything else

## Streaming (Large Files)

For large CSV files, use streaming to process **row by row** without loading everything into memory.

### Why Streaming?

| Method | Memory Usage | Best For |
|--------|--------------|----------|
| `.csv()` | Loads entire file | Small files (< 10MB) |
| `parseCsvStream()` | Constant ~few MB | Large files (10MB+) |

### Basic Usage

```typescript
import { parseCsvStream } from 'recker';

const response = await client.get('/large-file.csv');

for await (const row of parseCsvStream(response.read())) {
  console.log(row);
  // { name: 'John', age: '30' }
  // Processes one row at a time, then releases memory
}
```

### How It Works

`parseCsvStream` is an **AsyncGenerator** that:

1. Receives the `ReadableStream` from the response
2. Reads chunks of bytes as they arrive from the network
3. Accumulates in a buffer until finding a complete line
4. Parses only that line and `yield`s the object
5. Releases memory and continues to the next chunk

```
Network → Chunks → Buffer → Parse Line → Yield Object → Free Memory
                     ↑                          |
                     └──────────────────────────┘
```

### Batch Processing Example

Process millions of rows with minimal memory:

```typescript
const response = await client.get('/users-1million.csv');

let processed = 0;
let batch: User[] = [];

for await (const user of parseCsvStream<User>(response.read())) {
  batch.push(user);

  // Process in batches of 1000
  if (batch.length >= 1000) {
    await saveToDatabase(batch);
    batch = [];
    processed += 1000;
    console.log(`Processed ${processed} rows...`);
  }
}

// Handle remaining rows
if (batch.length > 0) {
  await saveToDatabase(batch);
}

console.log(`Done! Total: ${processed + batch.length} rows`);
```

### With Progress Tracking

```typescript
const response = await client.get('/export.csv');
const contentLength = response.headers.get('content-length');
const total = contentLength ? parseInt(contentLength) : undefined;

let bytesRead = 0;
let rowCount = 0;

for await (const row of parseCsvStream(response.read())) {
  rowCount++;

  // Log progress every 10000 rows
  if (rowCount % 10000 === 0) {
    console.log(`Processed ${rowCount} rows...`);
  }

  await processRow(row);
}
```

### Streaming Options

All parse options work with streaming:

```typescript
for await (const row of parseCsvStream(response.read(), {
  delimiter: '\t',           // TSV
  headers: true,             // First row is headers
  columns: ['id', 'name'],   // Custom column names
  skipEmptyLines: true,
  trim: true
})) {
  // ...
}
```

### Early Exit

You can stop processing at any time:

```typescript
for await (const row of parseCsvStream(response.read())) {
  if (row.id === targetId) {
    console.log('Found!', row);
    break;  // Stops reading, closes stream
  }
}
```

## Special Characters

The parser correctly handles:

```csv
name,description,price
"John ""The Man""",Has commas, here,"$10,000"
Simple,No quotes needed,100
"Multi
line",Spans lines,50
```

```typescript
const data = parseCsv(csv);
// [
//   { name: 'John "The Man"', description: 'Has commas, here', price: '$10,000' },
//   { name: 'Simple', description: 'No quotes needed', price: '100' },
//   { name: 'Multi\nline', description: 'Spans lines', price: '50' }
// ]
```

## Security

Built-in protection:

### Maximum Rows
```typescript
// Throws CsvError if rows > 100000
parseCsv(hugeFile, { maxRows: 10000 });
```

### Maximum Columns
```typescript
// Throws CsvError if columns > 1000
parseCsv(wideFile, { maxColumns: 100 });
```

## Error Handling

```typescript
import { CsvError } from 'recker';

try {
  parseCsv(invalidCsv);
} catch (error) {
  if (error instanceof CsvError) {
    console.log(`Parse error at row ${error.row}: ${error.message}`);
  }
}
```

## Use Cases

### Data Export API

```typescript
// Export users as CSV
const users = await client.get('/api/users/export').csv<User>();

// Save to file
const csv = serializeCsv(users);
fs.writeFileSync('users.csv', csv);
```

### Bulk Import

```typescript
// Read CSV file
const csv = fs.readFileSync('products.csv', 'utf8');
const products = parseCsvTyped<Product>(csv);

// Send to API
await client.post('/api/products/import', { csv: products });
```

### Spreadsheet Integration

```typescript
// Download from Google Sheets
const data = await client
  .get('https://docs.google.com/spreadsheets/d/.../export?format=csv')
  .csv();
```

### Log Processing

```typescript
// Parse log file with custom delimiter
const logs = parseCsv(logContent, {
  delimiter: '|',
  headers: false,
  columns: ['timestamp', 'level', 'message']
});
```

## Comparison with Competitors

| Feature | Recker | Axios | Got | Ky |
|---------|--------|-------|-----|-----|
| Native CSV parsing | ✅ | ❌ | ❌ | ❌ |
| CSV request body | ✅ | ❌ | ❌ | ❌ |
| Type inference | ✅ | N/A | N/A | N/A |
| Streaming parser | ✅ | N/A | N/A | N/A |
| RFC 4180 compliant | ✅ | N/A | N/A | N/A |

## See Also

- [YAML Plugin](/plugins/19-yaml.md) - YAML support (RFC 9512)
- [XML Plugin](/plugins/18-xml.md) - XML serialization and parsing
- [Request Options](/http/03-request-options.md) - All request options
