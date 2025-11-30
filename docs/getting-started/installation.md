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

## What's Included

When you install Recker, you get:

- ✅ **Core HTTP Client** - All HTTP methods
- ✅ **Built-in Plugins** - Retry, cache, dedup, compression
- ✅ **TypeScript Types** - Full type definitions
- ✅ **Lightweight** - Minimal dependencies

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
