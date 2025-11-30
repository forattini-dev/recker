# Presets

Presets are pre-configured shortcuts for popular APIs. They set the base URL, required headers, and sensible defaults so you can start making requests immediately.

## Using Presets

Prefix any request with `@presetname`:

```bash
# GitHub API
rek @github/user

# OpenAI API
rek @openai/v1/models

# With path and data
rek @github/repos/anthropics/claude-code/issues state="open"
```

## Available Presets

### AI Platforms

#### OpenAI

```bash
# Requires: OPENAI_API_KEY environment variable

# List models
rek @openai/v1/models

# Chat completion
rek @openai/v1/chat/completions \
  model="gpt-5.1" \
  messages:='[{"role":"user","content":"Hello!"}]'

# Embeddings
rek @openai/v1/embeddings \
  model="text-embedding-3-large" \
  input="Hello world"
```

#### Anthropic

```bash
# Requires: ANTHROPIC_API_KEY environment variable

# Send message
rek @anthropic/v1/messages \
  model="claude-sonnet-4-5" \
  max_tokens:=1024 \
  messages:='[{"role":"user","content":"Hello!"}]'
```

### Development Platforms

#### GitHub

```bash
# Requires: GITHUB_TOKEN environment variable

# Get authenticated user
rek @github/user

# List user repos
rek @github/user/repos

# Get specific repo
rek @github/repos/owner/repo

# List issues
rek @github/repos/owner/repo/issues state="open"

# Create issue
rek @github/repos/owner/repo/issues \
  title="Bug report" \
  body="Description here"
```

#### GitLab

```bash
# Requires: GITLAB_TOKEN environment variable

# List projects
rek @gitlab/projects

# Get project
rek @gitlab/projects/12345

# List merge requests
rek @gitlab/projects/12345/merge_requests state="opened"
```

### Cloud Providers

#### AWS (Signature V4)

```bash
# Requires: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY

# Note: AWS preset handles Signature V4 authentication
rek @aws/ec2 Action="DescribeInstances"
```

#### Cloudflare

```bash
# Requires: CLOUDFLARE_API_TOKEN

# List zones
rek @cloudflare/zones

# Get zone details
rek @cloudflare/zones/zone-id

# Purge cache
rek @cloudflare/zones/zone-id/purge_cache \
  purge_everything:=true
```

### Communication

#### Slack

```bash
# Requires: SLACK_TOKEN

# Post message
rek @slack/chat.postMessage \
  channel="C1234567890" \
  text="Hello from Rek!"

# List channels
rek @slack/conversations.list
```

#### Discord

```bash
# Requires: DISCORD_TOKEN

# Send message
rek @discord/channels/channel-id/messages \
  content="Hello from Rek!"
```

### Databases & Storage

#### Supabase

```bash
# Requires: SUPABASE_URL, SUPABASE_KEY

# Query table
rek @supabase/rest/v1/users select="*"

# Insert row
rek @supabase/rest/v1/users \
  name="John" \
  email="john@example.com"
```

#### Firebase

```bash
# Requires: FIREBASE_TOKEN

# Get data
rek @firebase/users.json

# Set data
rek @firebase/users/123.json name="John"
```

### Utilities

#### JSONPlaceholder (Testing)

```bash
# No auth required - great for testing!

# Get posts
rek @jsonplaceholder/posts

# Get single post
rek @jsonplaceholder/posts/1

# Create post
rek @jsonplaceholder/posts \
  title="Test" \
  body="Content" \
  userId:=1
```

#### HTTPBin (Testing)

```bash
# No auth required

# Test GET
rek @httpbin/get

# Test POST
rek @httpbin/post name="test"

# Test headers
rek @httpbin/headers X-Custom:"value"
```

## Environment Variables

Each preset looks for specific environment variables for authentication:

| Preset | Environment Variable |
|--------|---------------------|
| `@openai` | `OPENAI_API_KEY` |
| `@anthropic` | `ANTHROPIC_API_KEY` |
| `@github` | `GITHUB_TOKEN` |
| `@gitlab` | `GITLAB_TOKEN` |
| `@slack` | `SLACK_TOKEN` |
| `@discord` | `DISCORD_TOKEN` |
| `@cloudflare` | `CLOUDFLARE_API_TOKEN` |

### Setting Environment Variables

```bash
# In your shell profile (.bashrc, .zshrc)
export GITHUB_TOKEN=ghp_your_token_here
export OPENAI_API_KEY=sk-your-key-here

# Or inline
GITHUB_TOKEN=ghp_xxx rek @github/user
```

## Preset Syntax

The preset syntax is:

```
rek @preset/path [headers...] [data...]
```

### Examples

```bash
# Just the preset (hits base URL)
rek @jsonplaceholder/posts

# With path
rek @github/repos/facebook/react

# With query params (as path)
rek @github/search/repositories?q=nodejs

# With headers
rek @github/user Accept:"application/vnd.github.v3+json"

# With data (POST)
rek @github/repos/owner/repo/issues title="New issue"
```

## Combining with Verbose Mode

See the full request details:

```bash
rek -v @github/user

# Output:
# --- Request ---
# GET https://api.github.com/user
# Authorization: token ghp_xxx
# Accept: application/vnd.github.v3+json
# User-Agent: Recker/1.0
# ...
```

## Creating Custom Presets

For the programmatic API, you can create custom presets:

```typescript
import { createClient } from 'recker';
import { github } from 'recker/presets';

// Use built-in preset
const client = createClient(github({
  token: process.env.GITHUB_TOKEN
}));

// Or create custom
const myApi = createClient({
  baseUrl: 'https://api.mycompany.com/v1',
  headers: {
    'X-API-Key': process.env.MY_API_KEY,
    'Accept': 'application/json'
  }
});
```

See [Reference: Presets](/reference/04-presets.md) for programmatic usage.

## Tips

### Quick API Exploration

```bash
# Explore GitHub
rek @github/user
rek @github/user/repos
rek @github/repos/owner/repo
rek @github/repos/owner/repo/issues

# Explore OpenAI
rek @openai/v1/models
rek @openai/v1/models/gpt-5.1
```

### Testing Without Auth

Use JSONPlaceholder or HTTPBin for testing without any setup:

```bash
# Test your rek syntax
rek @jsonplaceholder/posts/1
rek @httpbin/post name="test" count:=42
```

### Debugging Auth Issues

If a preset isn't working, check with verbose mode:

```bash
rek -v @github/user
# Check if Authorization header is present
```

## Available in Shell

Presets work in the shell too:

```bash
› @github/user
200 OK (234ms)
{
  "login": "your-username",
  ...
}

› @github/repos/anthropics/claude-code/issues state="open"
```

## Next Steps

- **[Quick Start](02-quick-start.md)** - Review basic syntax
- **[Interactive Shell](03-shell.md)** - Use presets in REPL
- **[Reference: Presets](/reference/04-presets.md)** - Full programmatic API
