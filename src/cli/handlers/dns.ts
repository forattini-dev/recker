/**
 * DNS Commands (Unified)
 *
 * DNS tools migrated to the unified command system.
 * These handlers work in both CLI and TUI modes.
 *
 * This file serves as the reference implementation for the enhanced output system.
 */

import type { RekCommandDefinition } from '../handler-types.js'
import {
  createEnhancedOutput,
  withHandler,
  getString,
  colors,
} from '../output.js'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

// =============================================================================
// DNS Lookup Handler
// =============================================================================

/**
 * DNS Lookup handler
 * Uses the withHandler wrapper for automatic loading state management.
 */
export const lookupHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    const domain = ctx.result.positional.domain as string
    const type = getString(ctx.result.positional.type, 'A').toUpperCase()

    out.log(colors.gray(`Looking up ${type} records for ${domain}...`))

    const { dnsLookup } = await import('../../utils/dns-toolkit.js')
    const results = await dnsLookup(domain, type)

    if (results.length === 0) {
      out.warn(`No ${type} records found for ${domain}`)
      return
    }

    // Track DNS data in shell
    extCtx?.track.dns(domain, results, { type })

    // TUI: Use structured response for panel display
    if (extCtx) {
      out.response(
        { domain, type, records: results },
        { responseType: 'dns' }
      )
    } else {
      // CLI: Formatted text output
      out.title('DNS Lookup Results', '🔍')
      out.table(
        results.map(r => ({
          type: r.type,
          data: typeof r.data === 'object' ? JSON.stringify(r.data) : String(r.data),
        })),
        [
          { key: 'type', label: 'Type', width: 8 },
          { key: 'data', label: 'Data' },
        ]
      )
      out.blank()
    }
  }
)

// =============================================================================
// Reverse DNS Lookup Handler
// =============================================================================

export const reverseHandler = withHandler(
  { loading: true },
  async (ctx, out) => {
    const ip = ctx.result.positional.ip as string

    out.log(colors.gray(`Performing reverse lookup for ${ip}...`))

    const { reverseLookup } = await import('../../utils/dns-toolkit.js')
    const hostnames = await reverseLookup(ip)

    if (hostnames.length === 0) {
      out.warn('No PTR records found')
      return
    }

    out.title('Reverse DNS Lookup', '🔄')
    out.list(hostnames)
    out.blank()
  }
)

// =============================================================================
// DNS Propagation Check Handler
// =============================================================================

export const propagateHandler = withHandler(
  { loading: true },
  async (ctx, out) => {
    const domain = ctx.result.positional.domain as string
    const type = getString(ctx.result.positional.type, 'A')

    out.log(colors.gray(`Checking propagation for ${domain} (${type})...`))

    const { checkPropagation, formatPropagationReport } = await import('../../dns/propagation.js')
    const results = await checkPropagation(domain, type)
    out.log(formatPropagationReport(results, domain, type))
  }
)

// =============================================================================
// DNS Health Check Handler
// =============================================================================

export const healthHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    const domain = ctx.result.positional.domain as string

    out.log(colors.gray(`Running DNS health check for ${domain}...`))

    const { checkDnsHealth } = await import('../../utils/dns-toolkit.js')
    const report = await checkDnsHealth(domain)

    out.title('DNS Health Report', '🏥')
    out.grade(report.grade, report.score)
    out.blank()

    // Display checks as checklist
    for (const check of report.checks) {
      const status = check.status === 'pass' ? 'success'
        : check.status === 'warn' ? 'warning'
        : 'error'
      out.status(status, `${colors.bold(check.name.padEnd(16))} ${check.message}`)
    }
    out.blank()

    if (extCtx) {
      out.response(report, { responseType: 'dns-health' })
    }
  }
)

// =============================================================================
// Email Security Handlers (SPF, DMARC, DKIM)
// =============================================================================

export const spfHandler = withHandler(
  { loading: true },
  async (ctx, out) => {
    const domain = ctx.result.positional.domain as string

    const { validateSpf } = await import('../../utils/dns-toolkit.js')
    const result = await validateSpf(domain)

    out.title('SPF Validation', '📧')

    if (result.valid) {
      out.status('success', `Valid SPF: ${colors.gray(result.record || '')}`)
    } else if (result.record) {
      out.status('warning', `Invalid SPF: ${colors.gray(result.record)}`)
    } else {
      out.status('error', 'No SPF record found')
    }

    if (result.errors?.length) {
      for (const e of result.errors) {
        out.log(`    ${colors.red('→')} ${e}`)
      }
    }
    out.blank()
  }
)

export const dmarcHandler = withHandler(
  { loading: true },
  async (ctx, out) => {
    const domain = ctx.result.positional.domain as string

    const { validateDmarc } = await import('../../utils/dns-toolkit.js')
    const result = await validateDmarc(domain)

    out.title('DMARC Validation', '🛡️')

    if (result.valid) {
      out.status('success', `Valid DMARC (Policy: ${result.policy})`)
    } else {
      out.status('error', 'DMARC issue')
    }

    if (result.record) {
      out.log(`    ${colors.gray(result.record)}`)
    }
    out.blank()
  }
)

export const dkimHandler = withHandler(
  { loading: true },
  async (ctx, out) => {
    const domain = ctx.result.positional.domain as string
    const selector = (ctx.result.options.selector as string) || 'default'

    const { checkDkim } = await import('../../utils/dns-toolkit.js')
    const result = await checkDkim(domain, selector)

    out.title('DKIM Check', '🔑')

    if (result.found) {
      out.status('success', `DKIM found (selector: ${selector})`)
    } else {
      out.status('error', `No DKIM found (selector: ${selector})`)
    }
    out.blank()
  }
)

// =============================================================================
// System DNS Handler
// =============================================================================

export const systemHandler = withHandler(
  { loading: false },
  async (ctx, out) => {
    const platform = process.platform
    let cmd = ''

    if (platform === 'linux') {
      cmd = 'resolvectl status'
    } else if (platform === 'darwin') {
      cmd = 'scutil --dns'
    } else if (platform === 'win32') {
      cmd = 'ipconfig /all'
    } else {
      out.error('Unsupported platform for system DNS check.')
      return
    }

    out.log(colors.gray(`Running system DNS check (${cmd})...\n`))

    try {
      const { stdout } = await execAsync(cmd)
      out.log(stdout)
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      if (platform === 'linux') {
        try {
          const { stdout } = await execAsync('cat /etc/resolv.conf')
          out.subtitle('/etc/resolv.conf:')
          out.log(stdout)
        } catch {
          out.error(`Failed to check DNS: ${errMsg}`)
        }
      } else {
        out.error(`Failed to check DNS: ${errMsg}`)
      }
    }
  }
)

// =============================================================================
// Dig Handler
// =============================================================================

export const digHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    // Parse dig-style arguments: [@server] domain [type]
    const rawArgs = ctx.rawArgs || []
    let server: string | undefined
    let domain: string | undefined
    let type = 'A'

    // Parse arguments (dig allows @server syntax)
    for (const arg of rawArgs) {
      if (arg.startsWith('-')) continue // Skip flags
      if (arg.startsWith('@')) {
        server = arg.slice(1)
      } else if (!domain) {
        domain = arg
      } else {
        type = arg.toUpperCase()
      }
    }

    // Fallback to positional args
    if (!domain) {
      domain = ctx.result.positional.domain as string
    }

    if (!domain) {
      out.error('Domain is required. Usage: rek dns dig [@server] <domain> [type]')
      return
    }

    const { dig, formatDigOutput } = await import('../../utils/dns-toolkit.js')

    const result = await dig(domain, {
      server,
      type: type as 'A' | 'AAAA' | 'MX' | 'TXT' | 'NS' | 'CNAME' | 'SOA' | 'ANY',
    })

    if (extCtx) {
      out.response({
        question: result.question,
        answer: result.answer,
        server: result.server,
        queryTime: result.queryTime,
      }, { responseType: 'dig' })
    } else {
      const output = formatDigOutput(result)
      out.log(output)
    }
  }
)

// =============================================================================
// Email Audit Handler
// =============================================================================

export const emailAuditHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    const domain = ctx.result.positional.domain as string
    const selector = (ctx.result.options.selector as string) || 'default'

    if (!domain) {
      out.error('Domain is required')
      return
    }

    out.log(colors.gray(`Running full email audit for ${domain}...\n`))

    const dns = await import('node:dns/promises')
    const results: {
      mx: { records?: Array<{ priority: number; exchange: string }>; error?: string }
      spf: { record?: string; valid: boolean; error?: string }
      dmarc: { record?: string; policy?: string; error?: string }
      dkim: { record?: string; error?: string }
    } = {
      mx: {},
      spf: { valid: false },
      dmarc: {},
      dkim: {},
    }

    // MX Records
    out.subtitle('📧 MX Records')
    try {
      const mxRecords = await dns.resolveMx(domain)
      results.mx.records = mxRecords
      for (const mx of mxRecords) {
        out.status('success', `Priority ${mx.priority}: ${mx.exchange}`)
      }
    } catch (err: unknown) {
      results.mx.error = err instanceof Error ? err.message : String(err)
      out.status('error', 'No MX records found')
    }
    out.blank()

    // SPF Record
    out.subtitle('🛡️ SPF Record')
    try {
      const txtRecords = await dns.resolveTxt(domain)
      const spfRecord = txtRecords.flat().find(r => r.startsWith('v=spf1'))
      if (spfRecord) {
        results.spf.record = spfRecord
        results.spf.valid = true
        const display = spfRecord.length > 60 ? spfRecord.slice(0, 60) + '...' : spfRecord
        out.status('success', display)
      } else {
        out.status('error', 'No SPF record found')
      }
    } catch (err: unknown) {
      results.spf.error = err instanceof Error ? err.message : String(err)
      out.status('error', `Failed to check SPF: ${results.spf.error}`)
    }
    out.blank()

    // DMARC Record
    out.subtitle('🔐 DMARC Record')
    try {
      const dmarcRecords = await dns.resolveTxt(`_dmarc.${domain}`)
      const dmarcRecord = dmarcRecords.flat().find(r => r.startsWith('v=DMARC1'))
      if (dmarcRecord) {
        results.dmarc.record = dmarcRecord
        const policyMatch = dmarcRecord.match(/p=(\w+)/)
        results.dmarc.policy = policyMatch ? policyMatch[1] : 'unknown'
        out.status('success', `Policy: ${results.dmarc.policy}`)
        const display = dmarcRecord.length > 60 ? dmarcRecord.slice(0, 60) + '...' : dmarcRecord
        out.log(`  ${colors.gray(display)}`)
      } else {
        out.status('error', 'No DMARC record found')
      }
    } catch {
      out.status('warning', 'No DMARC record found')
    }
    out.blank()

    // DKIM Record
    out.subtitle(`🔑 DKIM Record (selector: ${selector})`)
    try {
      const dkimRecords = await dns.resolveTxt(`${selector}._domainkey.${domain}`)
      const dkimRecord = dkimRecords.flat().join('')
      if (dkimRecord && dkimRecord.includes('v=DKIM1')) {
        results.dkim.record = dkimRecord
        out.status('success', `DKIM found for selector "${selector}"`)
        const display = dkimRecord.length > 60 ? dkimRecord.slice(0, 60) + '...' : dkimRecord
        out.log(`  ${colors.gray(display)}`)
      } else {
        out.status('warning', `No DKIM record for selector "${selector}"`)
      }
    } catch {
      out.status('warning', `No DKIM record for selector "${selector}"`)
    }
    out.blank()

    // Summary
    const score = [
      results.mx.records ? 25 : 0,
      results.spf.valid ? 25 : 0,
      results.dmarc.record ? 25 : 0,
      results.dkim.record ? 25 : 0,
    ].reduce((a, b) => a + b, 0)

    out.subtitle('📊 Summary')
    out.grade(score >= 75 ? 'A' : score >= 50 ? 'B' : score >= 25 ? 'C' : 'F', score)
    out.checklist([
      { text: 'MX Records', checked: !!results.mx.records },
      { text: 'SPF', checked: results.spf.valid },
      { text: 'DMARC', checked: !!results.dmarc.record },
      { text: 'DKIM', checked: !!results.dkim.record },
    ])
    out.blank()

    if (extCtx) {
      out.response({
        domain,
        selector,
        score,
        ...results,
      }, { responseType: 'email-audit' })
    }
  }
)

// =============================================================================
// DNS Commands Schema
// =============================================================================

/**
 * DNS commands schema for the unified CLI.
 */
export const dnsCommands: RekCommandDefinition = {
  description: 'DNS tools and diagnostics',
  category: 'network',
  tuiEnabled: true,
  commands: {
    lookup: {
      description: 'Look up DNS records (A, MX, TXT, etc)',
      aliases: ['resolve'],
      positional: [
        { name: 'domain', required: true, description: 'Domain to lookup' },
        { name: 'type', required: false, default: 'A', description: 'Record type (A, AAAA, MX, TXT, NS, CNAME, SOA, ANY)' }
      ],
      examples: [
        { cmd: 'rek dns lookup google.com', desc: 'Get A records' },
        { cmd: 'rek dns lookup google.com MX', desc: 'Get MX records' }
      ],
      handler: lookupHandler
    },
    reverse: {
      description: 'Perform reverse DNS lookup (IP to hostname)',
      positional: [
        { name: 'ip', required: true, description: 'IP address to lookup' }
      ],
      examples: [
        { cmd: 'rek dns reverse 8.8.8.8', desc: 'Lookup Google DNS IP' }
      ],
      handler: reverseHandler
    },
    propagate: {
      description: 'Check global DNS propagation across multiple providers',
      positional: [
        { name: 'domain', required: true, description: 'Domain to check propagation' },
        { name: 'type', required: false, default: 'A', description: 'DNS record type' }
      ],
      examples: [
        { cmd: 'rek dns propagate example.com', desc: 'Check A record propagation' },
        { cmd: 'rek dns propagate example.com MX', desc: 'Check MX record propagation' }
      ],
      handler: propagateHandler
    },
    health: {
      description: 'Comprehensive DNS health check with scoring',
      positional: [
        { name: 'domain', required: true, description: 'Domain to check' }
      ],
      examples: [
        { cmd: 'rek dns health example.com', desc: 'Run full DNS health check' }
      ],
      handler: healthHandler
    },
    spf: {
      description: 'Validate SPF record for email authentication',
      positional: [
        { name: 'domain', required: true, description: 'Domain to validate' }
      ],
      examples: [
        { cmd: 'rek dns spf example.com', desc: 'Validate SPF record' }
      ],
      handler: spfHandler
    },
    dmarc: {
      description: 'Validate DMARC record for email authentication',
      positional: [
        { name: 'domain', required: true, description: 'Domain to validate' }
      ],
      examples: [
        { cmd: 'rek dns dmarc example.com', desc: 'Validate DMARC record' }
      ],
      handler: dmarcHandler
    },
    dkim: {
      description: 'Check DKIM record for email signing',
      positional: [
        { name: 'domain', required: true, description: 'Domain to check' }
      ],
      options: {
        selector: {
          short: 's',
          type: 'string',
          default: 'default',
          description: 'DKIM selector'
        }
      },
      examples: [
        { cmd: 'rek dns dkim example.com', desc: 'Check with default selector' },
        { cmd: 'rek dns dkim example.com -s google', desc: 'Check Google selector' }
      ],
      handler: dkimHandler
    },
    system: {
      description: 'Show system DNS configuration (OS-level)',
      aliases: ['status'],
      examples: [
        { cmd: 'rek dns system', desc: 'Show current DNS servers' }
      ],
      handler: systemHandler
    },
    dig: {
      description: 'DNS lookup utility (like the real dig)',
      positional: [
        { name: 'domain', required: false, description: 'Domain to lookup' }
      ],
      options: {
        server: {
          short: 's',
          type: 'string',
          description: 'DNS server to query'
        },
        type: {
          short: 't',
          type: 'string',
          default: 'A',
          description: 'Record type'
        }
      },
      examples: [
        { cmd: 'rek dns dig google.com', desc: 'Simple A lookup' },
        { cmd: 'rek dns dig google.com MX', desc: 'MX record lookup' },
        { cmd: 'rek dns dig @8.8.8.8 google.com', desc: 'Query specific server' }
      ],
      handler: digHandler
    },
    email: {
      description: 'Full email security audit (SPF + DMARC + DKIM + MX)',
      positional: [
        { name: 'domain', required: true, description: 'Domain to audit' }
      ],
      options: {
        selector: {
          short: 's',
          type: 'string',
          default: 'default',
          description: 'DKIM selector'
        }
      },
      examples: [
        { cmd: 'rek dns email example.com', desc: 'Full email security audit' },
        { cmd: 'rek dns email example.com -s google', desc: 'Audit with Google DKIM selector' }
      ],
      handler: emailAuditHandler
    }
  }
}
