/**
 * Security Commands (Unified)
 *
 * Security analysis tools migrated to the unified command system.
 * These handlers work in both CLI and TUI modes.
 */

import type { RekCommandDefinition, RekHandler } from '../handler-types.js'
import {
  withHandler,
  getString,
  colors,
} from '../output.js'

/**
 * Normalize URL (add https:// if missing)
 */
function normalizeUrl(url: string): string {
  return url.startsWith('http') ? url : `https://${url}`
}

// =============================================================================
// Security Headers Handler
// =============================================================================

export const securityHeadersHandler: RekHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let url = getString(ctx.result.positional.url)

    if (!url) {
      // Try to get base URL from shell context
      if (extCtx?.baseUrl) {
        const base = extCtx.baseUrl()
        if (base) {
          url = base
        } else {
          out.error('Usage: security <url> or set base URL first')
          return
        }
      } else {
        out.error('URL is required')
        return
      }
    }

    url = normalizeUrl(url)

    out.log(colors.gray(`Analyzing security headers for ${url}...`))

    const { createClient } = await import('../../core/client.js')
    const { analyzeSecurityHeaders } = await import('../../utils/security-grader.js')

    const origin = new URL(url).origin
    const client = extCtx?.client || createClient({ baseUrl: origin })
    const res = await client.get(url)
    const report = analyzeSecurityHeaders(res.headers)

    // Track in shell context
    if (extCtx) {
      out.response({
        url,
        grade: report.grade,
        score: report.score,
        details: report.details,
      }, { responseType: 'security' })
    } else {
      // CLI output
      out.title('Security Headers Report', '🛡️')
      out.grade(report.grade, report.score)
      out.blank()
      out.section('Details')

      for (const item of report.details as Array<{ header: string; status: string; value?: string; message?: string }>) {
        const icon = item.status === 'pass' ? colors.green('✔') : item.status === 'warn' ? colors.yellow('⚠') : colors.red('✖')
        const headerName = colors.bold(item.header)
        const value = item.value ? colors.gray(`= ${item.value.length > 50 ? item.value.slice(0, 47) + '...' : item.value}`) : colors.gray('(missing)')

        out.log(`  ${icon} ${headerName} ${value}`)
        if (item.status !== 'pass' && item.message) {
          out.log(`      ${colors.red('→')} ${item.message}`)
        }
      }
      out.blank()
    }
  }
)

/**
 * Security command definition for unified CLI
 */
export const securityCommands: RekCommandDefinition = {
  description: 'Security analysis tools',
  category: 'security',
  tuiEnabled: true,
  commands: {
    security: {
      description: 'Grade security headers (A+ to F)',
      aliases: ['headers', 'grade'],
      positional: [
        { name: 'url', required: true, description: 'URL to analyze' }
      ],
      examples: [
        { cmd: 'rek security github.com', desc: 'Grade GitHub headers' },
        { cmd: 'rek security example.com --json', desc: 'Get JSON report' },
      ],
      handler: securityHeadersHandler
    }
  }
}
