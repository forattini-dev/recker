# Debugging & Observability

Recker assumes that developers spend a significant amount of time debugging. Therefore, we provide first-class tools to make the invisible visible.

## Visual Logger (The "Matrix" Mode)

Forget `console.log` spam. Recker includes a beautiful, customizable logger plugin that gives you instant visibility into your API traffic directly in the terminal.

### Usage

```typescript
import { logger } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [
    logger({
      showHeaders: true,  // Log request/response headers
      showBody: true,     // Log request bodies
      colors: true        // Enable ANSI colors (default: true)
    })
  ]
});
```

### Output Example

```text
--> GET     https://api.example.com/users/1
    accept: application/json

<-- GET     https://api.example.com/users/1 200 OK 124ms
    content-type: application/json
```

## cURL Export

When a backend developer asks "What request are you sending?", you shouldn't have to describe it. Just give them the cURL. Recker includes a utility to convert any request object into a copy-pasteable cURL command.

### Usage

```typescript
import { toCurl } from 'recker';

// In a hook or middleware
client.beforeRequest((req) => {
  console.log('Debug cURL:');
  console.log(toCurl(req));
});
```

**Output:**
```bash
curl -X POST 'https://api.example.com/data' -H 'content-type: application/json' -d '{"foo":"bar"}'
```

This is incredibly useful for reproducing bugs in a separate environment or sharing context with your team.
