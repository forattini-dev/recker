# Client API

The `Client` class is the main entry point for Recker.

```typescript
import { createClient } from 'recker';
const client = createClient(options);
```

## Standard HTTP Methods

Shortcuts for common REST verbs.

| Method | Signature | Description |
| :--- | :--- | :--- |
| **`.get<T>()`** | `(url, options?)` | Retrieve data. |
| **`.post<T>()`** | `(url, body?, options?)` | Create/submit data. |
| **`.put<T>()`** | `(url, body?, options?)` | Replace data. |
| **`.patch<T>()`** | `(url, body?, options?)` | Update data partially. |
| **`.delete<T>()`** | `(url, options?)` | Remove data. |
| **`.head<T>()`** | `(url, options?)` | Get headers only. |
| **`.options<T>()`** | `(url, options?)` | Get supported methods. |

## Advanced HTTP Methods

Support for WebDAV, CDN invalidation, and network diagnostics.

| Method | Description |
| :--- | :--- |
| **`.purge()`** | Invalidate cache (CDN/Proxy). |
| **`.trace()`** | Echo request for debugging. |
| **`.connect()`** | Establish tunnel. |
| **`.propfind()`** | Retrieve WebDAV properties. |
| **`.proppatch()`** | Set WebDAV properties. |
| **`.mkcol()`** | Create WebDAV collection (folder). |
| **`.copy()`** | Copy resource (WebDAV). |
| **`.move()`** | Move/Rename resource (WebDAV). |
| **`.lock()`** | Lock resource (WebDAV). |
| **`.unlock()`** | Unlock resource (WebDAV). |
| **`.link()`** | Create semantic link. |
| **`.unlink()`** | Remove semantic link. |

## Realtime & Streaming

| Method | Description |
| :--- | :--- |
| **`.websocket()`** | Connect to a WebSocket server. Returns `ReckerWebSocket`. |
| **`.ws()`** | Alias for `.websocket()`. |
| **`.sse()`** | Use on a request chain: `client.get(...).sse()`. Returns async generator. |

## Data & Batching

| Method | Description |
| :--- | :--- |
| **`.batch()`** | Run parallel requests with concurrency control. |
| **`.multi()`** | Alias for `.batch()`. |
| **`.paginate()`** | Iterate over items from a paginated API. |
| **`.pages()`** | Iterate over full page responses (with metadata). |
| **`.page()`** | Fetch a specific page number directly. |
| **`.getAll()`** | Fetch all pages and return a single array. |

## Utils & Network Tools

| Method | Description |
| :--- | :--- |
| **`.whois()`** | Perform a WHOIS lookup for a domain. |
| **`.isDomainAvailable()`** | Check if a domain is unregistered. |

## Request Object (`options`)

Common options for all request methods.

```typescript
interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number>; // Query params
  timeout?: number;
  signal?: AbortSignal;
  throwHttpErrors?: boolean; // Default: true
  
  // Hooks overrides
  onUploadProgress?: (progress) => void;
  onDownloadProgress?: (progress) => void;
  
  // Limits
  maxResponseSize?: number;
}
```
