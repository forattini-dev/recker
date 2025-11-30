import * as presets from '../presets/index.js';
import pc from '../utils/colors.js';

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
  // Add others as needed
};

export function resolvePreset(name: string) {
  const presetFn = (presets as any)[name];
  
  if (!presetFn) {
    console.error(pc.red(`Error: Unknown preset '@${name}'`));
    process.exit(1);
  }

  const requiredEnvs = ENV_MAPPING[name];
  const options: Record<string, string> = {};

  if (requiredEnvs) {
    let missing = false;
    for (const envVar of requiredEnvs) {
      const value = process.env[envVar];
      if (!value) {
        console.error(pc.yellow(`Warning: Missing env variable ${envVar} for preset @${name}`));
        missing = true;
      } else {
        // Heuristic: map env var to option name
        // e.g. OPENAI_API_KEY -> apiKey
        // SUPABASE_URL -> projectUrl
        const key = mapEnvToOption(name, envVar);
        options[key] = value;
      }
    }
    
    if (missing) {
       console.log(pc.gray(`Tip: export ${requiredEnvs.join('=... ')}=...`));
    }
  }

  try {
    return presetFn(options);
  } catch (error: any) {
    console.error(pc.red(`Error initializing preset @${name}: ${error.message}`));
    process.exit(1);
  }
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
