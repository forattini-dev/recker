/**
 * AI CLI Commands
 *
 * This file registers AI commands with the CLI router.
 * Uses unified handler for core functionality.
 */

import { RekCommand as Command } from '../router.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import colors from '../../utils/colors.js';
import { loadEnvFile } from '../helpers.js';
import { aiChatHandler } from '../handlers/ai.js';

export function registerAiCommand(program: Command) {
  program
    .command('ai')
    .alias('chat')
    .alias('ask')
    .description('Chat with AI models (OpenAI, Claude, Groq, etc)')
    .argument('<preset>', 'AI preset to use (e.g., @openai, @anthropic, @groq)')
    .argument('<prompt...>', 'The prompt text')
    .option('model', {
      type: 'string',
      short: 'm',
      description: 'Override default model',
    })
    .option('temperature', {
      type: 'string',
      short: 't',
      default: '0.7',
      description: 'Temperature (0-1)',
    })
    .option('max-tokens', {
      type: 'string',
      default: '2048',
      description: 'Max tokens in response',
    })
    .option('wait', {
      short: 'w',
      description: 'Wait for full response (disable streaming)',
    })
    .option('env', {
      type: 'string',
      short: 'e',
      description: 'Load .env file path',
    })
    .addHelpText('after', `
${colors.bold(colors.blue('What it does:'))}
  Sends a prompt to an AI language model and streams the response back.
  Supports all major AI providers including OpenAI, Anthropic, Google, Groq,
  Mistral, and more. API keys are loaded from environment variables.

${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek ai @openai "What is the capital of France?"')}
  ${colors.green('$ rek ai @anthropic "Explain quantum computing" -m claude-sonnet-4-20250514')}
  ${colors.green('$ rek ai @groq "Write a haiku" --wait')}

${colors.bold(colors.yellow('Available AI Presets:'))}
  ${colors.cyan('@openai')}       OpenAI (GPT-4o, GPT-5.1)
  ${colors.cyan('@anthropic')}    Anthropic (Claude)
  ${colors.cyan('@groq')}         Groq (fast inference)
  ${colors.cyan('@google')}       Google (Gemini)
  ${colors.cyan('@xai')}          xAI (Grok)
  ${colors.cyan('@mistral')}      Mistral AI
  ${colors.cyan('@cohere')}       Cohere
  ${colors.cyan('@deepseek')}     DeepSeek
`)
    .example('rek ai @openai "What is the capital of France?"', 'Ask OpenAI')
    .example('rek ai @anthropic "Explain quantum" -m claude-sonnet-4-20250514', 'Use specific model')
    .example('rek ai @groq "Write a haiku" --wait', 'Wait for full response')
    .action(async (preset: string, promptParts: string[], rawArgs: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};

      // Load .env file if specified or auto-load from cwd
      if (options.env) {
        await loadEnvFile(options.env);
      } else {
        try {
          const envFilePath = join(process.cwd(), '.env');
          await fs.access(envFilePath);
          await loadEnvFile(true);
        } catch {
          // .env doesn't exist, that's fine
        }
      }

      // Join prompt parts
      const prompt = Array.isArray(promptParts) ? promptParts.join(' ') : promptParts;

      // Create execution context and call unified handler
      const ctx = {
        result: {
          command: ['ai'],
          positional: { preset, prompt },
          options: {
            model: options.model,
            temperature: options.temperature || '0.7',
            maxTokens: options['max-tokens'] || '2048',
            wait: !!options.wait,
            json: !!options.json,
          },
          data: {},
          headers: {},
          errors: [],
          rest: rawArgs,
        },
        rawArgs,
        tui: undefined,
        isTui: false,
      };

      await aiChatHandler(ctx as any);
    });
}
