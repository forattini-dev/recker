# Playground

Test Recker right here in your browser! See how CLI arguments are parsed, what gets sent to the server, and analyze the response.

<div id="playground-root"></div>

## Quick Examples

Try these commands in the playground:

```bash
# Simple GET request
get https://httpbin.org/json

# POST with JSON data
post https://httpbin.org/post name="John Doe" age:=30 active:=true

# With custom headers
get https://httpbin.org/headers Authorization:"Bearer token123" X-Custom:"my-value"

# With browser preset
+chrome get https://httpbin.org/user-agent

# Multiple presets
+mobile +json get https://api.example.com/data
```

## Available Presets

| Preset | Description |
|--------|-------------|
| `+chrome` | Chrome browser User-Agent |
| `+mobile` | Mobile (iPhone) User-Agent |
| `+bot` | Googlebot User-Agent |
| `+curl` | cURL User-Agent |
| `+retry` | Enable retry with exponential backoff |
| `+json` | Accept: application/json |
| `+xml` | Accept: application/xml |
