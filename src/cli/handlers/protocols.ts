/**
 * Protocol Commands (Unified)
 *
 * FTP, Telnet, GraphQL, JSON-RPC, SOAP, OData tools migrated to the unified command system.
 * These handlers work in both CLI and TUI modes where applicable.
 */

import type { RekCommandDefinition, RekHandler } from '../handler-types.js'
import {
  withHandler,
  createEnhancedOutput,
  getString,
  getNumber,
  getBoolean,
  colors,
} from '../output.js'

// =============================================================================
// FTP List Handler
// =============================================================================

export const ftpLsHandler: RekHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    const host = getString(ctx.result.positional.host)
    const remotePath = getString(ctx.result.positional.path, '/')
    const user = getString(ctx.result.options.user, 'anonymous')
    const pass = getString(ctx.result.options.pass, 'anonymous@')
    const port = getNumber(ctx.result.options.port, 21)
    const secure = ctx.result.options.implicit ? 'implicit' : getBoolean(ctx.result.options.secure)
    const jsonOutput = getBoolean(ctx.result.options.json)

    if (!host) {
      out.error('Host is required')
      return
    }

    const { createFTP } = await import('../../protocols/ftp.js')
    const client = createFTP({ host, port, user, password: pass, secure })

    if (!extCtx && !jsonOutput) {
      out.log(colors.gray(`Connecting to ${host}...`))
    }

    const connectResult = await client.connect()
    if (!connectResult.success) throw new Error(connectResult.message)

    if (!extCtx && !jsonOutput) {
      out.success('Connected')
    }

    const result = await client.list(remotePath)
    if (!result.success || !result.data) throw new Error(result.message)

    await client.close()

    if (extCtx) {
      out.response({
        host,
        path: remotePath,
        files: result.data.map(f => ({
          name: f.name,
          type: f.type,
          size: f.size,
          permissions: f.permissions,
          modifiedAt: f.rawModifiedAt,
        })),
        count: result.data.length,
      }, { responseType: 'ftp-list' })
      return
    }

    if (jsonOutput) {
      out.json(result.data)
      return
    }

    out.title(`Contents of ${remotePath}`)
    out.table(result.data.map(item => ({
      type: item.type === 'directory' ? 'd' : item.type === 'link' ? 'l' : '-',
      perms: item.permissions || 'rwxr-xr-x',
      size: item.size,
      modified: item.rawModifiedAt || '',
      name: item.name,
    })), [
      { key: 'type', label: 'T', width: 1 },
      { key: 'perms', label: 'Permissions', width: 10 },
      { key: 'size', label: 'Size', width: 12, align: 'right' },
      { key: 'modified', label: 'Modified', width: 12 },
      { key: 'name', label: 'Name' },
    ])
  }
)

// =============================================================================
// FTP Get (Download) Handler
// =============================================================================

export const ftpGetHandler: RekHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    const pathMod = await import('node:path')

    const host = getString(ctx.result.positional.host)
    const remote = getString(ctx.result.positional.remote)
    const local = getString(ctx.result.positional.local) || pathMod.basename(remote)
    const user = getString(ctx.result.options.user, 'anonymous')
    const pass = getString(ctx.result.options.pass, 'anonymous@')
    const port = getNumber(ctx.result.options.port, 21)
    const secure = ctx.result.options.implicit ? 'implicit' : getBoolean(ctx.result.options.secure)

    if (!host || !remote) {
      out.error('Host and remote path are required')
      return
    }

    const { createFTP } = await import('../../protocols/ftp.js')
    const client = createFTP({ host, port, user, password: pass, secure })

    if (!extCtx) {
      out.log(colors.gray(`Connecting to ${host}...`))
    }

    if (!(await client.connect()).success) throw new Error('Connection failed')

    if (!extCtx) {
      out.log(colors.gray(`Downloading ${remote} -> ${local}...`))
    }

    // Progress callback (CLI only)
    if (!extCtx) {
      let lastProgress = 0
      client.progress((p) => {
        if (p.bytesOverall - lastProgress > 100000) {
          process.stdout.write(`\r  ${colors.cyan((p.bytesOverall / 1024 / 1024).toFixed(2) + ' MB')} downloaded...`)
          lastProgress = p.bytesOverall
        }
      })
    }

    const result = await client.download(remote, local)
    if (!extCtx) out.log('')
    if (!result.success) throw new Error(result.message)

    await client.close()

    if (extCtx) {
      out.response({
        host,
        remote,
        local,
        status: 'completed',
      }, { responseType: 'ftp-download' })
    } else {
      out.success(`Downloaded to ${local}`)
    }
  }
)

// =============================================================================
// FTP Put (Upload) Handler
// =============================================================================

export const ftpPutHandler: RekHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    const pathMod = await import('node:path')

    const host = getString(ctx.result.positional.host)
    const local = getString(ctx.result.positional.local)
    const remote = getString(ctx.result.positional.remote) || '/' + pathMod.basename(local)
    const user = getString(ctx.result.options.user, 'anonymous')
    const pass = getString(ctx.result.options.pass, 'anonymous@')
    const port = getNumber(ctx.result.options.port, 21)
    const secure = ctx.result.options.implicit ? 'implicit' : getBoolean(ctx.result.options.secure)

    if (!host || !local) {
      out.error('Host and local path are required')
      return
    }

    const { createFTP } = await import('../../protocols/ftp.js')
    const client = createFTP({ host, port, user, password: pass, secure })

    if (!extCtx) {
      out.log(colors.gray(`Connecting to ${host}...`))
    }

    if (!(await client.connect()).success) throw new Error('Connection failed')

    if (!extCtx) {
      out.log(colors.gray(`Uploading ${local} -> ${remote}...`))
    }

    // Progress callback (CLI only)
    if (!extCtx) {
      let lastProgress = 0
      client.progress((p) => {
        if (p.bytesOverall - lastProgress > 100000) {
          process.stdout.write(`\r  ${colors.cyan((p.bytesOverall / 1024 / 1024).toFixed(2) + ' MB')} uploaded...`)
          lastProgress = p.bytesOverall
        }
      })
    }

    const result = await client.upload(local, remote)
    if (!extCtx) out.log('')
    if (!result.success) throw new Error(result.message)

    await client.close()

    if (extCtx) {
      out.response({
        host,
        local,
        remote,
        status: 'completed',
      }, { responseType: 'ftp-upload' })
    } else {
      out.success(`Uploaded to ${remote}`)
    }
  }
)

// =============================================================================
// Telnet Handler (CLI-only due to interactive nature)
// =============================================================================

export const telnetHandler: RekHandler = async (ctx) => {
  const out = createEnhancedOutput(ctx)
  const host = getString(ctx.result.positional.host)
  const port = getNumber(ctx.result.positional.port, 23)
  const timeout = getNumber(ctx.result.options.timeout, 30000)

  if (!host) {
    out.error('Host is required')
    if (!ctx.isTui) process.exit(1)
    return
  }

  // Telnet is interactive, not supported in TUI mode
  if (ctx.isTui && ctx.tui) {
    out.response({
      error: 'Telnet is an interactive protocol and cannot be used in TUI mode',
      hint: 'Use the CLI directly: rek telnet ' + host,
    }, { responseType: 'telnet-error' })
    return
  }

  try {
    const { createTelnet } = await import('../../protocols/telnet.js')
    out.log(colors.gray(`Connecting to ${host}:${port}...`))

    const client = createTelnet({ host, port, timeout })

    await client.connect()
    out.success(`Connected to ${host}:${port}`)

    if (process.stdin.isTTY) process.stdin.setRawMode(true)
    process.stdin.resume()

    process.stdin.on('data', async (d) => {
      if (d[0] === 0x03) {
        await client.close()
        process.exit(0)
      }
      await client.send(d.toString())
    })

    client.on('data', (d) => process.stdout.write(d))
    client.on('close', () => process.exit(0))
    client.on('error', (e) => {
      console.error(colors.red(e.message))
      process.exit(1)
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    out.error(`Telnet Error: ${message}`)
    if (!ctx.isTui) process.exit(1)
  }
}

// =============================================================================
// GraphQL Handler
// =============================================================================

export const graphqlHandler: RekHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let url = getString(ctx.result.positional.url)
    const query = getString(ctx.result.options.query)
    const file = getString(ctx.result.options.file)
    const variables = getString(ctx.result.options.variables)
    const varFile = getString(ctx.result.options.varFile)

    if (!url) {
      out.error('URL is required')
      return
    }

    const fs = await import('fs/promises')

    let queryStr = query
    let vars = variables ? JSON.parse(variables) : {}

    if (file) queryStr = await fs.readFile(file, 'utf-8')
    if (varFile) vars = JSON.parse(await fs.readFile(varFile, 'utf-8'))

    if (!queryStr) {
      out.error('Query is required via -q/--query or -f/--file')
      return
    }

    if (!url.startsWith('http')) url = `https://${url}`

    const { graphql } = await import('../../plugins/graphql.js')
    const { createClient } = await import('../../core/client.js')

    const client = extCtx?.client || createClient({ baseUrl: url, headers: { 'Content-Type': 'application/json' } })
    const result = await graphql(client, queryStr, vars)

    if (extCtx) {
      out.response({ url, data: result }, { responseType: 'graphql' })
    } else {
      out.json(result)
    }
  }
)

// =============================================================================
// JSON-RPC Handler
// =============================================================================

export const jsonrpcHandler: RekHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let url = getString(ctx.result.positional.url)
    const method = getString(ctx.result.positional.method)
    const params = getString(ctx.result.options.params)

    if (!url || !method) {
      out.error('URL and method are required')
      return
    }

    const parsedParams = params ? JSON.parse(params) : undefined

    if (!url.startsWith('http')) url = `https://${url}`

    const { createJsonRpcClient } = await import('../../plugins/jsonrpc.js')
    const { createClient } = await import('../../core/client.js')

    const client = extCtx?.client || createClient({ baseUrl: url })
    const rpc = createJsonRpcClient(client, { endpoint: url })
    const result = await rpc.call(method, parsedParams)

    if (extCtx) {
      out.response({ url, method, result }, { responseType: 'jsonrpc' })
    } else {
      out.json(result)
    }
  }
)

// =============================================================================
// SOAP Handler
// =============================================================================

export const soapHandler: RekHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let url = getString(ctx.result.positional.url)
    const action = getString(ctx.result.positional.action)
    const namespace = getString(ctx.result.options.namespace)
    const body = getString(ctx.result.options.body)

    if (!url || !action) {
      out.error('URL and action are required')
      return
    }

    if (!url.startsWith('http')) url = `https://${url}`

    const { createClient } = await import('../../core/client.js')
    const { createSoapClient } = await import('../../plugins/soap.js')

    const httpClient = extCtx?.client || createClient()
    const soap = createSoapClient(httpClient, { endpoint: url, namespace })
    const parsedBody = body ? JSON.parse(body) : {}

    const result = await soap.call(action, parsedBody)

    if (extCtx) {
      out.response({ url, action, result }, { responseType: 'soap' })
    } else {
      out.json(result)
    }
  }
)

// =============================================================================
// OData Handler
// =============================================================================

export const odataHandler: RekHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let url = getString(ctx.result.positional.url)
    const entity = getString(ctx.result.positional.entity)
    const select = getString(ctx.result.options.select)
    const filter = getString(ctx.result.options.filter)
    const orderby = getString(ctx.result.options.orderby)
    const top = getNumber(ctx.result.options.top, 0)
    const skip = getNumber(ctx.result.options.skip, 0)
    const expand = getString(ctx.result.options.expand)

    if (!url || !entity) {
      out.error('URL and entity are required')
      return
    }

    if (!url.startsWith('http')) url = `https://${url}`

    const { createClient } = await import('../../core/client.js')
    const { createODataClient } = await import('../../plugins/odata.js')

    const httpClient = extCtx?.client || createClient()
    const odata = createODataClient(httpClient, { serviceRoot: url })
    let query = odata.query(entity)

    if (select) query = query.select(...select.split(','))
    if (filter) query = query.filter(filter)
    if (orderby) query = query.orderBy(orderby)
    if (top) query = query.top(top)
    if (skip) query = query.skip(skip)
    if (expand) query = query.expand(expand)

    const results = await query.get()

    if (extCtx) {
      out.response({
        url,
        entity,
        data: results,
        count: Array.isArray(results) ? results.length : 1,
      }, { responseType: 'odata' })
    } else {
      out.json(results)
    }
  }
)

// =============================================================================
// Command Definitions
// =============================================================================

export const protocolCommands: RekCommandDefinition = {
  description: 'Protocol clients (FTP, Telnet, GraphQL, etc.)',
  category: 'protocols',
  tuiEnabled: true,
  commands: {
    'ftp ls': {
      description: 'List files on FTP server',
      positional: [
        { name: 'host', required: true, description: 'FTP server hostname' },
        { name: 'path', required: false, description: 'Remote directory path' }
      ],
      options: {
        user: { short: 'u', type: 'string', default: 'anonymous', description: 'Username' },
        pass: { short: 'p', type: 'string', default: 'anonymous@', description: 'Password' },
        port: { short: 'P', type: 'number', default: 21, description: 'Port number' },
        secure: { short: 's', type: 'boolean', description: 'Use FTPS (explicit TLS)' },
        implicit: { type: 'boolean', description: 'Use implicit FTPS (port 990)' },
        json: { short: 'j', type: 'boolean', description: 'Output as JSON' },
      },
      handler: ftpLsHandler
    },
    'ftp get': {
      description: 'Download file from FTP server',
      positional: [
        { name: 'host', required: true, description: 'FTP server hostname' },
        { name: 'remote', required: true, description: 'Remote file path' },
        { name: 'local', required: false, description: 'Local file path' }
      ],
      options: {
        user: { short: 'u', type: 'string', default: 'anonymous', description: 'Username' },
        pass: { short: 'p', type: 'string', default: 'anonymous@', description: 'Password' },
        port: { short: 'P', type: 'number', default: 21, description: 'Port number' },
        secure: { short: 's', type: 'boolean', description: 'Use FTPS' },
        implicit: { type: 'boolean', description: 'Use implicit FTPS' },
      },
      handler: ftpGetHandler
    },
    'ftp put': {
      description: 'Upload file to FTP server',
      positional: [
        { name: 'host', required: true, description: 'FTP server hostname' },
        { name: 'local', required: true, description: 'Local file path' },
        { name: 'remote', required: false, description: 'Remote file path' }
      ],
      options: {
        user: { short: 'u', type: 'string', default: 'anonymous', description: 'Username' },
        pass: { short: 'p', type: 'string', default: 'anonymous@', description: 'Password' },
        port: { short: 'P', type: 'number', default: 21, description: 'Port number' },
        secure: { short: 's', type: 'boolean', description: 'Use FTPS' },
        implicit: { type: 'boolean', description: 'Use implicit FTPS' },
      },
      handler: ftpPutHandler
    },
    'telnet': {
      description: 'Connect to Telnet server (interactive)',
      positional: [
        { name: 'host', required: true, description: 'Hostname or IP' },
        { name: 'port', required: false, description: 'Port number' }
      ],
      options: {
        timeout: { short: 't', type: 'number', default: 30000, description: 'Connection timeout in ms' },
      },
      handler: telnetHandler
    },
    'graphql': {
      description: 'Execute GraphQL queries',
      aliases: ['gql'],
      positional: [
        { name: 'url', required: true, description: 'GraphQL endpoint URL' }
      ],
      options: {
        query: { short: 'q', type: 'string', description: 'Inline GraphQL query' },
        file: { short: 'f', type: 'string', description: 'Query file path (.graphql)' },
        variables: { short: 'v', type: 'string', description: 'Variables JSON string' },
        varFile: { short: 'V', type: 'string', description: 'Variables file path (.json)' },
      },
      handler: graphqlHandler
    },
    'jsonrpc': {
      description: 'Make JSON-RPC 2.0 calls',
      positional: [
        { name: 'url', required: true, description: 'JSON-RPC endpoint URL' },
        { name: 'method', required: true, description: 'RPC method name' }
      ],
      options: {
        params: { short: 'p', type: 'string', description: 'RPC params as JSON' },
      },
      handler: jsonrpcHandler
    },
    'soap': {
      description: 'Make SOAP/XML web service requests',
      positional: [
        { name: 'url', required: true, description: 'SOAP service endpoint URL' },
        { name: 'action', required: true, description: 'SOAP action/operation name' }
      ],
      options: {
        namespace: { short: 'n', type: 'string', description: 'SOAP namespace URL' },
        body: { short: 'b', type: 'string', description: 'Request body as JSON' },
      },
      handler: soapHandler
    },
    'odata': {
      description: 'Query OData services',
      positional: [
        { name: 'url', required: true, description: 'OData service root URL' },
        { name: 'entity', required: true, description: 'Entity set name' }
      ],
      options: {
        select: { short: 's', type: 'string', description: 'Select fields (comma-separated)' },
        filter: { short: 'f', type: 'string', description: 'OData filter expression' },
        orderby: { short: 'o', type: 'string', description: 'Order by field' },
        top: { short: 't', type: 'number', description: 'Limit results' },
        skip: { short: 'S', type: 'number', description: 'Skip first N results' },
        expand: { short: 'e', type: 'string', description: 'Expand navigation property' },
      },
      handler: odataHandler
    }
  }
}
