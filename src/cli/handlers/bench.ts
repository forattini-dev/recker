/**
 * Bench Commands (Unified)
 *
 * Load testing and benchmarking tools migrated to the unified command system.
 * Note: Load testing uses TUI dashboard, so it's primarily CLI-focused.
 */

import type { RekCommandDefinition, RekHandler } from '../handler-types.js'
import {
  createEnhancedOutput,
  getString,
  getNumber,
  getBoolean,
  colors,
} from '../output.js'

// =============================================================================
// Load Test Handler
// =============================================================================

export const loadTestHandler: RekHandler = async (ctx) => {
  const out = createEnhancedOutput(ctx)

  let url = getString(ctx.result.positional.url)
  const users = getNumber(ctx.result.options.users, 50)
  const duration = getNumber(ctx.result.options.duration, 300)
  const rampUp = getNumber(ctx.result.options.ramp, 5)
  const mode = getString(ctx.result.options.mode, 'throughput')
  const http2 = getBoolean(ctx.result.options.http2)
  const insecure = getBoolean(ctx.result.options.insecure)

  if (!url) {
    out.error('URL is required')
    if (!ctx.isTui) process.exit(1)
    return
  }

  if (!url.startsWith('http')) url = `https://${url}`

  // Load testing with TUI dashboard - not supported in shell context
  if (ctx.isTui && ctx.tui) {
    out.response({
      error: 'Load testing uses an interactive TUI dashboard',
      hint: `Use CLI directly: rek load ${url} -u ${users} -d ${duration}`,
    }, { responseType: 'load-error' })
    return
  }

  try {
    const { startLoadDashboard } = await import('../tui/load-dashboard.js')

    await startLoadDashboard({
      url,
      users,
      duration,
      mode: mode as 'throughput' | 'stress' | 'realistic',
      http2,
      insecure,
      rampUp,
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    out.error(`Load test failed: ${message}`)
    if (!ctx.isTui) process.exit(1)
  }
}

// =============================================================================
// Command Definitions
// =============================================================================

export const benchCommands: RekCommandDefinition = {
  description: 'Performance benchmarking tools',
  category: 'bench',
  tuiEnabled: false, // TUI dashboard doesn't work in shell context
  commands: {
    'load': {
      description: 'Run a load test with real-time dashboard',
      positional: [
        { name: 'url', required: true, description: 'Target URL to load test' }
      ],
      options: {
        users: { short: 'u', type: 'number', default: 50, description: 'Number of concurrent users' },
        duration: { short: 'd', type: 'number', default: 300, description: 'Test duration in seconds' },
        ramp: { short: 'r', type: 'number', default: 5, description: 'Ramp-up time in seconds' },
        mode: { short: 'm', type: 'string', default: 'throughput', description: 'Test mode (throughput/stress/realistic)' },
        http2: { type: 'boolean', description: 'Force HTTP/2 protocol' },
        insecure: { short: 'k', type: 'boolean', description: 'Allow insecure SSL/TLS' },
      },
      examples: [
        { cmd: 'rek load httpbin.org/get -u 100 -d 60', desc: '100 users for 60 seconds' },
        { cmd: 'rek load api.com/heavy --mode stress', desc: 'Run stress test' },
      ],
      handler: loadTestHandler
    },
    'bench load': {
      description: 'Run a load test with real-time dashboard',
      positional: [
        { name: 'url', required: true, description: 'Target URL to load test' }
      ],
      options: {
        users: { short: 'u', type: 'number', default: 50, description: 'Number of concurrent users' },
        duration: { short: 'd', type: 'number', default: 300, description: 'Test duration in seconds' },
        ramp: { short: 'r', type: 'number', default: 5, description: 'Ramp-up time in seconds' },
        mode: { short: 'm', type: 'string', default: 'throughput', description: 'Test mode' },
        http2: { type: 'boolean', description: 'Force HTTP/2 protocol' },
        insecure: { short: 'k', type: 'boolean', description: 'Allow insecure SSL/TLS' },
      },
      examples: [
        { cmd: 'rek bench load httpbin.org/get -u 100 -d 60', desc: '100 users for 60s' },
      ],
      handler: loadTestHandler
    }
  }
}
