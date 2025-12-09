# AI Chat

Chat with Large Language Models directly from your terminal. Recker integrates with OpenAI and Anthropic APIs for a seamless conversational experience.

## Quick Start

### From the Shell

```bash
# Start the shell
rek shell

# Set your API key (if not in environment)
› set OPENAI_API_KEY=sk-your-openai-key

# Start chatting
› chat openai
```

### Provider Selection

```bash
# OpenAI (default)
› chat openai

# OpenAI with specific model
› chat openai gpt-5.1

# Anthropic Claude
› set ANTHROPIC_API_KEY=sk-ant-your-key
› chat anthropic

# Google Gemini
› set GOOGLE_API_KEY=AIza...
› chat google gemini-1.5-flash

# Local Models (Ollama)
# Requires Ollama running on localhost:11434
› chat ollama llama3
```

## The Chat Interface

Once you start a chat, the shell transforms into a conversation mode:

```
🤖 Rek AI Chat (openai)
Type your message. Ctrl+C to exit.

You › Hello! Can you help me with an API design?
AI  › Of course! I'd be happy to help with API design. What kind of
      API are you building? Is it a REST API, GraphQL, or something
      else? What domain or problem is it solving?

You › I'm building a REST API for a task management app
AI  › Great choice! For a task management API, here are some key
      endpoints you might want to consider:

      **Tasks**
      - `GET /tasks` - List all tasks
      - `POST /tasks` - Create a new task
      - `GET /tasks/:id` - Get a specific task
      - `PUT /tasks/:id` - Update a task
      - `DELETE /tasks/:id` - Delete a task
      ...
```

## Commands Within Chat

| Command | Action |
|---------|--------|
| `/clear` | Clear conversation history (start fresh) |
| `/exit` | Exit chat mode, return to shell |
| `Ctrl+C` | Exit chat mode |
| `Esc` | Exit chat mode |

## API Keys

### Environment Variables

The recommended way to set API keys:

```bash
# Add to your shell profile (.bashrc, .zshrc, etc.)
export OPENAI_API_KEY=sk-your-openai-key
export ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
export GOOGLE_API_KEY=AIza-your-google-key
```

### Session Variables

Set keys within the shell session:

```bash
› set OPENAI_API_KEY=sk-your-key
› chat openai

# Or for Anthropic
› set ANTHROPIC_API_KEY=sk-ant-your-key
› chat anthropic
```

## Models

### OpenAI Models

| Model | Description |
|-------|-------------|
| `gpt-5.1` | Latest GPT model (default) |
| `gpt-5.1-mini` | Fast and cost-effective |
| `gpt-5` | Previous generation |

```bash
› chat openai gpt-5.1-mini
```

### Anthropic Models

| Model | Description |
|-------|-------------|
| `claude-sonnet-4-5` | Balanced performance (default) |
| `claude-opus-4-5` | Most capable |
| `claude-haiku-4-5` | Fastest |

```bash
› chat anthropic claude-opus-4-5
```

## Features

### Streaming Responses

Responses stream in real-time, token by token. You see the AI "typing" as it generates the response.

### Conversation Context

The chat maintains full conversation history within the session:

```
You › What's a good programming language for beginners?
AI  › Python is often recommended for beginners because...

You › Why Python specifically?
AI  › Building on what I mentioned, Python is great because...
     (AI remembers the context of the previous question)
```

### Context Reset

Clear the conversation to start fresh:

```
You › /clear
Context cleared.

You › (New conversation starts here)
```

## Use Cases

### Code Generation

```
You › Write a TypeScript function that validates an email address
AI  › Here's a TypeScript function to validate email addresses:

      function isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
      }

      // Usage:
      console.log(isValidEmail("test@example.com")); // true
      console.log(isValidEmail("invalid-email")); // false
```

### API Design Help

```
You › I need to design an API for a blog platform. What endpoints
      should I have?
AI  › For a blog platform, here's a suggested API structure:

      **Posts**
      - `GET /posts` - List posts (with pagination)
      - `POST /posts` - Create new post
      - `GET /posts/:slug` - Get post by slug
      ...
```

### Debugging Help

```
You › I'm getting a 401 error when calling my API. The request works
      in Postman but fails in my code.
AI  › A 401 error indicates authentication issues. Common causes:

      1. Missing Authorization header
      2. Malformed token (missing "Bearer " prefix)
      3. Expired token
      ...
```

### Documentation Writing

```
You › Help me write OpenAPI documentation for this endpoint:
      POST /users that creates a user with name, email, and password
AI  › Here's the OpenAPI 3.0 specification:

      /users:
        post:
          summary: Create a new user
          requestBody:
            required: true
            content:
              application/json:
                schema:
                  type: object
                  required:
                    - name
                    - email
                    - password
                  ...
```

## Tips

### System Prompt

The AI is configured as "Recker AI, a helpful and concise assistant in a terminal environment." It's optimized for:
- Technical discussions
- Code generation
- API design
- Debugging help
- Concise responses suitable for terminal display

### Long Responses

For long code blocks or documentation, consider:
- Asking for specific parts first
- Requesting summaries before details
- Breaking down complex requests

### Combining with Shell

You can use AI chat to help design requests, then execute them:

```
You › What's the curl equivalent of this request?
      POST /api/users with JSON { "name": "John", "email": "j@example.com" }
AI  › The curl command would be:
      curl -X POST https://your-api.com/api/users \
        -H "Content-Type: application/json" \
        -d '{"name":"John","email":"j@example.com"}'

      Or with rek:
      rek post your-api.com/api/users name="John" email="j@example.com"

# Exit chat and run it
You › /exit
› post /api/users name="John" email="j@example.com"
```

## Error Handling

### Missing API Key

```
Warning: No API Key found for openai.
Please set it via environment variable OPENAI_API_KEY or passing it to the command.
Example: set OPENAI_API_KEY=sk-... inside the shell.
```

### Rate Limiting

If you hit rate limits, you'll see an error message. Wait a moment and try again, or use a different model.

### Network Errors

Network issues are displayed with helpful messages:

```
Error: Connection failed. Please check your internet connection.
```

## Next Steps

- **[Load Testing](05-load-testing.md)** - Benchmark your APIs
- **[Protocols](06-protocols.md)** - WebSocket and UDP
- **[Presets](07-presets.md)** - Quick access to popular APIs
