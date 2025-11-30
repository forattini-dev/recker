# Interactive Shell

The Rek Shell is a REPL (Read-Eval-Print-Loop) environment for API development. It maintains session state, supports variables, and provides a conversational interface to your APIs.

## Starting the Shell

```bash
# If installed globally
rek shell

# Without installation (always use @latest)
npx recker@latest shell
```

Alternative aliases:
```bash
rek interactive
rek repl
```

You'll see:
```
Rek Console
Chat with your APIs. Type "help" for magic.
--------------------------------------------

rek ›
```

## Session Management

### Setting Base URL

Stop typing the full domain for every request:

```bash
› url https://api.mycompany.com/v1
Base URL set to: https://api.mycompany.com/v1

› get /users
# Requests: https://api.mycompany.com/v1/users

› get /products
# Requests: https://api.mycompany.com/v1/products

› post /orders productId:=42
# Requests: https://api.mycompany.com/v1/orders
```

### Changing Base URL

```bash
› url api.github.com
Base URL set to: https://api.github.com

› get /user
# Now requests GitHub API
```

## Variables

### Manual Variables

Set and use variables throughout your session:

```bash
# Set a variable
› set userId=42
Variable $userId set.

# Use in requests
› get /users/$userId
# → GET /users/42

# Use in data
› post /orders userId:=$userId productId:=100
# → POST with { "userId": "42", "productId": 100 }
```

### Response Variables

Access the last response using `$res` or `$response`:

```bash
# 1. Make a login request
› post /auth/login username="admin" password="secret123"
200 OK (145ms)
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "name": "Admin User"
  }
}

# 2. Use the token in the next request
› get /profile Authorization:"Bearer $res.token"
# Automatically substitutes the token value

# 3. Access nested properties
› get /users/$res.user.id/settings
# → GET /users/1/settings
```

### Variable Paths

Navigate deeply nested responses:

```bash
# Given response:
# {
#   "data": {
#     "users": [
#       { "id": 1, "name": "Alice" },
#       { "id": 2, "name": "Bob" }
#     ]
#   }
# }

› set firstUserId=$res.data.users.0.id
› get /users/$firstUserId
```

### Viewing Variables

```bash
› vars
{
  "userId": "42",
  "token": "eyJhbG..."
}
```

## Commands

### HTTP Methods

All standard HTTP methods are supported:

```bash
› get /users
› post /users name="John"
› put /users/1 name="Updated"
› patch /users/1 status="active"
› delete /users/1
› head /users
› options /api
```

### Utility Commands

| Command | Description |
|---------|-------------|
| `help` | Show all available commands |
| `clear` | Clear the terminal screen |
| `vars` | Display all session variables |
| `exit` or `quit` | Exit the shell |

## Interactive Tools

### AI Chat

Start a chat session with an LLM:

```bash
# Set API key (if not in environment)
› set OPENAI_API_KEY=sk-your-key

# Start chatting with OpenAI
› chat openai gpt-5.1

# Or with Anthropic
› set ANTHROPIC_API_KEY=sk-ant-your-key
› chat anthropic claude-sonnet-4-5
```

See [AI Chat](04-ai-chat.md) for details.

### Load Testing

Run load tests from within the shell:

```bash
› load /heavy-endpoint users=100 duration=60
```

See [Load Testing](05-load-testing.md) for details.

### WebSocket

Connect to WebSocket servers:

```bash
› ws wss://echo.websocket.org
```

See [Protocols](06-protocols.md) for details.

### Web Scraping

Interactively scrape and query HTML documents:

```bash
# Load a page
› scrap https://news.ycombinator.com
✔ Loaded (234ms)
  Title: Hacker News
  Elements: 1247
  Size: 45.2kb

# Query with CSS selectors
› $ .titleline
Found 30 element(s)
  1. Show HN: I built something cool
  2. Why Rust is taking over systems programming
  ...

# Extract text content
› $text .titleline
1. Show HN: I built something cool
2. Why Rust is taking over systems programming
...
  30 text item(s) extracted

# Get attribute values
› $attr href .titleline a
1. https://example.com/article1
2. https://example.com/article2
...
  30 attribute(s) extracted

# List all links
› $links
1. new → newest
2. comments → newcomments
3. Show HN → show
...
  150 link(s) found

# List all images
› $images
1. (no alt) → logo.png
2. upvote → gfx/up.gif
...
  25 image(s) found

# Extract tables as data
› $table table
Table 1:
  Headers: Rank | Name | Score
  Rows: 30
  1. 1 | Alice | 950
  2. 2 | Bob | 890
  ...
```

#### Scraping Commands Reference

| Command | Description |
|---------|-------------|
| `scrap <url>` | Fetch and parse HTML document |
| `$ <selector>` | Count and preview elements matching selector |
| `$text <selector>` | Extract text content from elements |
| `$attr <name> <selector>` | Extract attribute values |
| `$html <selector>` | Get inner HTML of first match |
| `$links [selector]` | List all links (default: `a[href]`) |
| `$images [selector]` | List all images (default: `img[src]`) |
| `$table <selector>` | Extract table data (headers + rows) |

#### Scraping Workflow Example

```bash
# 1. Load a product listing page
› scrap https://store.example.com/products

# 2. Find product cards
› $ .product-card
Found 24 element(s)

# 3. Extract product names
› $text .product-card .name
1. Wireless Headphones
2. USB-C Cable
...

# 4. Get product URLs
› $attr href .product-card a
1. /products/wireless-headphones
2. /products/usb-c-cable
...

# 5. Extract pricing table
› $table .pricing-table
Table 1:
  Headers: Plan | Price | Features
  Rows: 3
  1. Basic | $9/mo | 10 users
  2. Pro | $29/mo | 100 users
  3. Enterprise | Custom | Unlimited

# 6. Load a different page
› scrap https://other-site.com/data
```

> **Note:** Web scraping requires the `cheerio` package. Install with: `pnpm add cheerio`

## Request Syntax in Shell

The shell uses the same syntax as the CLI:

```bash
# Headers (Key:Value)
› get /secure Authorization:"Bearer token"

# String data (key=value)
› post /users name="John" email="john@example.com"

# Typed data (key:=value)
› post /products price:=99.99 inStock:=true

# Combined
› post /orders \
    Authorization:"Bearer token" \
    productId:=42 \
    quantity:=2 \
    notes="Rush order"
```

## Workflow Examples

### Authentication Flow

```bash
# 1. Login
› post /auth/login username="admin" password="secret"
{
  "accessToken": "eyJhbG...",
  "refreshToken": "dGhpcyBpcyBh..."
}

# 2. Store token as variable for convenience
› set token=$res.accessToken

# 3. Make authenticated requests
› get /me Authorization:"Bearer $token"
› get /dashboard Authorization:"Bearer $token"
› post /data Authorization:"Bearer $token" value:=42
```

### CRUD Operations

```bash
# Set base URL
› url https://api.example.com/v1

# Create
› post /products name="Widget" price:=29.99
{ "id": 123, "name": "Widget", "price": 29.99 }

# Read
› get /products/123
› get /products

# Update
› put /products/123 name="Super Widget" price:=39.99

# Delete
› delete /products/123
```

### API Exploration

```bash
# Set GitHub API
› url https://api.github.com
› set token=ghp_your_token

# Explore endpoints
› get /user Authorization:"token $token"
› get /user/repos Authorization:"token $token"
› get /repos/anthropics/claude-code Authorization:"token $token"
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` | Cancel current operation / Exit |
| `Ctrl+L` | Clear screen |
| `↑` / `↓` | Navigate command history |
| `Tab` | Auto-complete commands |
| `Esc` | Exit interactive modes (AI chat, load test) |

## Tips

### Multi-line Commands

For complex requests, use backslash for line continuation:

```bash
› post /complex-endpoint \
    Header1:"value1" \
    Header2:"value2" \
    field1="string value" \
    field2:=123 \
    field3:=true
```

### Quick Testing

```bash
# Test endpoints quickly
› url localhost:3000
› get /health
› get /api/status
› post /api/echo message="test"
```

### Debugging

```bash
# Full response inspection
› get /debug-endpoint -v

# Check headers
› head /api/endpoint

# Options/CORS check
› options /api/endpoint
```

## Next Steps

- **[AI Chat](04-ai-chat.md)** - Chat with LLMs from the shell
- **[Load Testing](05-load-testing.md)** - Benchmark your APIs
- **[Protocols](06-protocols.md)** - WebSocket and UDP
