# Quick Start

Master the `rek` syntax in minutes. The CLI uses intelligent inference to minimize typing while maximizing expressiveness.

## Basic Requests

### GET Requests

```bash
# HTTPS is automatic
rek httpbin.org/json

# Explicit method
rek GET api.example.com/users

# With path
rek api.example.com/users/123
```

### POST Requests

POST is inferred when you provide data:

```bash
# Automatic POST (data provided)
rek api.example.com/users name="John" email="john@example.com"

# Explicit POST
rek POST api.example.com/users name="John"
```

### Other Methods

```bash
# PUT
rek PUT api.example.com/users/123 name="Updated"

# PATCH
rek PATCH api.example.com/users/123 status="active"

# DELETE
rek DELETE api.example.com/users/123

# HEAD (headers only)
rek HEAD api.example.com/resource

# OPTIONS (CORS preflight)
rek OPTIONS api.example.com/api
```

## Data Syntax

### String Values (=)

Use `=` for string values:

```bash
rek api.com/search query="hello world" filter="recent"
```

Equivalent JSON:
```json
{
  "query": "hello world",
  "filter": "recent"
}
```

### Native Types (:=)

Use `:=` for numbers, booleans, and parsed JSON:

```bash
rek api.com/users age:=25 active:=true premium:=false

# Numbers
count:=100
price:=19.99

# Booleans
enabled:=true
debug:=false

# JSON arrays/objects
tags:='["nodejs","typescript"]'
config:='{"timeout":5000}'
```

Equivalent JSON:
```json
{
  "age": 25,
  "active": true,
  "premium": false
}
```

### Mixed Example

```bash
rek api.com/products \
  name="Widget Pro" \
  price:=99.99 \
  inStock:=true \
  quantity:=50 \
  tags:='["electronics","gadgets"]'
```

## Headers

Headers use the `Key:Value` syntax (note: no `=`):

```bash
# Authorization
rek api.com/secure Authorization:"Bearer eyJhbGc..."

# Multiple headers
rek api.com/data \
  Authorization:"Bearer token" \
  Accept:"application/json" \
  X-Custom-Header:"value"

# Content negotiation
rek api.com/resource Accept:"application/xml"
```

### Common Headers

```bash
# Bearer token
Authorization:"Bearer your-token"

# Basic auth (base64 encoded)
Authorization:"Basic dXNlcjpwYXNz"

# API key
X-API-Key:"your-api-key"

# Custom user agent
User-Agent:"MyApp/1.0"
```

## Combining Everything

```bash
# Full example with method, headers, and data
rek POST api.example.com/orders \
  Authorization:"Bearer token123" \
  Content-Type:"application/json" \
  productId:=42 \
  quantity:=2 \
  express:=true \
  notes="Handle with care"
```

## Verbose Mode

See full request and response details:

```bash
rek -v api.example.com/users

# Output includes:
# --- Request ---
# GET https://api.example.com/users
#
# --- Response Headers ---
# content-type: application/json
# x-request-id: abc123
# ...
#
# --- Response Body ---
# { ... }
```

## JSON Mode

Force JSON content type:

```bash
rek -j api.com/endpoint data="value"

# Equivalent to:
rek api.com/endpoint \
  Content-Type:"application/json" \
  Accept:"application/json" \
  data="value"
```

## Response Output

### JSON Responses

JSON responses are automatically:
- Parsed and validated
- Pretty-printed with indentation
- Syntax-highlighted (colors for keys, strings, numbers)

```bash
rek httpbin.org/json
# {
#   "slideshow": {
#     "author": "Yours Truly",
#     "title": "Sample Slideshow"
#   }
# }
```

### Other Content Types

- **HTML**: Displayed as-is (highlighting coming soon)
- **XML**: Displayed as-is
- **Plain text**: Displayed as-is
- **Binary**: Not displayed (use programmatic API for downloads)

## Error Handling

Non-2xx responses are displayed with colored status:

```bash
rek api.com/not-found
# 404 Not Found (125ms)
# { "error": "Resource not found" }

rek api.com/unauthorized
# 401 Unauthorized (89ms)
# { "message": "Invalid credentials" }
```

## Tips & Tricks

### URL Shortcuts

```bash
# These are equivalent:
rek https://api.example.com/data
rek api.example.com/data

# Local development
rek localhost:3000/api/health
rek 127.0.0.1:8080/status
```

### Escaping Special Characters

```bash
# Quotes in values
rek api.com/search query="say \"hello\""

# Spaces are fine in quoted strings
rek api.com/post message="Hello World!"
```

### Piping Output

```bash
# Save to file
rek api.com/data > response.json

# Pipe to jq for processing
rek api.com/users | jq '.users[0].name'

# Use with other tools
rek api.com/config | yq -y '.settings'
```

## Next Steps

- **[Interactive Shell](03-shell.md)** - Session management and variables
- **[AI Chat](04-ai-chat.md)** - Chat with LLMs
- **[Load Testing](05-load-testing.md)** - Benchmark your APIs
