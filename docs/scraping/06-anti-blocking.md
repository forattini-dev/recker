# Anti-Blocking & TLS Fingerprinting

When scraping modern websites, you might encounter `403 Forbidden` or generic `Network Errors` even if your headers look perfect. This is often due to **TLS Fingerprinting** (also known as JA3).

## The Problem: TLS Fingerprinting

Standard Node.js HTTP clients (including Recker's default `Undici` transport) use the **OpenSSL** library. 

Sophisticated WAFs (Web Application Firewalls) like **Cloudflare** and **Akamai** analyze the low-level TLS handshake packet (the specific order of ciphers, extensions, and flags) sent during the initial connection. 

*   **Node.js/OpenSSL** sends a specific, static fingerprint.
*   **Browsers** (Chrome, Firefox) send different, dynamic fingerprints.

If a WAF sees a "Browser User-Agent" header but a "Node.js TLS Fingerprint", it immediately blocks the connection as an imposter.

## The Solution: Curl Transport

Recker provides a **`CurlTransport`** that bypasses Node.js's internal HTTP stack entirely. Instead, it orchestrates the system's `curl` binary to perform the network request.

### Why Curl?

1.  **Different Stack:** `curl` uses different TLS libraries (often compiling against different OpenSSL versions or other libs) than Node.js, often bypassing simple fingerprint checks.
2.  **Impersonation:** When paired with **`curl-impersonate`** (a modified version of curl), it can send TLS handshakes that are *bit-for-bit identical* to real browsers.

### Usage

You can enable the Curl transport per-request or globally.

```typescript
// Per-request override
await client.get('https://protected-site.com', {
  useCurl: true
});

// Global configuration
const client = createClient({
  useCurl: true, // Use Curl for all requests
  headers: {
    'User-Agent': 'Mozilla/5.0 ...' // Combine with browser headers
  }
});
```

### Setup `curl-impersonate`

For the best results, Recker can download and manage `curl-impersonate` for you automatically.

```bash
# In your terminal
rek setup
```

This installs a specialized binary that mimics Chrome/Firefox TLS signatures. The `CurlTransport` automatically prefers this binary if found.

### When to use what?

| Transport | Engine | Pros | Cons | Best For |
|:---|:---|:---|:---|:---|
| **Undici** (Default) | Node.js / OpenSSL | Fastest, Keep-Alive, Streaming | Identifiable TLS Fingerprint | APIs, Internal Services, Standard Sites |
| **Curl** | System Binary | Bypasses JA3/Fingerprinting, HTTP/2 Robustness | Slower (process spawning) | **Scraping Protected Sites**, HLS Downloads |
