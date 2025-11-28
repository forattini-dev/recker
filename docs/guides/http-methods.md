# HTTP Methods Reference

Recker supports **19 HTTP methods** out of the box. This comprehensive support enables everything from simple REST APIs to WebDAV file management and CDN cache invalidation.

## Method Categories

```
Standard Methods (7)     WebDAV Methods (8)
├── GET                  ├── PROPFIND
├── POST                 ├── PROPPATCH
├── PUT                  ├── MKCOL
├── PATCH                ├── COPY
├── DELETE               ├── MOVE
├── HEAD                 ├── LOCK
└── OPTIONS              └── UNLOCK

Diagnostic (2)           CDN/Cache (1)        Link (2)
├── TRACE                └── PURGE            ├── LINK
└── CONNECT                                   └── UNLINK
```

---

## Standard Methods

### GET

Retrieve data from a server. The most common HTTP method.

```typescript
// Simple GET
const users = await client.get('/users').json();

// With query parameters
const filtered = await client.get('/users', {
  params: { status: 'active', page: 1 }
}).json();
// → GET /users?status=active&page=1

// With path parameters
const user = await client.get('/users/:id', {
  params: { id: '123' }
}).json();
// → GET /users/123
```

**Properties:**
- Safe: Yes (doesn't modify data)
- Idempotent: Yes (repeated calls return same result)
- Cacheable: Yes
- Body: Not allowed

### POST

Submit data to create a new resource.

```typescript
// JSON body
const newUser = await client.post('/users', {
  json: { name: 'John', email: 'john@example.com' }
}).json();

// Form data
const result = await client.post('/upload', {
  form: { file: fs.createReadStream('./file.txt') }
}).json();

// Shorthand - body directly
const data = await client.post('/api', { title: 'Hello' }).json();
```

**Properties:**
- Safe: No
- Idempotent: No (repeated calls may create duplicates)
- Cacheable: Only with explicit headers
- Body: Required

### PUT

Replace an entire resource at a specific URL.

```typescript
// Replace user data
await client.put('/users/123', {
  json: { name: 'John Updated', email: 'john.new@example.com' }
});

// Upsert pattern
await client.put('/config/theme', {
  json: { dark: true, accent: '#ff0000' }
});
```

**Properties:**
- Safe: No
- Idempotent: Yes (same request = same result)
- Cacheable: No
- Body: Required

### PATCH

Partially update a resource.

```typescript
// Update only specific fields
await client.patch('/users/123', {
  json: { email: 'new.email@example.com' }
});

// JSON Patch format (RFC 6902)
await client.patch('/users/123', {
  json: [
    { op: 'replace', path: '/email', value: 'new@example.com' },
    { op: 'add', path: '/verified', value: true }
  ],
  headers: { 'Content-Type': 'application/json-patch+json' }
});
```

**Properties:**
- Safe: No
- Idempotent: Not guaranteed (depends on implementation)
- Cacheable: No
- Body: Required

### DELETE

Remove a resource.

```typescript
// Delete user
await client.delete('/users/123');

// Delete with confirmation
await client.delete('/posts/456', {
  headers: { 'X-Confirm-Delete': 'true' }
});
```

**Properties:**
- Safe: No
- Idempotent: Yes (deleting twice = same result)
- Cacheable: No
- Body: Optional (rarely used)

### HEAD

Retrieve headers only, no body. Identical to GET but without response body.

```typescript
// Check if resource exists
const response = await client.head('/files/large-video.mp4');
console.log(response.status); // 200 or 404

// Get file size before downloading
const contentLength = response.headers.get('Content-Length');
console.log(`File size: ${contentLength} bytes`);

// Check last modified
const lastModified = response.headers.get('Last-Modified');
```

**Use Cases:**
- Check resource existence without downloading
- Get file size before download
- Check cache validity (ETag, Last-Modified)
- Test URL accessibility

**Properties:**
- Safe: Yes
- Idempotent: Yes
- Cacheable: Yes
- Body: Not allowed in response

### OPTIONS

Discover allowed methods and CORS preflight.

```typescript
// Check what methods are allowed
const response = await client.options('/users');
const allowed = response.headers.get('Allow');
console.log(allowed); // "GET, POST, PUT, DELETE, OPTIONS"

// CORS preflight info
const corsOrigins = response.headers.get('Access-Control-Allow-Origin');
const corsMethods = response.headers.get('Access-Control-Allow-Methods');
```

**Properties:**
- Safe: Yes
- Idempotent: Yes
- Cacheable: No
- Body: Optional

---

## Diagnostic Methods

### TRACE

Echo back the received request for debugging. Useful for diagnosing proxy behavior and request transformations.

```typescript
// Debug request path through proxies
const response = await client.trace('/debug');
const echoed = await response.text();
console.log('Request as seen by server:', echoed);

// Check if proxy modified headers
// Response body contains the exact request received by server
```

**Use Cases:**
- Debug proxy chains
- Verify headers aren't modified in transit
- Network troubleshooting
- Test intermediate caches

**Security Note:** Many servers disable TRACE to prevent XST attacks. Use in development only.

**Properties:**
- Safe: Yes
- Idempotent: Yes
- Cacheable: No
- Body: Not allowed

### CONNECT

Establish a tunnel through an HTTP proxy, primarily used for HTTPS connections through proxies.

```typescript
// Establish tunnel to secure server
const response = await client.connect('secure.example.com:443');

// Used internally by proxy configurations
// Typically you won't call this directly
```

**Use Cases:**
- HTTPS proxy tunneling
- WebSocket upgrades through proxies
- Custom protocol tunneling

**Properties:**
- Safe: No
- Idempotent: No
- Cacheable: No
- Body: Not applicable (switches to tunnel mode)

---

## CDN & Cache Methods

### PURGE

Invalidate cached content on CDNs and caching servers.

```typescript
// Purge from Varnish/Fastly/Cloudflare
await client.purge('/assets/style.css');

// Purge with cache tags (Varnish)
await client.purge('/api/products', {
  headers: { 'X-Cache-Tags': 'products,catalog' }
});

// Purge entire path pattern (Cloudflare)
await client.purge('/images/*', {
  headers: { 'CF-Cache-Tag': 'images' }
});
```

**CDN Support:**
| CDN | Header | Notes |
|-----|--------|-------|
| Varnish | X-Cache-Tags | Tag-based purging |
| Fastly | Surrogate-Key | Instant purge |
| Cloudflare | CF-Cache-Tag | Enterprise feature |
| Nginx | - | Custom config required |

**Use Cases:**
- Invalidate stale content after updates
- Clear CDN cache for updated assets
- Selective cache invalidation by tag

**Properties:**
- Safe: No (modifies cache state)
- Idempotent: Yes
- Cacheable: No
- Body: Optional (varies by CDN)

---

## WebDAV Methods

WebDAV (Web Distributed Authoring and Versioning) extends HTTP for file management. Recker supports all 8 WebDAV methods.

### PROPFIND

Retrieve properties of a resource or collection. Similar to "ls -la" for web resources.

```typescript
// Get all properties
const props = await client.propfind('/documents/').json();

// Get specific properties
const specific = await client.propfind('/documents/', {
  xml: {
    propfind: {
      '@xmlns:D': 'DAV:',
      prop: {
        'D:displayname': '',
        'D:getcontentlength': '',
        'D:getlastmodified': ''
      }
    }
  }
}).json();

// List directory contents
const listing = await client.propfind('/shared/', {
  headers: { 'Depth': '1' }  // 0=self, 1=children, infinity=all
}).json();
```

**Depth Header:**
- `0`: Properties of resource only
- `1`: Resource + immediate children
- `infinity`: Entire subtree (use with caution)

### PROPPATCH

Modify properties of a resource without changing its content.

```typescript
// Set custom properties
await client.proppatch('/documents/report.docx', {
  xml: {
    propertyupdate: {
      '@xmlns:D': 'DAV:',
      set: {
        prop: {
          'author': 'John Doe',
          'department': 'Engineering'
        }
      }
    }
  }
});

// Remove properties
await client.proppatch('/documents/old-file.txt', {
  xml: {
    propertyupdate: {
      '@xmlns:D': 'DAV:',
      remove: {
        prop: {
          'deprecated-field': ''
        }
      }
    }
  }
});
```

### MKCOL

Create a new collection (directory).

```typescript
// Create directory
await client.mkcol('/documents/new-folder');

// Create nested structure (each level separately)
await client.mkcol('/documents/2024');
await client.mkcol('/documents/2024/Q1');
await client.mkcol('/documents/2024/Q1/reports');

// With error handling
try {
  await client.mkcol('/existing-folder');
} catch (error) {
  if (error.status === 405) {
    console.log('Folder already exists');
  }
}
```

### COPY

Copy a resource to a new location.

```typescript
// Copy file
await client.copy('/documents/template.docx', {
  headers: {
    'Destination': 'https://server.com/documents/report.docx'
  }
});

// Copy directory (with contents)
await client.copy('/documents/templates/', {
  headers: {
    'Destination': 'https://server.com/archive/templates/',
    'Depth': 'infinity'
  }
});

// Overwrite existing
await client.copy('/source.txt', {
  headers: {
    'Destination': 'https://server.com/target.txt',
    'Overwrite': 'T'  // T=true, F=false
  }
});
```

### MOVE

Move (rename) a resource to a new location.

```typescript
// Rename file
await client.move('/documents/old-name.txt', {
  headers: {
    'Destination': 'https://server.com/documents/new-name.txt'
  }
});

// Move to different folder
await client.move('/inbox/report.pdf', {
  headers: {
    'Destination': 'https://server.com/archive/2024/report.pdf',
    'Overwrite': 'F'  // Fail if exists
  }
});

// Move directory
await client.move('/temp/uploads/', {
  headers: {
    'Destination': 'https://server.com/permanent/uploads/',
    'Depth': 'infinity'
  }
});
```

### LOCK

Lock a resource to prevent concurrent modifications.

```typescript
// Exclusive write lock
const lockResponse = await client.lock('/documents/important.docx', {
  xml: {
    lockinfo: {
      '@xmlns:D': 'DAV:',
      lockscope: { exclusive: '' },
      locktype: { write: '' },
      owner: {
        href: 'mailto:john@example.com'
      }
    }
  },
  headers: {
    'Timeout': 'Second-3600'  // Lock for 1 hour
  }
});

// Extract lock token from response
const lockToken = lockResponse.headers.get('Lock-Token');
console.log('Lock acquired:', lockToken);

// Use lock token for subsequent operations
await client.put('/documents/important.docx', {
  body: newContent,
  headers: {
    'If': `(<${lockToken}>)`
  }
});
```

**Lock Types:**
- **Exclusive**: Only lock owner can modify
- **Shared**: Multiple users can hold read locks

### UNLOCK

Remove a lock from a resource.

```typescript
// Unlock with token
await client.unlock('/documents/important.docx', {
  headers: {
    'Lock-Token': '<urn:uuid:a-]lock-token>'
  }
});

// Clean unlock helper
async function unlockResource(path: string, lockToken: string) {
  return client.unlock(path, {
    headers: { 'Lock-Token': `<${lockToken}>` }
  });
}
```

---

## Link Methods (RFC 2068)

### LINK

Establish a relationship between resources.

```typescript
// Link resources
await client.link('/articles/123', {
  headers: {
    'Link': '</authors/john>; rel="author"'
  }
});

// Multiple links
await client.link('/posts/456', {
  headers: {
    'Link': '</categories/tech>; rel="category", </tags/javascript>; rel="tag"'
  }
});
```

**Use Cases:**
- Establish resource relationships
- Link content to metadata
- Cross-reference documents

### UNLINK

Remove a relationship between resources.

```typescript
// Remove link
await client.unlink('/articles/123', {
  headers: {
    'Link': '</authors/john>; rel="author"'
  }
});
```

---

## Method Properties Reference

| Method | Safe | Idempotent | Cacheable | Body |
|--------|------|------------|-----------|------|
| GET | Yes | Yes | Yes | No |
| HEAD | Yes | Yes | Yes | No |
| POST | No | No | Rarely | Yes |
| PUT | No | Yes | No | Yes |
| PATCH | No | No | No | Yes |
| DELETE | No | Yes | No | Optional |
| OPTIONS | Yes | Yes | No | Optional |
| TRACE | Yes | Yes | No | No |
| CONNECT | No | No | No | N/A |
| PURGE | No | Yes | No | Optional |
| PROPFIND | Yes | Yes | Yes | Optional |
| PROPPATCH | No | Yes | No | Yes |
| MKCOL | No | Yes | No | Optional |
| COPY | No | Yes | No | Optional |
| MOVE | No | Yes | No | Optional |
| LOCK | No | No | No | Yes |
| UNLOCK | No | Yes | No | No |
| LINK | No | Yes | No | Optional |
| UNLINK | No | Yes | No | Optional |

**Definitions:**
- **Safe**: Method doesn't modify server state
- **Idempotent**: Repeated identical requests have same effect
- **Cacheable**: Response can be stored for reuse

---

## AI-First Patterns

### Streaming AI Responses

```typescript
// Stream OpenAI completions
const response = await client.post('/v1/chat/completions', {
  json: {
    model: 'gpt-5',
    messages: [{ role: 'user', content: 'Hello' }],
    stream: true
  }
});

// Process Server-Sent Events
for await (const event of response.sse()) {
  const data = JSON.parse(event.data);
  process.stdout.write(data.choices[0]?.delta?.content || '');
}
```

### Checking Model Availability

```typescript
// HEAD to check without loading
const response = await client.head('/v1/models/gpt-5');
if (response.ok) {
  console.log('Model available');
}
```

### Batch Embeddings

```typescript
const embeddings = await client.batch([
  { path: '/v1/embeddings', options: { json: { input: 'text1', model: 'text-embedding-3-small' } } },
  { path: '/v1/embeddings', options: { json: { input: 'text2', model: 'text-embedding-3-small' } } },
  { path: '/v1/embeddings', options: { json: { input: 'text3', model: 'text-embedding-3-small' } } },
], { concurrency: 5 });
```

---

## Best Practices

### 1. Use Semantic Methods

```typescript
// Good: Semantic methods
await client.delete('/users/123');
await client.patch('/users/123', { json: { name: 'Updated' } });

// Avoid: POST for everything
await client.post('/users/123/delete');
await client.post('/users/123/update', { json: { name: 'Updated' } });
```

### 2. Leverage Idempotency

```typescript
// Safe to retry - PUT is idempotent
await client.put('/config/settings', {
  json: settings,
  retry: { maxAttempts: 3 }
});

// Be careful - POST is NOT idempotent
await client.post('/orders', {
  json: order,
  headers: { 'Idempotency-Key': crypto.randomUUID() }
});
```

### 3. HEAD Before GET for Large Resources

```typescript
// Check size before downloading
const head = await client.head('/files/large-video.mp4');
const size = parseInt(head.headers.get('Content-Length') || '0');

if (size > 100 * 1024 * 1024) {
  console.log('File too large, skipping');
} else {
  const file = await client.get('/files/large-video.mp4').blob();
}
```

### 4. OPTIONS for API Discovery

```typescript
// Discover API capabilities
const options = await client.options('/api');
const methods = options.headers.get('Allow')?.split(',').map(m => m.trim());

if (methods?.includes('PATCH')) {
  await client.patch('/api/resource', { json: update });
} else {
  await client.put('/api/resource', { json: fullUpdate });
}
```
