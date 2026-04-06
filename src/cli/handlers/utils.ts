/**
 * Utils Commands (Unified)
 *
 * Upload, download, proxy tools migrated to the unified command system.
 * These handlers work in both CLI and TUI modes.
 */

import type { RekCommandDefinition, RekHandler } from '../handler-types.js'
import {
  withHandler,
  createEnhancedOutput,
  getString,
  getBoolean,
  formatBytes,
  colors,
} from '../output.js'

// =============================================================================
// Upload Handler
// =============================================================================

export const uploadHandler: RekHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let url = getString(ctx.result.positional.url)
    const file = getString(ctx.result.positional.file)
    const fieldName = getString(ctx.result.options.field, 'file')

    if (!url || !file) {
      out.error('URL and file path are required')
      return
    }

    if (!url.startsWith('http')) url = `https://${url}`

    const fs = await import('fs/promises')
    const pathMod = await import('node:path')
    const { createClient } = await import('../../core/client.js')

    await fs.access(file)
    const stats = await fs.stat(file)
    const fileContent = await fs.readFile(file)
    const filename = pathMod.basename(file)

    if (!extCtx) {
      out.log(colors.gray(`Uploading ${filename} (${formatBytes(stats.size)})...`))
    }

    const client = extCtx?.client || createClient()
    const boundary = `----ReckerBoundary${Date.now()}`

    const bodyParts = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"`,
      'Content-Type: application/octet-stream',
      '',
      ''
    ]

    const header = Buffer.from(bodyParts.join('\r\n'))
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`)
    const body = Buffer.concat([header, fileContent, footer])

    const response = await client.post(url, body, {
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
    })

    const text = await response.text()

    if (extCtx) {
      out.response({
        url,
        file: filename,
        size: stats.size,
        status: response.status,
        statusText: response.statusText,
        response: text || undefined,
      }, { responseType: 'upload' })
    } else {
      out.success(`Upload complete: ${response.status} ${response.statusText}`)
      if (text) out.log(text)
    }
  }
)

// =============================================================================
// Download Handler
// =============================================================================

export const downloadHandler: RekHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let url = getString(ctx.result.positional.url)
    const output = getString(ctx.result.positional.output)
    const resume = getBoolean(ctx.result.options.resume)
    const showProgress = !getBoolean(ctx.result.options.noProgress)

    if (!url) {
      out.error('URL is required')
      return
    }

    if (!url.startsWith('http')) url = `https://${url}`

    const pathMod = await import('node:path')
    const { downloadToFile } = await import('../../utils/download.js')
    const { createClient } = await import('../../core/client.js')

    const urlPath = new URL(url).pathname
    const filename = output || pathMod.basename(urlPath) || 'download'

    if (!extCtx) {
      out.log(colors.gray(`Downloading to ${filename}...`))
    }

    const client = extCtx?.client || createClient()

    await downloadToFile(client, url, filename, {
      resume,
      onProgress: (!extCtx && showProgress) ? (p) => {
        const total = p.total || 0
        const pct = total > 0 ? Math.round((p.loaded / total) * 100) : 0
        const mb = formatBytes(p.loaded)
        process.stdout.write(`\r  ${pct}% (${mb})`)
      } : undefined
    })

    if (!extCtx && showProgress) process.stdout.write('\n')

    if (extCtx) {
      out.response({
        url,
        file: filename,
        status: 'completed',
      }, { responseType: 'download' })
    } else {
      out.success('Download complete')
    }
  }
)

// =============================================================================
// Proxy Handler
// =============================================================================

export const proxyHandler: RekHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    const proxy = getString(ctx.result.positional.proxy)
    let target = getString(ctx.result.positional.target)
    const method = getString(ctx.result.options.method, 'GET').toLowerCase()
    const data = getString(ctx.result.options.data)

    if (!proxy || !target) {
      out.error('Proxy and target URL are required')
      return
    }

    if (!target.startsWith('http')) target = `https://${target}`

    if (!extCtx) {
      out.keyValue({
        Proxy: proxy,
        Target: target,
      })
    }

    const { createClient } = await import('../../core/client.js')
    const client = createClient({ proxy: { url: proxy } })

    const requestOptions: Record<string, unknown> = {}
    if (data) {
      try {
        requestOptions.json = JSON.parse(data)
      } catch {
        requestOptions.body = data
      }
    }

    const response = await (client as unknown as Record<string, (url: string, opts?: unknown) => Promise<{ status: number; statusText: string; text: () => Promise<string> }>>)[method](target, requestOptions)
    const text = await response.text()

    if (extCtx) {
      out.response({
        proxy,
        target,
        method: method.toUpperCase(),
        status: response.status,
        statusText: response.statusText,
        body: text,
      }, { responseType: 'proxy' })
    } else {
      out.success(`${response.status} ${response.statusText}`)
      out.log(text)
    }
  }
)

// =============================================================================
// Setup Handler
// =============================================================================

export const setupHandler: RekHandler = async (ctx) => {
  const out = createEnhancedOutput(ctx)

  try {
    const { installCurlImpersonate, hasImpersonate, resolveCurlPath } = await import('../../utils/binary-manager.js')

    if (await hasImpersonate()) {
      const resolvedPath = await resolveCurlPath()
      if (ctx.isTui && ctx.tui) {
        out.response({
          installed: true,
          path: resolvedPath,
        }, { responseType: 'setup' })
      } else {
        out.success('curl-impersonate is already installed at:')
        out.log(colors.gray(resolvedPath || ''))
      }
      return
    }

    if (ctx.isTui && ctx.tui) {
      out.response({
        error: 'Setup requires CLI mode. Run: rek setup',
      }, { responseType: 'setup-error' })
      return
    }

    out.title('Installing curl-impersonate...')
    await installCurlImpersonate(console)

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    out.error(`Installation failed: ${message}`)
    if (!ctx.isTui) process.exit(1)
  }
}

// =============================================================================
// Command Definitions
// =============================================================================

export const utilsCommands: RekCommandDefinition = {
  description: 'Utility tools (upload, download, proxy)',
  category: 'utils',
  tuiEnabled: true,
  commands: {
    'upload': {
      description: 'Upload a file using multipart/form-data',
      positional: [
        { name: 'url', required: true, description: 'Target upload URL' },
        { name: 'file', required: true, description: 'Local file path to upload' }
      ],
      options: {
        field: { short: 'f', type: 'string', default: 'file', description: 'Form field name' },
        noProgress: { type: 'boolean', description: 'Disable progress' },
      },
      examples: [
        { cmd: 'rek upload api.com/files ./image.png', desc: 'Simple upload' },
        { cmd: 'rek upload api.com/files data.json -f doc', desc: 'Custom field name' },
      ],
      handler: uploadHandler
    },
    'download': {
      description: 'Download a file from a URL',
      positional: [
        { name: 'url', required: true, description: 'Source URL to download' },
        { name: 'output', required: false, description: 'Output file path' }
      ],
      options: {
        resume: { short: 'r', type: 'boolean', description: 'Resume partial download' },
        noProgress: { type: 'boolean', description: 'Disable progress bar' },
      },
      examples: [
        { cmd: 'rek download example.com/file.zip', desc: 'Download file' },
        { cmd: 'rek download example.com/large.iso -r', desc: 'Resume partial' },
      ],
      handler: downloadHandler
    },
    'proxy': {
      description: 'Make requests through a proxy server',
      positional: [
        { name: 'proxy', required: true, description: 'Proxy server URL' },
        { name: 'target', required: true, description: 'Target URL to request' }
      ],
      options: {
        method: { short: 'm', type: 'string', default: 'GET', description: 'HTTP method' },
        data: { short: 'd', type: 'string', description: 'Request body (JSON)' },
      },
      examples: [
        { cmd: 'rek proxy http://localhost:8080 httpbin.org/ip', desc: 'GET through proxy' },
      ],
      handler: proxyHandler
    },
    'setup': {
      description: 'Install external dependencies (curl-impersonate)',
      positional: [],
      options: {},
      handler: setupHandler
    }
  }
}
