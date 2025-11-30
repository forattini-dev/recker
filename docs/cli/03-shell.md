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
