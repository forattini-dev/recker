# Installation

## Requirements

- **Node.js** (Active LTS or Current)
- Works with: npm, pnpm, yarn, bun

## Try Without Installing

```bash
# Always use @latest to get the newest version
npx recker@latest shell
npx recker@latest httpbin.org/json
```

## Package Managers

<tabs>

<tab title="pnpm">

```bash
pnpm add recker
```

</tab>

<tab title="npm">

```bash
npm install recker
```

</tab>

<tab title="yarn">

```bash
yarn add recker
```

</tab>

<tab title="bun">

```bash
bun add recker
```

</tab>

</tabs>

## Verify Installation

```typescript
import { createClient } from 'recker';

const client = createClient();
console.log('Recker installed successfully!');
```

## Browser Usage

Recker also works in the browser with ~70% of features. See [Browser Guide](/browser/01-quickstart.md) for details.

### With Bundlers (Vite, Webpack, etc.)

```typescript
import { recker } from 'recker/browser';

const data = await recker.get('https://api.example.com/users').json();
```

### Via CDN

```html
<!-- UMD (recommended) -->
<script src="https://unpkg.com/recker/dist/browser/index.umd.min.js"></script>
<script>
  const { recker } = Recker;
  recker.get('https://api.example.com/users').json().then(console.log);
</script>

<!-- ESM -->
<script type="module">
  import { recker } from 'https://esm.sh/recker';
  const data = await recker.get('https://api.example.com/users').json();
</script>
```

### Browser Limitations

Some features are **not available** in browser environments:

| Feature | Reason |
|---------|--------|
| DNS/WHOIS | Requires raw socket access |
| FTP/SFTP/Telnet | Requires raw socket access |
| AI Layer | Node.js dependencies |
| HAR Recording | File system access |
| mTLS Auth | Client certificates |
| Redis Cache | Server-side only |
| CLI | Terminal access |

See [Node vs Browser Differences](/browser/02-differences.md) for the complete comparison.

## What's Included

When you install Recker, you get:

- ✅ **Core HTTP Client** - All HTTP methods
- ✅ **Built-in Plugins** - Retry, cache, dedup, compression
- ✅ **TypeScript Types** - Full type definitions
- ✅ **Lightweight** - Minimal dependencies
- ✅ **Browser Build** - Works in modern browsers

## TypeScript Support

Recker is written in TypeScript and provides full type safety out of the box.

```typescript
import { createClient, type ReckerResponse } from 'recker';

interface User {
  id: number;
  name: string;
}

const client = createClient({ baseUrl: 'https://api.example.com' });
const users: User[] = await client.get('/users').json<User[]>();
```

## Next Steps

- [Quick Start →](/getting-started/quickstart.md)
- [HTTP Fundamentals →](/http/02-fundamentals.md)
