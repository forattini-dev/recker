/**
 * API Commands (Unified)
 *
 * API protocol tools migrated to the unified command system.
 * These handlers work in both CLI and TUI modes.
 */

import type { RekCommandDefinition, RekHandler } from '../handler-types.js'
import {
  withHandler,
  createEnhancedOutput,
  getString,
  colors,
} from '../output.js'

// =============================================================================
// GraphQL Handler
// =============================================================================

export const graphqlHandler: RekHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let url = getString(ctx.result.positional.url)
    const query = getString(ctx.result.positional.query)

    if (!url || !query) {
      out.error('Usage: graphql <url> <query> [variables]')
      return
    }

    if (!url.startsWith('http')) {
      url = `https://${url}`
    }

    // Parse variables from options
    const variables: Record<string, unknown> = {}
    const opts = ctx.result.options as Record<string, unknown>
    for (const [key, val] of Object.entries(opts)) {
      if (key !== 'help') {
        try {
          variables[key] = JSON.parse(String(val))
        } catch {
          variables[key] = val
        }
      }
    }

    out.log(colors.gray(`Executing GraphQL query to ${url}...`))

    const { createClient } = await import('../../core/client.js')
    const client = extCtx?.client || createClient()

    const response = await client.post(url, {
      body: JSON.stringify({ query, variables: Object.keys(variables).length ? variables : undefined }),
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await response.json() as { errors?: Array<{ message: string }>; data?: unknown }

    if (result.errors) {
      out.error(`GraphQL errors:\n${result.errors.map(e => e.message).join('\n')}`)
    }

    if (result.data) {
      if (extCtx) {
        out.response(result.data, { responseType: 'graphql' })
      } else {
        out.title('GraphQL Response', '📊')
        out.json(result.data)
      }
    }
  }
)

// =============================================================================
// HTTP Handler (generic)
// =============================================================================

export const httpHandler: RekHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    const method = (getString(ctx.result.positional.method) || 'GET').toUpperCase()
    let url = getString(ctx.result.positional.url)

    if (!url) {
      out.error('Usage: http <method> <url>')
      return
    }

    // Resolve URL with base
    const base = extCtx?.baseUrl?.()
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (base) {
        url = base.replace(/\/$/, '') + (url.startsWith('/') ? '' : '/') + url
      } else {
        url = `https://${url}`
      }
    }

    // Parse headers and data from raw args (HTTPie style)
    const headers: Record<string, string> = {}
    const data: Record<string, unknown> = {}

    // Get raw args after method and url
    const rawArgs = ctx.rawArgs.slice(2)
    for (const arg of rawArgs) {
      // Header: Key:Value (but not :=)
      if (arg.includes(':') && !arg.includes('=') && !arg.startsWith('-')) {
        const [key, ...rest] = arg.split(':')
        headers[key.trim()] = rest.join(':').trim()
        continue
      }

      // Data: key=value or key:=jsonValue
      if (arg.includes('=') && !arg.startsWith('-')) {
        const isTyped = arg.includes(':=')
        const separator = isTyped ? ':=' : '='
        const [key, ...rest] = arg.split(separator)
        const value = rest.join(separator)

        if (isTyped) {
          try {
            data[key] = JSON.parse(value)
          } catch {
            data[key] = value
          }
        } else {
          data[key] = value
        }
      }
    }

    const startTime = Date.now()

    const { createClient } = await import('../../core/client.js')
    const client = extCtx?.client || createClient()

    const requestOptions: Record<string, unknown> = { method }

    if (Object.keys(headers).length > 0) {
      requestOptions.headers = headers
    }

    if (Object.keys(data).length > 0 && method !== 'GET' && method !== 'HEAD') {
      requestOptions.body = JSON.stringify(data)
      requestOptions.headers = {
        ...(requestOptions.headers as Record<string, string>),
        'Content-Type': 'application/json',
      }
    }

    const response = await client.request(url, requestOptions)
    const elapsed = Date.now() - startTime

    // Parse response body
    let body: unknown
    const contentType = response.headers.get?.('content-type') || ''
    if (contentType.includes('json')) {
      body = await response.json()
    } else {
      body = await response.text()
    }

    // Extract headers for display
    const responseHeaders: Record<string, string> = {}
    response.headers.forEach?.((value: string, key: string) => {
      responseHeaders[key] = value
    })

    // Track in Domain Intelligence
    try {
      const urlObj = new URL(url)
      extCtx?.track.request(urlObj.hostname, {
        method,
        path: urlObj.pathname,
        status: response.status,
        time: elapsed,
      })
    } catch { /* ignore */ }

    if (extCtx) {
      out.response(body, {
        responseType: 'http',
        status: response.status,
        statusText: response.statusText,
        time: elapsed,
        headers: responseHeaders,
        size: typeof body === 'string' ? body.length : JSON.stringify(body).length,
      })
    } else {
      out.title(`${method} ${url}`)
      out.keyValue({
        Status: `${response.status} ${response.statusText}`,
        Time: `${elapsed}ms`,
      })
      out.blank()
      if (typeof body === 'object') {
        out.json(body)
      } else {
        out.log(body as string)
      }
    }
  }
)

// =============================================================================
// HAR Handler (stub for now)
// =============================================================================

export const harHandler: RekHandler = async (ctx) => {
  const out = createEnhancedOutput(ctx)
  out.title('HAR (HTTP Archive) Recording', '📼')
  out.blank()
  out.subtitle('Commands:')
  out.list([
    'har record <file>   Start recording to HAR file',
    'har play <file>     Replay requests from HAR file',
    'har info <file>     Show HAR file info',
  ])
  out.blank()
  out.info('Full HAR recording available in \'rek shell:legacy\'')
}

// =============================================================================
// Command Definitions
// =============================================================================

export const apiCommands: RekCommandDefinition = {
  description: 'API protocol tools',
  category: 'api',
  tuiEnabled: true,
  commands: {
    graphql: {
      description: 'GraphQL client',
      aliases: ['gql'],
      positional: [
        { name: 'url', required: true, description: 'GraphQL endpoint URL' },
        { name: 'query', required: true, description: 'GraphQL query' }
      ],
      examples: [
        { cmd: 'rek graphql https://api.github.com/graphql "{ viewer { login } }"', desc: 'Simple query' },
        { cmd: 'rek graphql https://api.example.com/graphql "query($id: ID!) { user(id: $id) { name } }" id=123', desc: 'With variables' }
      ],
      handler: graphqlHandler
    },
    http: {
      description: 'Generic HTTP request',
      positional: [
        { name: 'method', required: true, description: 'HTTP method (GET, POST, PUT, DELETE, etc.)' },
        { name: 'url', required: true, description: 'URL to request' }
      ],
      examples: [
        { cmd: 'rek http GET https://api.example.com/users', desc: 'GET request' },
        { cmd: 'rek http POST https://api.example.com/users name=John age:=30', desc: 'POST with JSON data' },
        { cmd: 'rek http GET api.example.com/secure Authorization:"Bearer token"', desc: 'With header' }
      ],
      handler: httpHandler
    },
    har: {
      description: 'HAR recording and playback',
      commands: {
        record: {
          description: 'Start recording to HAR file',
          positional: [{ name: 'file', required: true, description: 'Output HAR file' }],
          handler: harHandler
        },
        play: {
          description: 'Replay requests from HAR file',
          positional: [{ name: 'file', required: true, description: 'HAR file to replay' }],
          handler: harHandler
        },
        info: {
          description: 'Show HAR file info',
          positional: [{ name: 'file', required: true, description: 'HAR file to inspect' }],
          handler: harHandler
        }
      }
    }
  }
}

// =============================================================================
// HTTP Method Handlers (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)
// =============================================================================

/**
 * Create a handler for a specific HTTP method.
 * Used by TUI shell for top-level commands like "get", "post", etc.
 */
function createMethodHandler(method: string): RekHandler {
  return withHandler(
    { loading: true },
    async (ctx, out, extCtx) => {
      // First positional arg is the URL
      let url = getString(ctx.result.positional.url)

      if (!url) {
        out.error(`Usage: ${method.toLowerCase()} <url> [headers...] [data...]`)
        return
      }

      // Resolve URL with base
      const base = extCtx?.baseUrl?.()
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (base) {
          url = base.replace(/\/$/, '') + (url.startsWith('/') ? '' : '/') + url
        } else {
          url = `https://${url}`
        }
      }

      // Parse headers and data from raw args (skip method name and url)
      const headers: Record<string, string> = {}
      const data: Record<string, unknown> = {}

      // Raw args: the first one is the URL, rest are headers/data
      const args = ctx.rawArgs.slice(1) // Skip command name (get/post/etc)
      for (const arg of args) {
        if (arg === url) continue // Skip the URL itself

        // Header: Key:Value (but not :=)
        if (arg.includes(':') && !arg.includes('=') && !arg.startsWith('-')) {
          const [key, ...rest] = arg.split(':')
          headers[key.trim()] = rest.join(':').trim()
          continue
        }

        // Data: key=value or key:=jsonValue
        if (arg.includes('=') && !arg.startsWith('-')) {
          const isTyped = arg.includes(':=')
          const separator = isTyped ? ':=' : '='
          const [key, ...rest] = arg.split(separator)
          const value = rest.join(separator)

          if (isTyped) {
            try {
              data[key] = JSON.parse(value)
            } catch {
              data[key] = value
            }
          } else {
            data[key] = value
          }
        }
      }

      const startTime = Date.now()

      const { createClient } = await import('../../core/client.js')
      const client = extCtx?.client || createClient()

      const requestOptions: Record<string, unknown> = { method }

      if (Object.keys(headers).length > 0) {
        requestOptions.headers = headers
      }

      if (Object.keys(data).length > 0 && method !== 'GET' && method !== 'HEAD') {
        requestOptions.body = JSON.stringify(data)
        requestOptions.headers = {
          ...(requestOptions.headers as Record<string, string>),
          'Content-Type': 'application/json',
        }
      }

      const response = await client.request(url, requestOptions)
      const elapsed = Date.now() - startTime

      // Parse response body
      let body: unknown
      const contentType = response.headers.get?.('content-type') || ''
      if (contentType.includes('json')) {
        body = await response.json()
      } else {
        body = await response.text()
      }

      // Store last response
      extCtx?.setResponse?.(body)

      // Extract headers for display
      const responseHeaders: Record<string, string> = {}
      response.headers.forEach?.((value: string, key: string) => {
        responseHeaders[key] = value
      })

      // Track in Domain Intelligence
      try {
        const urlObj = new URL(url)
        extCtx?.track.request(urlObj.hostname, {
          method,
          path: urlObj.pathname,
          status: response.status,
          time: elapsed,
        })
      } catch { /* ignore */ }

      if (extCtx) {
        out.response(body, {
          responseType: 'http',
          status: response.status,
          statusText: response.statusText,
          time: elapsed,
          headers: responseHeaders,
          size: typeof body === 'string' ? body.length : JSON.stringify(body).length,
        })
      } else {
        out.title(`${method} ${url}`)
        out.keyValue({
          Status: `${response.status} ${response.statusText}`,
          Time: `${elapsed}ms`,
        })
        out.blank()
        if (typeof body === 'object') {
          out.json(body)
        } else {
          out.log(body as string)
        }
      }
    }
  )
}

// Individual HTTP method handlers
export const getHandler = createMethodHandler('GET')
export const postHandler = createMethodHandler('POST')
export const putHandler = createMethodHandler('PUT')
export const deleteHandler = createMethodHandler('DELETE')
export const patchHandler = createMethodHandler('PATCH')
export const headHandler = createMethodHandler('HEAD')
export const optionsHandler = createMethodHandler('OPTIONS')

// Export handlers for top-level aliases
export { graphqlHandler as graphql, httpHandler as http, harHandler as har }
