/**
 * AI Commands (Unified)
 *
 * AI chat tools migrated to the unified command system.
 * These handlers work in both CLI and TUI modes.
 */

import type { RekCommandDefinition, RekHandler } from '../handler-types.js'
import {
  withHandler,
  getString,
  getBoolean,
  colors,
} from '../output.js'

// =============================================================================
// AI Chat Handler
// =============================================================================

export const aiChatHandler: RekHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    // Get parameters
    const preset = getString(ctx.result.positional.preset)
    const prompt = getString(ctx.result.positional.prompt)

    // Options
    const model = getString(ctx.result.options.model)
    const wait = getBoolean(ctx.result.options.wait)
    const jsonOutput = getBoolean(ctx.result.options.json)

    if (!preset) {
      out.error('Preset is required (e.g., @openai, @anthropic)')
      return
    }

    if (!prompt) {
      out.error('Prompt is required')
      return
    }

    // Parse preset name
    let presetName = preset
    if (presetName.startsWith('@')) {
      presetName = presetName.slice(1)
    }

    const { resolvePreset } = await import('../presets.js')
    const { createClient } = await import('../../core/client.js')

    // Resolve preset
    const presetConfig = await resolvePreset(presetName)
    if (!presetConfig) {
      out.error(`Unknown AI preset: @${presetName}`)
      out.log(colors.gray('Available: @openai, @anthropic, @groq, @google, @xai, @mistral'))
      return
    }

    // Check if preset has AI config
    if (!(presetConfig as any)._aiConfig) {
      out.error(`Preset @${presetName} does not support AI features.`)
      return
    }

    const client = createClient(presetConfig as any)

    // Override model if specified
    if (model) {
      (client as unknown as { _aiConfig: { model: string } })._aiConfig.model = model
    }

    if (!jsonOutput && !extCtx) {
      out.log(colors.gray(`Using @${presetName} (${(client as unknown as { _aiConfig: { model: string } })._aiConfig.model})...\n`))
    }

    if (wait || jsonOutput || extCtx) {
      // Non-streaming mode (TUI always uses non-streaming for structured response)
      const response = await client.ai.prompt(prompt)

      if (extCtx) {
        out.response({
          content: response.content,
          model: response.model,
          usage: response.usage,
          preset: presetName,
        }, { responseType: 'ai' })
      } else if (jsonOutput) {
        out.json({
          content: response.content,
          model: response.model,
          usage: response.usage,
          finishReason: response.finishReason,
        })
      } else {
        out.log(response.content)
        if (response.usage) {
          out.divider()
          out.log(colors.gray(`Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`))
        }
      }
    } else {
      // Streaming mode (CLI only)
      const stream = await client.ai.promptStream(prompt)
      for await (const event of stream) {
        if (event.type === 'text') {
          process.stdout.write(event.content)
        }
      }
      out.log('') // Final newline
    }
  }
)

/**
 * AI command definition for unified CLI
 */
export const aiCommands: RekCommandDefinition = {
  description: 'AI chat tools',
  category: 'ai',
  tuiEnabled: true,
  commands: {
    ai: {
      description: 'Chat with AI models',
      aliases: ['chat', 'ask'],
      positional: [
        { name: 'preset', required: true, description: 'AI preset (@openai, @anthropic, etc.)' },
        { name: 'prompt', required: true, description: 'The prompt text' },
      ],
      options: {
        model: { short: 'm', type: 'string', description: 'Override model' },
        temperature: { short: 't', type: 'string', default: '0.7', description: 'Temperature (0-1)' },
        maxTokens: { type: 'string', default: '2048', description: 'Max tokens' },
        wait: { short: 'w', type: 'boolean', description: 'Wait for full response' },
        json: { short: 'j', type: 'boolean', description: 'Output raw JSON' },
      },
      examples: [
        { cmd: 'rek ai @openai "What is the capital of France?"', desc: 'Ask OpenAI' },
        { cmd: 'rek ai @anthropic "Explain quantum computing"', desc: 'Ask Claude' },
      ],
      handler: aiChatHandler
    }
  }
}
