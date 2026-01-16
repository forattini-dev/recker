import { RekCommand as Command } from '../router.js'
import { generateCompletion } from 'cli-args-parser'
import colors from '../../utils/colors.js'

/**
 * Build CLI schema for completion generation
 * This represents the full command structure of rek
 */
function buildCLISchema() {
  return {
    name: 'rek',
    description: 'Multi-Protocol SDK CLI - HTTP, DNS, WebSocket, and more',
    options: {
      verbose: { short: 'v', type: 'boolean' as const, description: 'Verbose output' },
      quiet: { short: 'q', type: 'boolean' as const, description: 'Quiet mode (body only)' },
      output: { short: 'o', type: 'string' as const, description: 'Output file path' },
      json: { short: 'j', type: 'boolean' as const, description: 'Force JSON output' },
      env: { short: 'e', type: 'string' as const, description: 'Load .env file' },
      help: { short: 'h', type: 'boolean' as const, description: 'Show help' },
      version: { short: 'V', type: 'boolean' as const, description: 'Show version' }
    },
    commands: {
      serve: {
        description: 'Start mock servers',
        commands: {
          http: { description: 'Start HTTP mock server' },
          ws: { description: 'Start WebSocket mock server' },
          dns: { description: 'Start DNS mock server' },
          whois: { description: 'Start WHOIS mock server' },
          hls: { description: 'Start HLS mock server' },
          sse: { description: 'Start SSE mock server' },
          ftp: { description: 'Start FTP mock server' },
          telnet: { description: 'Start Telnet mock server' }
        }
      },
      seo: {
        description: 'SEO analysis tools',
        commands: {
          analyze: { description: 'Analyze URL for SEO issues' },
          spider: { description: 'Crawl and analyze site' }
        }
      },
      ai: {
        description: 'AI chat interface',
        commands: {
          chat: { description: 'Start AI chat' },
          embed: { description: 'Generate embeddings' },
          providers: { description: 'List AI providers' }
        }
      },
      mcp: {
        description: 'MCP server for AI agents'
      },
      security: {
        description: 'Security analysis tools',
        commands: {
          headers: { description: 'Check security headers' },
          audit: { description: 'Full security audit' }
        }
      },
      video: {
        description: 'Video information tools',
        commands: {
          info: { description: 'Get video info' },
          formats: { description: 'List video formats' },
          check: { description: 'Check video availability' }
        }
      },
      dns: {
        description: 'DNS lookup tools',
        commands: {
          lookup: { description: 'DNS lookup' },
          propagate: { description: 'Check DNS propagation' },
          health: { description: 'DNS health check' }
        }
      },
      network: {
        description: 'Network diagnostic tools',
        commands: {
          ip: { description: 'IP information' },
          tls: { description: 'TLS certificate info' },
          whois: { description: 'WHOIS lookup' },
          rdap: { description: 'RDAP lookup' }
        }
      },
      protocols: {
        description: 'Protocol clients',
        commands: {
          ftp: { description: 'FTP client' },
          sftp: { description: 'SFTP client' },
          telnet: { description: 'Telnet client' },
          websocket: { description: 'WebSocket client' }
        }
      },
      completion: {
        description: 'Generate shell completion scripts'
      },
      shell: {
        description: 'Interactive REPL shell'
      }
    }
  }
}

export function registerCompletionCommand(program: Command) {
  program
    .command('completion')
    .description('Generate shell completion scripts for bash, zsh, or fish')
    .argument('[shell]', {
      type: 'string',
      description: 'Shell type (bash, zsh, fish)',
      example: 'bash'
    })
    .option('install', {
      type: 'boolean',
      short: 'i',
      description: 'Print installation instructions'
    })
    .example('rek completion bash', 'Generate Bash completion script')
    .example('rek completion zsh', 'Generate Zsh completion script')
    .example('rek completion fish', 'Generate Fish completion script')
    .example('rek completion bash >> ~/.bashrc', 'Install Bash completion')
    .action(async (...params: any[]) => {
      // RekCommand passes: positional args..., remaining args array, command object
      // For `completion [shell]`: shell might be first positional or in args array
      const cmdObj = params[params.length - 1]
      const options = cmdObj?.opts ? cmdObj.opts() : {}
      const validShells = ['bash', 'zsh', 'fish']

      // Get shell from first positional arg
      let shell: string | undefined
      if (typeof params[0] === 'string' && validShells.includes(params[0].toLowerCase())) {
        shell = params[0]
      } else if (Array.isArray(params[0]) && params[0].length > 0) {
        shell = params[0][0]
      }

      if (!shell) {
        if (options.install) {
          console.log(colors.cyan('Shell Completion Installation'))
          console.log('')
          console.log(colors.yellow('Bash:'))
          console.log('  rek completion bash >> ~/.bashrc')
          console.log('  source ~/.bashrc')
          console.log('')
          console.log(colors.yellow('Zsh:'))
          console.log('  rek completion zsh >> ~/.zshrc')
          console.log('  source ~/.zshrc')
          console.log('')
          console.log(colors.yellow('Fish:'))
          console.log('  rek completion fish > ~/.config/fish/completions/rek.fish')
          console.log('')
          return
        }

        console.log(colors.cyan('Usage:') + ' rek completion <shell>')
        console.log('')
        console.log(colors.grey('Available shells:'))
        console.log('  bash    Bash shell completion')
        console.log('  zsh     Zsh shell completion')
        console.log('  fish    Fish shell completion')
        console.log('')
        console.log(colors.grey('Options:'))
        console.log('  -i, --install    Show installation instructions')
        return
      }

      const shellLower = shell.toLowerCase()

      if (!validShells.includes(shellLower)) {
        console.error(colors.red(`Error: Unknown shell '${shell}'`))
        console.error(colors.grey(`Valid shells: ${validShells.join(', ')}`))
        process.exit(1)
      }

      const schema = buildCLISchema()
      const script = generateCompletion(schema, shellLower as 'bash' | 'zsh' | 'fish')
      console.log(script)
    })
}
