/**
 * Network Commands (Unified)
 *
 * Network diagnostic tools migrated to the unified command system.
 * These handlers work in both CLI and TUI modes.
 */

import type { RekCommandDefinition } from '../handler-types.js'
import {
  withHandler,
  getNumber,
  colors,
  formatDuration,
} from '../output.js'

// =============================================================================
// Ping Handler
// =============================================================================

export const pingHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let host = ctx.result.positional.host as string

    if (!host) {
      // Try to get from base URL
      const base = extCtx?.baseUrl?.()
      if (base) {
        try {
          const url = new URL(base)
          host = url.hostname
        } catch {
          out.error('Usage: ping <host> [port]')
          return
        }
      }
      if (!host) {
        out.error('Host is required')
        return
      }
    }

    const port = getNumber(ctx.result.positional.port, 443)
    const count = getNumber(ctx.result.options.count, 4)
    const timeout = getNumber(ctx.result.options.timeout, 5000)

    const net = await import('node:net')
    const results: number[] = []

    out.log(colors.gray(`Pinging ${host}:${port}...`))
    out.blank()

    for (let i = 0; i < count; i++) {
      const startTime = Date.now()

      const result = await new Promise<{ success: boolean; time: number }>((resolve) => {
        const socket = new net.Socket()
        socket.setTimeout(timeout)

        socket.on('connect', () => {
          const time = Date.now() - startTime
          socket.destroy()
          resolve({ success: true, time })
        })

        socket.on('error', () => {
          resolve({ success: false, time: Date.now() - startTime })
        })

        socket.on('timeout', () => {
          socket.destroy()
          resolve({ success: false, time: timeout })
        })

        socket.connect(port, host)
      })

      if (result.success) {
        results.push(result.time)
        out.status('success', `Connected to ${host}:${port} - ${colors.cyan(result.time.toFixed(2) + 'ms')}`)
      } else {
        out.status('error', 'Failed to connect: Timeout')
      }

      // Wait between pings (except after last)
      if (i < count - 1) {
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    // Show statistics
    if (results.length > 0) {
      const avg = results.reduce((a, b) => a + b, 0) / results.length
      const min = Math.min(...results)
      const max = Math.max(...results)
      const lost = count - results.length
      const lostPct = ((lost / count) * 100).toFixed(0)

      if (extCtx) {
        out.response({
          host,
          port,
          sent: count,
          received: results.length,
          lost,
          lostPercent: parseFloat(lostPct),
          min: parseFloat(min.toFixed(2)),
          avg: parseFloat(avg.toFixed(2)),
          max: parseFloat(max.toFixed(2)),
        }, { responseType: 'ping' })
      } else {
        out.blank()
        out.subtitle('Statistics')
        out.keyValue({
          Sent: count,
          Received: results.length,
          Lost: `${lost} (${lostPct}%)`,
          Min: `${min.toFixed(2)}ms`,
          Avg: `${avg.toFixed(2)}ms`,
          Max: `${max.toFixed(2)}ms`,
        })
      }
    } else if (extCtx) {
      out.response({
        host,
        port,
        sent: count,
        received: 0,
        lost: count,
        lostPercent: 100,
        error: 'All pings failed',
      }, { responseType: 'ping' })
    }
  }
)

// =============================================================================
// TLS Handler
// =============================================================================

export const tlsHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let host = ctx.result.positional.host as string

    if (!host) {
      const base = extCtx?.baseUrl?.()
      if (base) {
        try {
          const url = new URL(base)
          host = url.hostname
        } catch {
          out.error('Usage: tls <hostname>')
          return
        }
      }
      if (!host) {
        out.error('Hostname is required')
        return
      }
    }

    const tls = await import('node:tls')
    const hostname = host.replace(/^https?:\/\//, '').split('/')[0]
    const port = 443

    out.log(colors.gray(`Inspecting TLS certificate for ${hostname}...`))

    const result = await new Promise<{
      host: string
      valid: boolean
      protocol: string | null
      cipher: string | undefined
      subject: string | undefined
      issuer: string | undefined
      validFrom: string
      validTo: string
      fingerprint: string
    }>((resolve, reject) => {
      const socket = tls.connect({ host: hostname, port, servername: hostname }, () => {
        const cert = socket.getPeerCertificate()
        const protocol = socket.getProtocol()
        const cipher = socket.getCipher()

        socket.end()
        resolve({
          host: hostname,
          valid: socket.authorized,
          protocol,
          cipher: cipher?.name,
          subject: cert.subject?.CN,
          issuer: cert.issuer?.O,
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          fingerprint: cert.fingerprint,
        })
      })
      socket.on('error', reject)
      socket.setTimeout(10000, () => {
        socket.destroy()
        reject(new Error('Connection timeout'))
      })
    })

    const now = new Date()
    const expiry = new Date(result.validTo)
    const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (extCtx) {
      out.response({
        host: result.host,
        valid: result.valid,
        issuer: result.issuer,
        subject: result.subject,
        validFrom: result.validFrom,
        validTo: result.validTo,
        daysRemaining: daysLeft,
        protocol: result.protocol,
        cipher: result.cipher,
        fingerprint: result.fingerprint,
      }, { responseType: 'tls' })
    } else {
      out.title('TLS Certificate Information', '🔒')
      out.keyValue([
        { key: 'Host', value: result.host },
        { key: 'Valid', value: result.valid ? 'Yes' : 'No', color: result.valid ? 'green' : 'red' },
        { key: 'Subject', value: result.subject || 'N/A' },
        { key: 'Issuer', value: result.issuer || 'N/A' },
        { key: 'Protocol', value: result.protocol || 'N/A' },
        { key: 'Cipher', value: result.cipher || 'N/A' },
      ])
      out.blank()
      out.keyValue([
        { key: 'Valid From', value: result.validFrom },
        { key: 'Valid To', value: result.validTo },
        {
          key: 'Days Left',
          value: daysLeft.toString(),
          color: daysLeft > 30 ? 'green' : daysLeft > 7 ? 'yellow' : 'red'
        },
      ])
      out.blank()
    }
  }
)

// =============================================================================
// IP Handler
// =============================================================================

export const ipHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    const ip = ctx.result.positional.ip as string

    if (!ip) {
      out.error('IP address is required')
      return
    }

    const { getIpInfo } = await import('../../mcp/ip-intel.js')
    const info = await getIpInfo(ip)

    if (info.bogon) {
      out.warn(`${ip} is a Bogon/Private IP (${info.bogonType})`)
      return
    }

    // Parse lat/lon from loc string
    let lat: number | undefined
    let lon: number | undefined
    if (info.loc) {
      const [latStr, lonStr] = info.loc.split(',')
      lat = parseFloat(latStr)
      lon = parseFloat(lonStr)
    }

    if (extCtx) {
      out.response({
        ip: info.ip,
        country: info.country,
        countryCode: info.countryCode,
        city: info.city,
        region: info.region,
        timezone: info.timezone,
        org: info.org,
        asn: info.asn ? String(info.asn) : undefined,
        lat,
        lon,
      }, { responseType: 'geoip' })
    } else {
      out.title('IP Geolocation', '🌍')
      out.keyValue([
        { key: 'IP', value: info.ip },
        ...(info.city ? [{ key: 'City', value: info.city }] : []),
        ...(info.region ? [{ key: 'Region', value: info.region }] : []),
        ...(info.country ? [{ key: 'Country', value: `${info.country} (${info.countryCode})` }] : []),
        ...(info.timezone ? [{ key: 'Timezone', value: info.timezone }] : []),
        ...(info.org ? [{ key: 'Organization', value: info.org }] : []),
        ...(info.asn ? [{ key: 'ASN', value: String(info.asn) }] : []),
        ...(lat && lon ? [{ key: 'Coordinates', value: `${lat}, ${lon}` }] : []),
      ])
      out.blank()
    }
  }
)

// =============================================================================
// WebSocket Handler
// =============================================================================

export const wsHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let url = ctx.result.positional.url as string

    if (!url) {
      out.error('URL is required')
      return
    }

    // Add wss:// if no protocol specified
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      url = `wss://${url}`
    }

    const duration = getNumber(ctx.result.options.duration, 30) * 1000
    const sendMessage = ctx.result.options.send as string | undefined

    out.log(colors.gray(`Connecting to WebSocket: ${url} (${formatDuration(duration)})`))

    const { createClient } = await import('../../core/client.js')
    const client = createClient()
    const ws = client.websocket(url)

    const messages: Array<{ type: string; content: string; time: number }> = []
    const startTime = Date.now()

    ws.on('message', (msg) => {
      const content = msg.isBinary ? `<Binary ${msg.data.length} bytes>` : msg.data.toString()
      messages.push({ type: 'received', content, time: Date.now() - startTime })
    })

    ws.on('error', (err) => {
      messages.push({ type: 'error', content: err.message, time: Date.now() - startTime })
    })

    await ws.connect()
    out.success('Connected')

    if (sendMessage && ws.isConnected) {
      ws.send(sendMessage)
      messages.push({ type: 'sent', content: sendMessage, time: Date.now() - startTime })
    }

    await new Promise(resolve => setTimeout(resolve, duration))

    if (ws.isConnected) {
      ws.close()
    }

    const receivedCount = messages.filter(m => m.type === 'received').length

    if (extCtx) {
      out.response({
        url,
        duration: formatDuration(duration),
        messagesReceived: receivedCount,
        messages: messages.slice(-10),
      }, { responseType: 'websocket' })
    } else {
      out.title('WebSocket Session', '🔌')
      out.keyValue({
        URL: url,
        Duration: formatDuration(duration),
        'Messages Received': receivedCount,
      })

      if (messages.length > 0) {
        out.blank()
        out.subtitle('Last Messages')
        for (const msg of messages.slice(-5)) {
          const icon = msg.type === 'sent' ? colors.blue('→')
            : msg.type === 'received' ? colors.green('←')
            : colors.red('✖')
          out.log(`  ${icon} ${msg.content}`)
        }
      }
      out.blank()
    }
  }
)

// =============================================================================
// WHOIS Handler
// =============================================================================

export const whoisHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let domain = ctx.result.positional.domain as string

    if (!domain) {
      const base = extCtx?.baseUrl?.()
      if (base) {
        try {
          const url = new URL(base)
          domain = url.hostname
        } catch {
          out.error('Usage: whois <domain>')
          return
        }
      }
      if (!domain) {
        out.error('Domain is required')
        return
      }
    }

    // Strip www. prefix
    domain = domain.replace(/^www\./i, '')

    const { whois } = await import('../../utils/whois.js')
    const result = await whois(domain)

    // Helper to get data from result
    const getData = (keys: string[]): string | undefined => {
      for (const key of keys) {
        const val = result.data[key]
        if (val) return Array.isArray(val) ? val[0] : val
      }
      return undefined
    }
    const getDataArray = (keys: string[]): string[] | undefined => {
      for (const key of keys) {
        const val = result.data[key]
        if (val) return Array.isArray(val) ? val : [val]
      }
      return undefined
    }

    const registrar = getData(['Registrar', 'registrar', 'Sponsoring Registrar'])
    const created = getData(['Creation Date', 'created', 'Registration Date', 'Created On'])
    const expires = getData(['Registry Expiry Date', 'Expiration Date', 'expires', 'Expiry Date'])
    const nameServers = getDataArray(['Name Server', 'nserver', 'Name Servers'])

    // Track in Domain Intelligence
    extCtx?.track.dns(domain, [], {
      registrar,
      createdDate: created,
      expiresDate: expires,
      nameServers,
    })

    if (extCtx) {
      out.response({ domain, ...result }, { responseType: 'whois' })
    } else {
      out.title('WHOIS Information', '📋')
      out.keyValue([
        { key: 'Domain', value: domain },
        ...(registrar ? [{ key: 'Registrar', value: registrar }] : []),
        ...(created ? [{ key: 'Created', value: created }] : []),
        ...(expires ? [{ key: 'Expires', value: expires }] : []),
      ])

      if (nameServers && nameServers.length > 0) {
        out.blank()
        out.subtitle('Name Servers')
        out.list(nameServers.slice(0, 5))
      }
      out.blank()
    }
  }
)

// =============================================================================
// RDAP Handler
// =============================================================================

export const rdapHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let domain = ctx.result.positional.domain as string

    if (!domain) {
      const base = extCtx?.baseUrl?.()
      if (base) {
        try {
          const url = new URL(base)
          domain = url.hostname
        } catch {
          out.error('Usage: rdap <domain>')
          return
        }
      }
      if (!domain) {
        out.error('Domain is required')
        return
      }
    }

    // Strip www. prefix
    domain = domain.replace(/^www\./i, '')

    const { rdap } = await import('../../utils/rdap.js')
    const { createClient } = await import('../../core/client.js')
    const client = extCtx?.client || createClient()

    const result = await rdap(client, domain)

    if (extCtx) {
      out.response({ domain, ...result }, { responseType: 'rdap' })
    } else {
      out.title('RDAP Information', '🔍')
      out.keyValue([
        { key: 'Domain', value: domain },
        ...(result.status ? [{ key: 'Status', value: Array.isArray(result.status) ? result.status.join(', ') : result.status }] : []),
        ...(result.registrar ? [{ key: 'Registrar', value: result.registrar }] : []),
      ])

      if (result.nameservers && result.nameservers.length > 0) {
        out.blank()
        out.subtitle('Name Servers')
        // Nameservers can be strings or objects with ldhName
        const nsList = result.nameservers.slice(0, 5).map((ns: string | { ldhName: string }) =>
          typeof ns === 'string' ? ns : ns.ldhName
        )
        out.list(nsList)
      }
      out.blank()
    }
  }
)

// =============================================================================
// Command Definitions
// =============================================================================

export const networkCommands: RekCommandDefinition = {
  description: 'Network diagnostic tools',
  category: 'network',
  tuiEnabled: true,
  commands: {
    ping: {
      description: 'TCP connectivity test',
      positional: [
        { name: 'host', required: false, description: 'Host to ping (uses base URL if not provided)' },
        { name: 'port', required: false, type: 'number', default: 443, description: 'Port to connect to' }
      ],
      options: {
        count: { short: 'c', type: 'number', default: 4, description: 'Number of pings to send' },
        timeout: { short: 't', type: 'number', default: 5000, description: 'Connection timeout in ms' },
      },
      examples: [
        { cmd: 'rek ping google.com', desc: 'Ping port 443' },
        { cmd: 'rek ping google.com 80', desc: 'Ping port 80' },
        { cmd: 'rek ping redis.local 6379 -c 10', desc: '10 pings to Redis' }
      ],
      handler: pingHandler
    },
    tls: {
      description: 'TLS/SSL certificate inspection',
      aliases: ['ssl', 'cert'],
      positional: [
        { name: 'host', required: false, description: 'Hostname to inspect (uses base URL if not provided)' }
      ],
      examples: [
        { cmd: 'rek network tls google.com', desc: 'Inspect Google certificate' },
        { cmd: 'rek network tls api.github.com', desc: 'Inspect GitHub API certificate' }
      ],
      handler: tlsHandler
    },
    ip: {
      description: 'IP geolocation lookup',
      aliases: ['geoip'],
      positional: [
        { name: 'ip', required: true, description: 'IP address to lookup' }
      ],
      examples: [
        { cmd: 'rek network ip 8.8.8.8', desc: 'Lookup Google DNS IP' },
        { cmd: 'rek network ip 2001:4860:4860::8888', desc: 'Lookup IPv6 address' }
      ],
      handler: ipHandler
    },
    ws: {
      description: 'WebSocket client',
      aliases: ['websocket'],
      positional: [
        { name: 'url', required: true, description: 'WebSocket URL to connect to' }
      ],
      options: {
        duration: {
          short: 'd',
          type: 'number',
          default: 30,
          description: 'Listen duration in seconds'
        },
        send: {
          short: 's',
          type: 'string',
          description: 'Message to send on connect'
        }
      },
      examples: [
        { cmd: 'rek network ws wss://echo.websocket.org', desc: 'Connect to echo server' },
        { cmd: 'rek network ws wss://api.example.com -d 60', desc: 'Listen for 60 seconds' },
        { cmd: 'rek network ws ws://localhost:8080 --send="hello"', desc: 'Send message on connect' }
      ],
      handler: wsHandler
    },
    whois: {
      description: 'WHOIS domain lookup',
      positional: [
        { name: 'domain', required: false, description: 'Domain to lookup (uses base URL if not provided)' }
      ],
      examples: [
        { cmd: 'rek network whois google.com', desc: 'Lookup Google domain info' },
        { cmd: 'rek network whois example.org', desc: 'Lookup example.org' }
      ],
      handler: whoisHandler
    },
    rdap: {
      description: 'RDAP lookup (modern WHOIS)',
      positional: [
        { name: 'domain', required: false, description: 'Domain to lookup (uses base URL if not provided)' }
      ],
      examples: [
        { cmd: 'rek network rdap google.com', desc: 'RDAP lookup for Google' },
        { cmd: 'rek network rdap example.org', desc: 'RDAP lookup for example.org' }
      ],
      handler: rdapHandler
    }
  }
}

// Export individual handlers for top-level aliases
export { pingHandler as ping }
export { tlsHandler as tls }
export { ipHandler as ip }
export { wsHandler as ws }
export { whoisHandler as whois }
export { rdapHandler as rdap }
