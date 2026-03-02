import readline from 'node:readline';
import colors from '../../utils/colors.js';
import { createClient } from '../../core/client.js';
import { resolvePreset } from '../presets.js';
import type { Client } from '../../core/client.js';

// AI presets that support chat
const AI_PRESETS = [
  'openai', 'anthropic', 'groq', 'google', 'xai',
  'mistral', 'cohere', 'deepseek', 'fireworks', 'together', 'perplexity'
];

// Environment variable mapping for API keys
const ENV_VAR_MAP: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  groq: 'GROQ_API_KEY',
  xai: 'XAI_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  cohere: 'COHERE_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
  together: 'TOGETHER_API_KEY',
  perplexity: 'PERPLEXITY_API_KEY',
};

export interface AIMode {
  /** Shared AI clients map (for memory persistence) */
  aiClients: Map<string, Client>;
  /** Shell variables (for env overrides) */
  variables?: Record<string, any>;
}

/**
 * Interactive AI Chat Mode
 *
 * Features:
 * - Shared memory with @preset quick chat (via aiClients map)
 * - Switch providers on-the-fly with /switch
 * - Clear memory with /clear
 * - Exit with /exit, ESC, or Ctrl+C
 * - Shows memory status after each response
 */
export async function startAIChat(
  rl: readline.Interface,
  provider: string = 'openai',
  context: AIMode
) {
  let currentProvider = provider.toLowerCase();

  // Validate provider
  if (!AI_PRESETS.includes(currentProvider)) {
    console.log(colors.red(`Unknown AI provider: ${currentProvider}`));
    console.log(colors.gray(`Available: ${AI_PRESETS.join(', ')}`));
    return;
  }

  console.clear();
  printHeader(currentProvider);

  // Get or create client for current provider
  let client = await getOrCreateClient(currentProvider, context);
  if (!client) return;

  const getPrompt = () => colors.magenta(`${currentProvider} › `);
  rl.setPrompt(getPrompt());
  rl.prompt();

  // Track if we're currently generating (to handle ESC during generation)
  let isGenerating = false;
  let abortController: AbortController | null = null;

  return new Promise<void>((resolve) => {
    const cleanup = () => {
      rl.off('line', onLine);
      rl.off('SIGINT', onSigInt);
      if (process.stdin.isTTY) {
        process.stdin.off('keypress', onKeypress);
      }
      console.log('');
      console.log(colors.gray('Exiting AI mode...'));
    };

    const onLine = async (line: string) => {
      const input = line.trim();

      if (!input) {
        rl.prompt();
        return;
      }

      // Handle commands
      if (input.startsWith('/')) {
        const handled = await handleCommand(input, currentProvider, client!, context, rl, () => {
          cleanup();
          resolve();
        }, async (newProvider: string) => {
          // Switch provider callback
          currentProvider = newProvider;
          client = await getOrCreateClient(currentProvider, context);
          if (client) {
            rl.setPrompt(getPrompt());
            console.log(colors.green(`Switched to ${currentProvider}`));
            const memory = client.ai.getMemory();
            if (memory.length > 0) {
              console.log(colors.gray(`Memory: ${Math.floor(memory.length / 2)} pairs`));
            }
          }
          rl.prompt();
        });

        if (handled) return;
      }

      // Send message to AI
      if (!client || !client.hasAI) {
        console.log(colors.red('AI client not available'));
        rl.prompt();
        return;
      }

      // Pause RL while generating
      rl.pause();
      isGenerating = true;
      abortController = new AbortController();

      // Show model info
      const model = (client as any)._aiConfig?.model || currentProvider;
      process.stdout.write(colors.gray(`${model} › `));

      try {
        const stream = await client.ai.chatStream(input);
        let hasContent = false;

        for await (const event of stream) {
          // Check for abort
          if (abortController?.signal.aborted) {
            console.log(colors.yellow('\n[Interrupted]'));
            break;
          }

          if (event.type === 'text') {
            if (!hasContent) {
              // First content - start on new line with color
              process.stdout.write('\n' + colors.orange(event.content));
              hasContent = true;
            } else {
              process.stdout.write(colors.orange(event.content));
            }
          } else if (event.type === 'error') {
            console.log(colors.red(`\nError: ${event.error}`));
          }
        }

        // Show memory status
        console.log(colors.reset(''));
        const memory = client.ai.getMemory();
        const pairs = Math.floor(memory.length / 2);
        console.log(colors.gray(`Memory: ${pairs}/12 pairs`));

      } catch (error: any) {
        handleError(error, currentProvider);
      } finally {
        isGenerating = false;
        abortController = null;
        rl.resume();
        rl.prompt();
      }
    };

    // Handle ESC key to exit (or abort generation)
    const onKeypress = (_str: string, key: { name: string; ctrl?: boolean; sequence?: string }) => {
      if (key && key.name === 'escape') {
        if (isGenerating && abortController) {
          // Abort current generation
          abortController.abort();
        } else {
          // Exit AI mode
          cleanup();
          resolve();
        }
      }
    };

    // Setup keypress handler for ESC
    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.on('keypress', onKeypress);
    }

    rl.on('line', onLine);

    // Handle Ctrl+C - exit chat but keep shell
    const onSigInt = () => {
      if (isGenerating && abortController) {
        abortController.abort();
      } else {
        cleanup();
        resolve();
      }
    };
    rl.once('SIGINT', onSigInt);
  });
}

/**
 * Get or create AI client for provider
 */
async function getOrCreateClient(provider: string, context: AIMode): Promise<Client | null> {
  // Check if we already have a client
  let client = context.aiClients.get(provider);

  if (client) {
    return client;
  }

  // Try to resolve preset
  try {
    const presetConfig = await resolvePreset(provider, { throwOnError: true });

    if (!presetConfig) {
      console.log(colors.red(`Unknown preset: ${provider}`));
      return null;
    }

    if (!(presetConfig as any)._aiConfig) {
      console.log(colors.red(`Preset ${provider} does not support AI features.`));
      return null;
    }

    client = createClient(presetConfig as any);
    context.aiClients.set(provider, client);
    return client;

  } catch (error: any) {
    // Check for missing API key
    const envVar = ENV_VAR_MAP[provider] || `${provider.toUpperCase()}_API_KEY`;
    console.log(colors.red(`Failed to initialize ${provider}`));
    console.log(colors.gray(`Make sure ${envVar} is set.`));
    return null;
  }
}

/**
 * Handle slash commands
 */
async function handleCommand(
  input: string,
  currentProvider: string,
  client: Client,
  context: AIMode,
  rl: readline.Interface,
  onExit: () => void,
  onSwitch: (provider: string) => Promise<void>
): Promise<boolean> {
  const parts = input.slice(1).split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case 'exit':
    case 'quit':
    case 'q':
      onExit();
      return true;

    case 'clear':
      if (client?.hasAI) {
        client.ai.clearMemory();
        console.log(colors.green(`Memory cleared for ${currentProvider}`));
      }
      rl.prompt();
      return true;

    case 'switch':
    case 's':
      const newProvider = args[0]?.toLowerCase();
      if (!newProvider) {
        console.log(colors.yellow('Usage: /switch <provider>'));
        console.log(colors.gray(`Available: ${AI_PRESETS.join(', ')}`));
        rl.prompt();
        return true;
      }
      if (!AI_PRESETS.includes(newProvider)) {
        console.log(colors.red(`Unknown provider: ${newProvider}`));
        console.log(colors.gray(`Available: ${AI_PRESETS.join(', ')}`));
        rl.prompt();
        return true;
      }
      await onSwitch(newProvider);
      return true;

    case 'model':
    case 'm':
      const model = (client as any)?._aiConfig?.model || 'default';
      console.log(colors.cyan(`Current model: ${model}`));
      console.log(colors.gray('Note: Model is set by the preset configuration.'));
      rl.prompt();
      return true;

    case 'memory':
    case 'mem':
      if (client?.hasAI) {
        const memory = client.ai.getMemory();
        const pairs = Math.floor(memory.length / 2);
        console.log(colors.cyan(`Memory: ${pairs}/12 pairs (${memory.length} messages)`));
        if (pairs > 0) {
          console.log(colors.gray('Last exchange:'));
          const lastTwo = memory.slice(-2);
          for (const msg of lastTwo) {
            const role = msg.role === 'user' ? colors.magenta('You') : colors.orange('AI');
            const preview = msg.content.slice(0, 100) + (msg.content.length > 100 ? '...' : '');
            console.log(`  ${role}: ${colors.gray(preview)}`);
          }
        }
      }
      rl.prompt();
      return true;

    case 'providers':
    case 'list':
      console.log(colors.cyan('Available AI providers:'));
      for (const p of AI_PRESETS) {
        const isActive = p === currentProvider ? colors.green(' (active)') : '';
        const hasClient = context.aiClients.has(p) ? colors.gray(' [loaded]') : '';
        console.log(`  ${p}${isActive}${hasClient}`);
      }
      rl.prompt();
      return true;

    case 'help':
    case 'h':
    case '?':
      printHelp();
      rl.prompt();
      return true;

    default:
      console.log(colors.yellow(`Unknown command: /${cmd}`));
      console.log(colors.gray('Type /help for available commands'));
      rl.prompt();
      return true;
  }
}

/**
 * Handle AI errors
 */
function handleError(error: any, provider: string) {
  if (error.message?.includes('API key') || error.message?.includes('401') || error.message?.includes('Unauthorized')) {
    const envVar = ENV_VAR_MAP[provider] || `${provider.toUpperCase()}_API_KEY`;
    console.log(colors.red(`\nAuthentication error for ${provider}`));
    console.log(colors.gray(`Set ${envVar} environment variable.`));
  } else if (error.message?.includes('429') || error.message?.includes('rate limit')) {
    console.log(colors.yellow(`\nRate limited by ${provider}. Wait a moment and try again.`));
  } else {
    console.log(colors.red(`\nError: ${error.message || error}`));
  }
}

/**
 * Print mode header
 */
function printHeader(provider: string) {
  console.log(colors.bold(colors.cyan('Rek AI Mode')));
  console.log('');
  console.log(`  ${colors.gray('Provider:')} ${colors.white(provider)}`);
  console.log('');
  console.log(`  ${colors.green('/switch')} ${colors.gray('<provider>')}  ${colors.gray('Change AI provider')}`);
  console.log(`  ${colors.green('/clear')}              ${colors.gray('Clear conversation memory')}`);
  console.log(`  ${colors.green('/memory')}             ${colors.gray('Show memory status')}`);
  console.log(`  ${colors.green('/help')}               ${colors.gray('Show all commands')}`);
  console.log('');
  console.log(`  ${colors.yellow('ESC')} ${colors.gray('or')} ${colors.yellow('/exit')}          ${colors.gray('Exit AI mode')}`);
  console.log('');
  console.log(colors.gray('─'.repeat(50)));
  console.log('');
}

/**
 * Print help
 */
function printHelp() {
  console.log(`
${colors.bold(colors.cyan('AI Mode Commands'))}

  ${colors.green('/switch <provider>')}  Switch to another AI provider
  ${colors.green('/clear')}              Clear conversation memory
  ${colors.green('/memory')}             Show memory status
  ${colors.green('/model')}              Show current model
  ${colors.green('/providers')}          List available providers
  ${colors.green('/help')}               Show this help
  ${colors.green('/exit')}               Exit AI mode

${colors.bold('Shortcuts')}
  ${colors.gray('ESC')}                  Exit AI mode (or abort generation)
  ${colors.gray('Ctrl+C')}               Exit AI mode

${colors.bold('Available Providers')}
  ${AI_PRESETS.join(', ')}
`);
}
