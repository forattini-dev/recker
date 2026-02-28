# Anti-Blocking & TLS Fingerprinting

When scraping modern websites, you might encounter `403 Forbidden` or generic `Network Errors` even if your headers look perfect. This is often due to **TLS Fingerprinting** (also known as JA3).

## Quick Start

```bash
# One-time setup (optional, for protected sites)
npx recker setup
```

```typescript
import { Spider } from 'recker/scrape';

const spider = new Spider({ maxPages: 50 });
await spider.crawl('https://protected-site.com');
// Automatically uses curl-impersonate when blocked
```

**That's it!** The Spider handles everything automatically. Read on if you want to understand how it works.

## Do I Need This?

| Site Type | Need `npx recker setup`? | Notes |
|:----------|:------------------------|:------|
| Internal APIs | ❌ No | Direct access, no WAF |
| Public APIs (GitHub, Stripe) | ❌ No | API tokens bypass protection |
| Regular websites | ❌ No | Most sites don't block |
| Cloudflare-protected sites | ✅ Recommended | Auto-fallback helps |
| LinkedIn, Twitter, Amazon | ✅ Required | Heavy bot protection |
| Government sites (.gov, .mil) | ✅ Recommended | Often have WAFs |

**Without setup**: Spider works normally with Undici. If blocked, requests fail gracefully.

**With setup**: Spider automatically retries blocked requests with curl-impersonate.

## The Problem: TLS Fingerprinting

Standard Node.js HTTP clients (including Recker's default `Undici` transport) use the **OpenSSL** library.

Sophisticated WAFs (Web Application Firewalls) like **Cloudflare** and **Akamai** analyze the low-level TLS handshake packet (the specific order of ciphers, extensions, and flags) sent during the initial connection.

*   **Node.js/OpenSSL** sends a specific, static fingerprint.
*   **Browsers** (Chrome, Firefox) send different, dynamic fingerprints.

If a WAF sees a "Browser User-Agent" header but a "Node.js TLS Fingerprint", it immediately blocks the connection as an imposter.

## The Solution: Smart Transport Selection

Recker provides three transport modes for HTTP requests:

| Mode | Behavior | Best For |
|:-----|:---------|:---------|
| `auto` (default) | Start fast on Undici and escalate to curl-impersonate on CAPTCHA/WAF signals | General crawling |
| `undici` | Always use Undici (fastest) | APIs, internal services |
| `curl` | Always use curl-impersonate | Protected sites |

### Auto Mode: Intelligent Fallback

The `auto` transport mode (default) provides a practical balance:

1. **Selective starting point**: Known anti-bot domains start with curl-impersonate immediately.
2. **Detection loop**: Each response is analyzed by block and CAPTCHA detectors (status + headers + body + scripts + forms + nonce markers).
3. **Escalation**: If strong challenge signals appear, the crawler increases retry delay and prefers curl on next attempts.
4. **Cooldown**: Challenge-heavy domains wait before next retry, reducing re-trigger frequency.
5. **Domain memory**: Repeated block/challenge signals keep forcing curl automatically.

```typescript
import { Spider } from 'recker/scrape';

// Auto mode is the default
const spider = new Spider({
  transport: 'auto', // optional - this is the default
  maxDomainBlockStrikes: 1,
  maxRetryAttempts: 4,
  maxPages: 50,
});

const results = await spider.crawl('https://protected-site.com');
```

### Captcha-aware callbacks

```typescript
import { Spider } from 'recker/scrape';

const spider = new Spider({
  transport: 'auto',
  onCaptchaDetected: ({ url, status, confidence, provider, usedCurl }) => {
    console.log('[captcha]', {
      url,
      status,
      provider,
      confidence,
      transport: usedCurl ? 'curl' : 'undici',
    });
  },
});

const result = await spider.crawl('https://protected-site.com');
```

### Block Detection

Recker detects blocks using multiple signals:

| Signal | Detection Method | Confidence |
|:-------|:-----------------|:-----------|
| **Status codes** | 403, 429, 503 | Medium |
| **Cloudflare** | `cf-ray` header + challenge page patterns | High |
| **Akamai** | `x-akamai-*` headers + "Access Denied" patterns | High |
| **DataDome** | `x-datadome` header + captcha-delivery.com | High |
| **CAPTCHA** | reCAPTCHA, hCaptcha, FunCaptcha, Turnstile markers + headers + scripts | High |
| **Rate limiting** | "too many requests", "slow down" patterns | Medium |
| **Generic WAF** | "blocked", "bot detected" patterns | Medium |

### Provider-aware retry behavior

```typescript
const spider = new Spider({
  transport: 'auto',
  baseRetryDelayMs: 900,
  maxRetryDelayMs: 18000,
  retryBackoffMultiplier: 2.2,
  retryJitterMs: 350,
  maxDomainBlockStrikes: 1,
});
```

This setup makes Cloudflare / DataDome challenges back off progressively before new attempts, instead of immediately retrying and increasing the block risk.

### Why Curl?

1.  **Different Stack:** `curl` uses different TLS libraries than Node.js, often bypassing simple fingerprint checks.
2.  **Impersonation:** When paired with **`curl-impersonate`**, it sends TLS handshakes that are *bit-for-bit identical* to real browsers.

### Manual Transport Selection

You can force a specific transport when needed:

```typescript
// Spider with forced curl transport
const spider = new Spider({
  transport: 'curl', // Always use curl-impersonate
  maxPages: 50,
});

// Direct client usage
await client.get('https://protected-site.com', {
  useCurl: true
});
```

### CLI Usage

```bash
# Use curl-impersonate via CLI
rek +curl https://protected-site.com

# Scrape with curl
rek +curl scrape https://example.com
```

### MCP Tools

The MCP scraping tools support the `transport` parameter:

```json
{
  "tool": "rek_scrape",
  "arguments": {
    "url": "https://protected-site.com",
    "transport": "curl"
  }
}
```

Available on:
- `rek_scrape` - Web scraping tool
- `rek_seo_spider` - SEO crawler

## Setup `curl-impersonate`

For the best results, Recker can download and manage `curl-impersonate` automatically.

```bash
# Using npx (no global install needed)
npx recker setup

# Or if installed globally
rek setup
```

### What happens during setup

```
$ npx recker setup

✓ Detecting platform... linux-x64
✓ Downloading curl-impersonate v0.6.1 from GitHub...
✓ Extracting to ~/.recker/bin/
✓ Setting executable permissions...
✓ Verifying installation...

curl-impersonate-chrome installed successfully!
Location: /home/user/.recker/bin/curl-impersonate-chrome

You can now scrape protected sites with:
  rek +curl https://protected-site.com
```

### Installation details

| Item | Value |
|:-----|:------|
| **Source** | [lwthiker/curl-impersonate](https://github.com/lwthiker/curl-impersonate) |
| **Version** | v0.6.1 |
| **Location** | `~/.recker/bin/curl-impersonate-chrome` |
| **Size** | ~15MB |
| **Platforms** | Linux (x64), macOS (x64, arm64) |

### No setup? No problem

The Spider works fine without curl-impersonate:

```typescript
const spider = new Spider({ maxPages: 50 });
await spider.crawl('https://example.com');
// Uses Undici (fast)
// If blocked → request fails, spider continues to next URL
```

With curl-impersonate installed:

```typescript
const spider = new Spider({ maxPages: 50 });
await spider.crawl('https://protected-site.com');
// Uses Undici (fast)
// If blocked → automatically retries with curl-impersonate
// Domain cached → future requests use curl directly
```

### When to use what?

| Transport | Engine | Pros | Cons | Best For |
|:---|:---|:---|:---|:---|
| **auto** (Default) | Undici + Curl Fallback | Fast + Resilient, Automatic Handling | Slight overhead on blocks | **General Crawling** |
| **undici** | Node.js / OpenSSL | Fastest, Keep-Alive, Streaming | Identifiable TLS Fingerprint | APIs, Internal Services |
| **curl** | System Binary | Bypasses JA3/Fingerprinting | Slower (process spawning) | **Protected Sites**, HLS |

## Protected Domains

Recker pre-identifies domains known to use aggressive bot protection:

- `linkedin.com`, `twitter.com`, `x.com`
- `instagram.com`, `facebook.com`
- `amazon.*`, `google.*`
- `netflix.com`, `spotify.com`
- Government domains (`.gov`, `.mil`)

When using `auto` transport, these domains automatically start with curl to avoid wasting a request.
