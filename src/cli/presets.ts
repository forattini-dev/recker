import * as presets from '../presets/index.js';
import colors from '../utils/colors.js';
import { ConfigurationError, ValidationError } from '../core/errors.js';

// Map preset names to required environment variables
const ENV_MAPPING: Record<string, string[]> = {
  openai: ['OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  github: ['GITHUB_TOKEN'],
  gitlab: ['GITLAB_TOKEN'],
  stripe: ['STRIPE_SECRET_KEY'],
  discord: ['DISCORD_TOKEN'],
  slack: ['SLACK_TOKEN'],
  vercel: ['VERCEL_TOKEN'],
  supabase: ['SUPABASE_URL', 'SUPABASE_KEY'],
  groq: ['GROQ_API_KEY'],
  google: ['GOOGLE_API_KEY'],
  xai: ['XAI_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
  cohere: ['COHERE_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  fireworks: ['FIREWORKS_API_KEY'],
  together: ['TOGETHER_API_KEY'],
  perplexity: ['PERPLEXITY_API_KEY'],
};

type PresetFactory = (options: Record<string, string>) => unknown;
const presetFactories = presets as unknown as Record<string, PresetFactory | undefined>;

export interface ResolvePresetOptions {
  /** If true, throw errors instead of calling process.exit (for shell mode) */
  throwOnError?: boolean;
  /** If true, suppress console output */
  silent?: boolean;
}

/**
 * Resolve a preset by name, loading environment variables as needed.
 *
 * @param name - Preset name (e.g., 'openai', 'anthropic')
 * @param options - Options for error handling
 * @returns Preset configuration object, or null if not found (when throwOnError is false)
 */
export async function resolvePreset(name: string, options: ResolvePresetOptions = {}) {
  const { throwOnError = false, silent = false } = options;
  const presetFn = presetFactories[name];

  if (!presetFn) {
    const msg = `Unknown preset '@${name}'`;
    if (throwOnError) {
      throw new ValidationError(msg, { field: 'name', value: name });
    }
    if (!silent) {
      console.error(colors.red(`Error: ${msg}`));
    }
    return null;
  }

  const requiredEnvs = ENV_MAPPING[name];
  const presetOptions: Record<string, string> = {};

  if (requiredEnvs) {
    let missing = false;
    for (const envVar of requiredEnvs) {
      const value = process.env[envVar];
      if (!value) {
        if (!silent) {
          console.error(colors.yellow(`Warning: Missing env variable ${envVar} for preset @${name}`));
        }
        missing = true;
      } else {
        // Heuristic: map env var to option name
        // e.g. OPENAI_API_KEY -> apiKey
        // SUPABASE_URL -> projectUrl
        const key = mapEnvToOption(name, envVar);
        presetOptions[key] = value;
      }
    }

    if (missing && !silent) {
       console.log(colors.gray(`Tip: export ${requiredEnvs.join('=... ')}=...`));
    }
  }

  try {
    return presetFn(presetOptions);
  } catch (error: unknown) {
    const msg = `Error initializing preset @${name}: ${getErrorMessage(error)}`;
    if (throwOnError) {
      throw new ConfigurationError(msg, { configKey: `preset.${name}` });
    }
    if (!silent) {
      console.error(colors.red(msg));
    }
    return null;
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return String(error);
}

function mapEnvToOption(preset: string, env: string): string {
  if (env.endsWith('_KEY') || env.endsWith('_TOKEN')) return 'apiKey'; // Generic fallback
  if (env === 'GITHUB_TOKEN') return 'token';
  if (env === 'GITLAB_TOKEN') return 'token';
  if (env === 'DISCORD_TOKEN') return 'token';
  if (env === 'SLACK_TOKEN') return 'token';
  if (env === 'VERCEL_TOKEN') return 'token';
  if (env === 'STRIPE_SECRET_KEY') return 'secretKey';
  if (env === 'SUPABASE_URL') return 'projectUrl';
  if (env === 'SUPABASE_KEY') return 'apiKey';
  
  // Default camelCase conversion of the last part?
  // For now, return apiKey as safe default for most AI presets
  return 'apiKey';
}
