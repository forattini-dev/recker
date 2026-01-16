import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getShellCli,
  executeUnifiedCommand,
  isUnifiedCommand,
  resetShellCli,
  UNIFIED_COMMANDS
} from '../../../src/cli/handlers.js'
import type { CommandContext } from '../../../src/cli/tui/executor-commands/types.js'

describe('Shell Integration', () => {
  beforeEach(() => {
    resetShellCli()
  })

  describe('isUnifiedCommand', () => {
    it('should return true for migrated commands', () => {
      // DNS and SEO are currently migrated
      expect(isUnifiedCommand('dns')).toBe(true)
      expect(isUnifiedCommand('DNS')).toBe(true) // case insensitive
      expect(isUnifiedCommand('seo')).toBe(true)
      expect(isUnifiedCommand('SEO')).toBe(true) // case insensitive
    })

    it('should return true for network commands', () => {
      expect(isUnifiedCommand('whois')).toBe(true)
      expect(isUnifiedCommand('rdap')).toBe(true)
      expect(isUnifiedCommand('ping')).toBe(true)
      expect(isUnifiedCommand('tls')).toBe(true)
      expect(isUnifiedCommand('ssl')).toBe(true)
      expect(isUnifiedCommand('ip')).toBe(true)
      expect(isUnifiedCommand('ws')).toBe(true)
    })

    it('should return true for streaming and API commands', () => {
      expect(isUnifiedCommand('hls')).toBe(true)
      expect(isUnifiedCommand('sse')).toBe(true)
      expect(isUnifiedCommand('live')).toBe(true)
      expect(isUnifiedCommand('graphql')).toBe(true)
      expect(isUnifiedCommand('gql')).toBe(true)
      expect(isUnifiedCommand('har')).toBe(true)
    })

    it('should return false for non-migrated commands', () => {
      expect(isUnifiedCommand('serve')).toBe(false)
      expect(isUnifiedCommand('unknown')).toBe(false)
      expect(isUnifiedCommand('completion')).toBe(false)
    })
  })

  describe('getShellCli', () => {
    it('should return a CLI instance', () => {
      const cli = getShellCli()
      expect(cli).toBeDefined()
      expect(cli.schema.name).toBe('rek-shell')
    })

    it('should return the same instance on multiple calls', () => {
      const cli1 = getShellCli()
      const cli2 = getShellCli()
      expect(cli1).toBe(cli2)
    })

    it('should have dns commands registered', () => {
      const cli = getShellCli()
      expect(cli.schema.commands?.dns).toBeDefined()
    })

    it('should have seo commands registered', () => {
      const cli = getShellCli()
      expect(cli.schema.commands?.seo).toBeDefined()
    })

    it('should have top-level spider command (backward compatibility)', () => {
      const cli = getShellCli()
      expect(cli.schema.commands?.spider).toBeDefined()
    })

    it('should have top-level robots command (backward compatibility)', () => {
      const cli = getShellCli()
      expect(cli.schema.commands?.robots).toBeDefined()
    })

    it('should have top-level sitemap command (backward compatibility)', () => {
      const cli = getShellCli()
      expect(cli.schema.commands?.sitemap).toBeDefined()
    })

    it('should have network commands registered', () => {
      const cli = getShellCli()
      expect(cli.schema.commands?.ping).toBeDefined()
      expect(cli.schema.commands?.tls).toBeDefined()
      expect(cli.schema.commands?.ip).toBeDefined()
      expect(cli.schema.commands?.ws).toBeDefined()
      expect(cli.schema.commands?.whois).toBeDefined()
      expect(cli.schema.commands?.rdap).toBeDefined()
    })

    it('should have streaming commands registered', () => {
      const cli = getShellCli()
      expect(cli.schema.commands?.hls).toBeDefined()
      expect(cli.schema.commands?.sse).toBeDefined()
      expect(cli.schema.commands?.live).toBeDefined()
    })

    it('should have API commands registered', () => {
      const cli = getShellCli()
      expect(cli.schema.commands?.graphql).toBeDefined()
      expect(cli.schema.commands?.har).toBeDefined()
    })
  })

  describe('executeUnifiedCommand', () => {
    it('should execute DNS lookup command', async () => {
      const historyItems: any[] = []

      const mockContext: CommandContext = {
        client: {} as any,
        addHistoryItem: vi.fn((item) => historyItems.push(item)),
        setIsLoading: vi.fn(),
        baseUrl: () => null,
        setLastResponse: vi.fn(),
        trackDns: vi.fn(),
        trackSeo: vi.fn(),
        trackSpider: vi.fn(),
        trackRequest: vi.fn(),
        trackDownload: vi.fn(),
      }

      // Execute dns lookup (will fail without network but tests the path)
      const result = await executeUnifiedCommand(mockContext, 'dns', ['lookup', 'example.com'])

      // The command should have been attempted
      expect(mockContext.setIsLoading).toHaveBeenCalled()

      // Either success with data or error (depends on network)
      expect(result).toHaveProperty('success')
    })

    it('should execute DNS subcommands', async () => {
      const mockContext: CommandContext = {
        client: {} as any,
        addHistoryItem: vi.fn(),
        setIsLoading: vi.fn(),
        baseUrl: () => null,
        setLastResponse: vi.fn(),
        trackDns: vi.fn(),
        trackSeo: vi.fn(),
        trackSpider: vi.fn(),
        trackRequest: vi.fn(),
        trackDownload: vi.fn(),
      }

      // Test that subcommands are routed correctly
      const subcommands = ['lookup', 'reverse', 'propagate', 'health', 'spf', 'dmarc', 'dkim', 'system']

      for (const sub of subcommands) {
        const result = await executeUnifiedCommand(mockContext, 'dns', [sub])
        // All should return a result (success or error)
        expect(result).toHaveProperty('success')
      }
    })

    it('should set loading state during execution', async () => {
      const setIsLoading = vi.fn()

      const mockContext: CommandContext = {
        client: {} as any,
        addHistoryItem: vi.fn(),
        setIsLoading,
        baseUrl: () => null,
        setLastResponse: vi.fn(),
        trackDns: vi.fn(),
        trackSeo: vi.fn(),
        trackSpider: vi.fn(),
        trackRequest: vi.fn(),
        trackDownload: vi.fn(),
      }

      await executeUnifiedCommand(mockContext, 'dns', ['lookup', 'test.com'])

      // Should have called setIsLoading(true) at start and setIsLoading(false) at end
      expect(setIsLoading).toHaveBeenCalledWith(true)
      expect(setIsLoading).toHaveBeenCalledWith(false)
    })
  })

  describe('UNIFIED_COMMANDS set', () => {
    it('should contain dns', () => {
      expect(UNIFIED_COMMANDS.has('dns')).toBe(true)
    })

    it('should contain seo', () => {
      expect(UNIFIED_COMMANDS.has('seo')).toBe(true)
    })

    it('should contain spider and crawl (backward compatibility)', () => {
      expect(UNIFIED_COMMANDS.has('spider')).toBe(true)
      expect(UNIFIED_COMMANDS.has('crawl')).toBe(true)
    })

    it('should contain robots and sitemap (backward compatibility)', () => {
      expect(UNIFIED_COMMANDS.has('robots')).toBe(true)
      expect(UNIFIED_COMMANDS.has('sitemap')).toBe(true)
    })

    it('should be used for routing decisions', () => {
      // This tests that the constant is properly exported and used
      for (const cmd of UNIFIED_COMMANDS) {
        expect(isUnifiedCommand(cmd)).toBe(true)
      }
    })
  })
})
