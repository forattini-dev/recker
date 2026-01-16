import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRekCLI, createOutput, type RekHandler, type RekCLISchema, type TuiContext } from '../../../src/cli/handlers.js'

describe('Unified CLI Registry', () => {
  describe('createRekCLI', () => {
    it('should create a CLI with commands', () => {
      const cli = createRekCLI({
        name: 'test',
        commands: {
          hello: {
            description: 'Say hello'
          }
        }
      })

      expect(cli.schema.name).toBe('test')
      expect(cli.schema.commands).toBeDefined()
      expect(cli.schema.commands?.hello).toBeDefined()
    })

    it('should parse arguments correctly', () => {
      const cli = createRekCLI({
        name: 'test',
        commands: {
          greet: {
            description: 'Greet someone',
            positional: [
              { name: 'name', required: true }
            ],
            options: {
              loud: { type: 'boolean', short: 'l' }
            }
          }
        }
      })

      const result = cli.parse(['greet', 'world', '--loud'])

      expect(result.command).toEqual(['greet'])
      expect(result.positional.name).toBe('world')
      expect(result.options.loud).toBe(true)
    })

    it('should handle HTTPie-style separators', () => {
      const cli = createRekCLI({
        name: 'test',
        commands: {
          request: {
            description: 'Make request',
            positional: [{ name: 'url', required: true }]
          }
        }
      })

      const result = cli.parse(['request', 'https://api.com', 'name=John', 'age:=30', 'Authorization:Bearer token'])

      expect(result.command).toEqual(['request'])
      expect(result.positional.url).toBe('https://api.com')
      expect(result.data).toEqual({ name: 'John', age: 30 })
      expect(result.headers).toEqual({ Authorization: 'Bearer token' })
    })

    it('should handle presets (remove +name from args)', () => {
      const cli = createRekCLI({
        name: 'test',
        commands: {
          api: {
            description: 'API call',
            positional: [{ name: 'endpoint' }]
          }
        }
      })

      const result = cli.parse(['+openai', 'api', '/v1/models'])

      expect(result.command).toEqual(['api'])
      expect(result.positional.endpoint).toBe('/v1/models')
    })

    it('should execute handler in CLI mode', async () => {
      const handler = vi.fn<[any], void>()

      const cli = createRekCLI({
        name: 'test',
        commands: {
          hello: {
            description: 'Say hello',
            handler
          }
        }
      })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await cli.run(['hello'])

      expect(handler).toHaveBeenCalledTimes(1)
      const ctx = handler.mock.calls[0][0]
      expect(ctx.isTui).toBe(false)
      expect(ctx.tui).toBeUndefined()

      consoleSpy.mockRestore()
    })

    it('should execute handler in TUI mode with context', async () => {
      const handler = vi.fn<[any], void>()

      const cli = createRekCLI({
        name: 'test',
        commands: {
          hello: {
            description: 'Say hello',
            handler
          }
        }
      })

      const tuiContext: TuiContext = {
        setOutput: vi.fn(),
        appendOutput: vi.fn(),
        setError: vi.fn(),
        clear: vi.fn(),
        exit: vi.fn(),
        isRunning: true
      }

      await cli.runTui(['hello'], tuiContext)

      expect(handler).toHaveBeenCalledTimes(1)
      const ctx = handler.mock.calls[0][0]
      expect(ctx.isTui).toBe(true)
      expect(ctx.tui).toBe(tuiContext)
    })

    it('should show help when no command matches and no handler', async () => {
      const cli = createRekCLI({
        name: 'test',
        commands: {}
      })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const result = await cli.run(['nonexistent'])

      // When no handler is found, it shows help (which is success)
      // The 'nonexistent' arg goes to positional/rest, not as command
      expect(result.success).toBe(true)
      expect(result.commandPath).toEqual([])

      consoleSpy.mockRestore()
    })

    it('should fail when handler throws', async () => {
      const cli = createRekCLI({
        name: 'test',
        commands: {
          fail: {
            description: 'Always fails',
            handler: async () => {
              throw new Error('Intentional failure')
            }
          }
        }
      })

      const result = await cli.run(['fail'])

      expect(result.success).toBe(false)
      expect(result.error).toBe('Intentional failure')
    })

    it('should handle nested subcommands', async () => {
      const innerHandler = vi.fn<[any], void>()

      const cli = createRekCLI({
        name: 'test',
        commands: {
          dns: {
            description: 'DNS tools',
            commands: {
              lookup: {
                description: 'DNS lookup',
                positional: [{ name: 'domain', required: true }],
                handler: innerHandler
              }
            }
          }
        }
      })

      await cli.run(['dns', 'lookup', 'google.com'])

      expect(innerHandler).toHaveBeenCalledTimes(1)
      const ctx = innerHandler.mock.calls[0][0]
      expect(ctx.result.command).toEqual(['dns', 'lookup'])
      expect(ctx.result.positional.domain).toBe('google.com')
    })
  })

  describe('createOutput', () => {
    it('should route to console in CLI mode', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const out = createOutput({
        result: { command: [], positional: {}, options: {}, errors: [], rest: [] },
        rawArgs: [],
        isTui: false
      })

      out.log('hello')
      out.error('oops')

      expect(consoleSpy).toHaveBeenCalledWith('hello')
      expect(errorSpy).toHaveBeenCalledWith('oops')

      consoleSpy.mockRestore()
      errorSpy.mockRestore()
    })

    it('should route to TUI signals in TUI mode', () => {
      const tuiContext: TuiContext = {
        setOutput: vi.fn(),
        appendOutput: vi.fn(),
        setError: vi.fn(),
        clear: vi.fn(),
        exit: vi.fn(),
        isRunning: true
      }

      const out = createOutput({
        result: { command: [], positional: {}, options: {}, errors: [], rest: [] },
        rawArgs: [],
        tui: tuiContext,
        isTui: true
      })

      out.log('hello')
      out.error('oops')

      expect(tuiContext.appendOutput).toHaveBeenCalledWith('hello\n')
      expect(tuiContext.setError).toHaveBeenCalledWith('oops')
    })

    it('should handle JSON output', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const out = createOutput({
        result: { command: [], positional: {}, options: {}, errors: [], rest: [] },
        rawArgs: [],
        isTui: false
      })

      out.json({ name: 'test', value: 42 })

      expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify({ name: 'test', value: 42 }, null, 2))

      consoleSpy.mockRestore()
    })
  })

  describe('help and completion', () => {
    it('should generate help text', () => {
      const cli = createRekCLI({
        name: 'test',
        description: 'Test CLI',
        commands: {
          hello: {
            description: 'Say hello'
          }
        }
      })

      const help = cli.help()

      expect(help).toContain('test')
      expect(help).toContain('hello')
    })

    it('should generate shell completion', () => {
      const cli = createRekCLI({
        name: 'test',
        commands: {
          hello: {
            description: 'Say hello'
          }
        }
      })

      const bashCompletion = cli.completion('bash')
      const zshCompletion = cli.completion('zsh')
      const fishCompletion = cli.completion('fish')

      expect(bashCompletion).toContain('complete')
      expect(zshCompletion).toContain('compdef')
      expect(fishCompletion).toContain('complete -c')
    })
  })
})
