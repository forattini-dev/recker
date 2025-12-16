import { RekCommand as Command } from '../router.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import colors from '../../utils/colors.js';
import { loadEnvFile } from '../helpers.js';
import { resolvePreset } from '../presets.js';

export function registerAiCommand(program: Command) {
  program
    .command('ai')
    .alias('chat')
    .alias('ask')
    .description('Chat with AI models (OpenAI, Claude, Groq, etc)')
    .argument('<preset>', 'AI preset to use (e.g., @openai, @anthropic, @groq)')
    .argument('<prompt...>', 'The prompt and options: "prompt text" model=<model> temperature=<temp> max-tokens=<tokens> wait json env=<path>')
    .addHelpText('after', `
${colors.bold(colors.blue('What it does:'))}
  Sends a prompt to an AI language model and streams the response back.
  Supports all major AI providers including OpenAI, Anthropic, Google, Groq,
  Mistral, and more. API keys are loaded from environment variables.

  Each provider uses sensible defaults but you can override the model,
  temperature, and max tokens. Responses stream in real-time by default.

${colors.bold(colors.yellow('Options:'))}
  ${colors.cyan('model=<model>')}        Override default model
  ${colors.cyan('temperature=<temp>')}   Temperature (0-1, default: 0.7)
  ${colors.cyan('max-tokens=<tokens>')}  Max tokens in response (default: 2048)
  ${colors.cyan('wait')}                 Wait for full response (disable streaming)
  ${colors.cyan('json')}                 Output raw JSON response
  ${colors.cyan('env=<path>')}           Load .env file (auto-loads from cwd if exists)

${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek ai @openai "What is the capital of France?"')}
  ${colors.green('$ rek ai @anthropic "Explain quantum computing" model=claude-sonnet-4-20250514')}
  ${colors.green('$ rek ai @groq "Write a haiku" wait')}
  ${colors.green('$ rek ai @openai "Translate to Spanish: Hello world"')}

${colors.bold(colors.yellow('Available AI Presets:'))}
  ${colors.cyan('@openai')}       OpenAI (GPT-4o, GPT-5.1)
  ${colors.cyan('@anthropic')}    Anthropic (Claude)
  ${colors.cyan('@groq')}         Groq (fast inference)
  ${colors.cyan('@google')}       Google (Gemini)
  ${colors.cyan('@xai')}          xAI (Grok)
  ${colors.cyan('@mistral')}      Mistral AI
  ${colors.cyan('@cohere')}       Cohere
  ${colors.cyan('@deepseek')}     DeepSeek
  ${colors.cyan('@perplexity')}   Perplexity
  ${colors.cyan('@together')}     Together AI
  ${colors.cyan('@fireworks')}    Fireworks AI
  ${colors.cyan('@replicate')}    Replicate
  ${colors.cyan('@huggingface')}  Hugging Face

${colors.bold(colors.yellow('Note:'))}
  This command sends a single prompt without conversation memory.
  For chat with memory, use: ${colors.cyan('rek shell')} then ${colors.cyan('@openai Your message')}
`)
    .action(async (preset: string, promptParts: string[]) => {
      // Parse options from prompt parts
      let model: string | undefined;
      let temperature = '0.7';
      let maxTokens = '2048';
      let wait = false;
      let jsonOutput = false;
      let envPath: string | boolean | undefined;
      const actualPromptParts: string[] = [];

      for (const part of promptParts) {
        if (part.startsWith('model=')) model = part.split('=')[1];
        else if (part.startsWith('temperature=')) temperature = part.split('=')[1];
        else if (part.startsWith('max-tokens=')) maxTokens = part.split('=')[1];
        else if (part === 'wait') wait = true;
        else if (part === 'json') jsonOutput = true;
        else if (part.startsWith('env=')) envPath = part.split('=')[1];
        else if (part === 'env') envPath = true;
        else actualPromptParts.push(part);
      }

      // Load .env file if requested or by default
      // Auto-load .env from cwd if it exists (silent fail)
      if (envPath !== undefined) {
        await loadEnvFile(envPath);
      } else {
        // Try loading from cwd silently
        try {
          const envFilePath = join(process.cwd(), '.env');
          await fs.access(envFilePath);
          await loadEnvFile(true);
        } catch {
          // .env doesn't exist, that's fine
        }
      }

      // Parse preset name
      let presetName = preset;
      if (presetName.startsWith('@')) {
        presetName = presetName.slice(1);
      }

      // Resolve preset
      const presetConfig = await resolvePreset(presetName);
      if (!presetConfig) {
        console.error(colors.red(`Unknown AI preset: @${presetName}`));
        console.log(colors.gray('Available AI presets: @openai, @anthropic, @groq, @google, @xai, @mistral, @cohere'));
        process.exit(1);
      }

      // Check if preset has AI config
      if (!presetConfig._aiConfig) {
        console.error(colors.red(`Preset @${presetName} does not support AI features.`));
        console.log(colors.gray('Use an AI preset like @openai, @anthropic, @groq, etc.'));
        process.exit(1);
      }

      const prompt = actualPromptParts.join(' ');
      if (!prompt.trim()) {
        console.error(colors.red('Error: Prompt is required'));
        process.exit(1);
      }

      try {
        // Dynamic import to avoid loading AI client if not needed
        // Note: We need to go up one more level because we are in cli/commands/
        const { createClient } = await import('../../core/client.js');
        const client = createClient(presetConfig);

        // Override model if specified
        if (model) {
          client.ai.setMemoryConfig({ systemPrompt: undefined }); // Reset any system prompt
          (client as any)._aiConfig.model = model;
        }

        if (!jsonOutput) {
          console.log(colors.gray(`Using @${presetName} (${(client as any)._aiConfig.model})...
`));
        }

        if (wait || jsonOutput) {
          // Non-streaming mode (wait for full response)
          const response = await client.ai.prompt(prompt);

          if (jsonOutput) {
            console.log(JSON.stringify({
              content: response.content,
              model: response.model,
              usage: response.usage,
              finishReason: response.finishReason,
            }, null, 2));
          } else {
            console.log(response.content);

            // Show usage stats
            if (response.usage) {
              console.log(colors.gray(`
─────────────────────────────────────────`));
              console.log(colors.gray(`Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`));
            }
          }
        } else {
          // Streaming mode (default)
          const stream = await client.ai.promptStream(prompt);
          for await (const event of stream) {
            if (event.type === 'text') {
              process.stdout.write(event.content);
            }
          }
          console.log(''); // Final newline
        }
      } catch (error: any) {
        console.error(colors.red(`AI request failed: ${error.message}`));
        if (error.cause) {
          console.error(colors.gray(error.cause.message || error.cause));
        }
        process.exit(1);
      }
    });
}
