/**
 * Preset Registry
 * Auto-detection of presets by domain pattern
 */

import { ClientOptions } from '../types/index.js';

// Import all presets
import { openai } from './openai.js';
import { anthropic } from './anthropic.js';
import { gemini } from './gemini.js';
import { cohere } from './cohere.js';
import { mistral } from './mistral.js';
import { groq } from './groq.js';
import { together } from './together.js';
import { replicate } from './replicate.js';
import { huggingface } from './huggingface.js';
import { perplexity } from './perplexity.js';
import { deepseek } from './deepseek.js';
import { fireworks } from './fireworks.js';
import { xai, grok } from './xai.js';
import { azureOpenai } from './azure-openai.js';
import { cloudflare, cloudflareWorkersAI } from './cloudflare.js';
import { github } from './github.js';
import { gitlab } from './gitlab.js';
import { vercel } from './vercel.js';
import { supabase } from './supabase.js';
import { stripe } from './stripe.js';
import { twilio } from './twilio.js';
import { digitalocean } from './digitalocean.js';
import { linear } from './linear.js';
import { notion } from './notion.js';
import { slack } from './slack.js';
import { discord } from './discord.js';

/**
 * Preset factory function type
 */
export type PresetFactory = (options: any) => ClientOptions;

/**
 * Preset info with metadata
 */
export interface PresetInfo {
  /** Unique preset name */
  name: string;
  /** Display name */
  displayName: string;
  /** Domain patterns that match this preset */
  patterns: RegExp[];
  /** Preset factory function */
  factory: PresetFactory;
  /** Category */
  category: 'ai' | 'cloud' | 'saas' | 'devtools';
  /** Required auth options */
  requiredAuth: string[];
  /** Documentation URL */
  docsUrl?: string;
}

/**
 * Registry of all available presets
 */
export const presetRegistry: PresetInfo[] = [
  // AI Platforms
  {
    name: 'openai',
    displayName: 'OpenAI',
    patterns: [/api\.openai\.com/],
    factory: openai,
    category: 'ai',
    requiredAuth: ['apiKey'],
    docsUrl: 'https://platform.openai.com/docs',
  },
  {
    name: 'anthropic',
    displayName: 'Anthropic (Claude)',
    patterns: [/api\.anthropic\.com/],
    factory: anthropic,
    category: 'ai',
    requiredAuth: ['apiKey'],
    docsUrl: 'https://docs.anthropic.com/',
  },
  {
    name: 'gemini',
    displayName: 'Google Gemini',
    patterns: [/generativelanguage\.googleapis\.com/],
    factory: gemini,
    category: 'ai',
    requiredAuth: ['apiKey'],
    docsUrl: 'https://ai.google.dev/docs',
  },
  {
    name: 'cohere',
    displayName: 'Cohere',
    patterns: [/api\.cohere\.ai/],
    factory: cohere,
    category: 'ai',
    requiredAuth: ['apiKey'],
    docsUrl: 'https://docs.cohere.com/',
  },
  {
    name: 'mistral',
    displayName: 'Mistral AI',
    patterns: [/api\.mistral\.ai/],
    factory: mistral,
    category: 'ai',
    requiredAuth: ['apiKey'],
    docsUrl: 'https://docs.mistral.ai/',
  },
  {
    name: 'groq',
    displayName: 'Groq',
    patterns: [/api\.groq\.com/],
    factory: groq,
    category: 'ai',
    requiredAuth: ['apiKey'],
    docsUrl: 'https://console.groq.com/docs',
  },
  {
    name: 'together',
    displayName: 'Together AI',
    patterns: [/api\.together\.xyz/],
    factory: together,
    category: 'ai',
    requiredAuth: ['apiKey'],
    docsUrl: 'https://docs.together.ai/',
  },
  {
    name: 'replicate',
    displayName: 'Replicate',
    patterns: [/api\.replicate\.com/],
    factory: replicate,
    category: 'ai',
    requiredAuth: ['apiKey'],
    docsUrl: 'https://replicate.com/docs',
  },
  {
    name: 'huggingface',
    displayName: 'Hugging Face',
    patterns: [/api-inference\.huggingface\.co/, /huggingface\.co\/api/],
    factory: huggingface,
    category: 'ai',
    requiredAuth: ['apiKey'],
    docsUrl: 'https://huggingface.co/docs/api-inference',
  },
  {
    name: 'perplexity',
    displayName: 'Perplexity AI',
    patterns: [/api\.perplexity\.ai/],
    factory: perplexity,
    category: 'ai',
    requiredAuth: ['apiKey'],
    docsUrl: 'https://docs.perplexity.ai/',
  },
  {
    name: 'deepseek',
    displayName: 'DeepSeek',
    patterns: [/api\.deepseek\.com/],
    factory: deepseek,
    category: 'ai',
    requiredAuth: ['apiKey'],
    docsUrl: 'https://platform.deepseek.com/docs',
  },
  {
    name: 'fireworks',
    displayName: 'Fireworks AI',
    patterns: [/api\.fireworks\.ai/],
    factory: fireworks,
    category: 'ai',
    requiredAuth: ['apiKey'],
    docsUrl: 'https://docs.fireworks.ai/',
  },
  {
    name: 'xai',
    displayName: 'xAI (Grok)',
    patterns: [/api\.x\.ai/],
    factory: xai,
    category: 'ai',
    requiredAuth: ['apiKey'],
    docsUrl: 'https://docs.x.ai/',
  },
  {
    name: 'grok',
    displayName: 'Grok (xAI)',
    patterns: [/api\.x\.ai/],
    factory: grok,
    category: 'ai',
    requiredAuth: ['apiKey'],
    docsUrl: 'https://docs.x.ai/',
  },
  {
    name: 'azure-openai',
    displayName: 'Azure OpenAI',
    patterns: [/\.openai\.azure\.com/],
    factory: azureOpenai,
    category: 'ai',
    requiredAuth: ['resourceName', 'apiKey'],
    docsUrl: 'https://learn.microsoft.com/en-us/azure/ai-services/openai/',
  },
  {
    name: 'cloudflare-workers-ai',
    displayName: 'Cloudflare Workers AI',
    patterns: [/api\.cloudflare\.com\/client\/v4\/accounts\/.*\/ai/],
    factory: cloudflareWorkersAI,
    category: 'ai',
    requiredAuth: ['accountId', 'apiToken'],
    docsUrl: 'https://developers.cloudflare.com/workers-ai/',
  },

  // Cloud & DevTools
  {
    name: 'cloudflare',
    displayName: 'Cloudflare',
    patterns: [/api\.cloudflare\.com/],
    factory: cloudflare,
    category: 'cloud',
    requiredAuth: ['apiToken'],
    docsUrl: 'https://developers.cloudflare.com/api/',
  },
  {
    name: 'github',
    displayName: 'GitHub',
    patterns: [/api\.github\.com/],
    factory: github,
    category: 'devtools',
    requiredAuth: ['token'],
    docsUrl: 'https://docs.github.com/en/rest',
  },
  {
    name: 'gitlab',
    displayName: 'GitLab',
    patterns: [/gitlab\.com\/api/, /gitlab\..+\/api/],
    factory: gitlab,
    category: 'devtools',
    requiredAuth: ['token'],
    docsUrl: 'https://docs.gitlab.com/ee/api/rest/',
  },
  {
    name: 'vercel',
    displayName: 'Vercel',
    patterns: [/api\.vercel\.com/],
    factory: vercel,
    category: 'cloud',
    requiredAuth: ['token'],
    docsUrl: 'https://vercel.com/docs/rest-api',
  },
  {
    name: 'supabase',
    displayName: 'Supabase',
    patterns: [/\.supabase\.co/],
    factory: supabase,
    category: 'cloud',
    requiredAuth: ['projectUrl', 'apiKey'],
    docsUrl: 'https://supabase.com/docs/guides/api',
  },
  {
    name: 'stripe',
    displayName: 'Stripe',
    patterns: [/api\.stripe\.com/],
    factory: stripe,
    category: 'saas',
    requiredAuth: ['secretKey'],
    docsUrl: 'https://stripe.com/docs/api',
  },
  {
    name: 'twilio',
    displayName: 'Twilio',
    patterns: [/api\.twilio\.com/],
    factory: twilio,
    category: 'saas',
    requiredAuth: ['accountSid', 'authToken'],
    docsUrl: 'https://www.twilio.com/docs/usage/api',
  },
  {
    name: 'digitalocean',
    displayName: 'DigitalOcean',
    patterns: [/api\.digitalocean\.com/],
    factory: digitalocean,
    category: 'cloud',
    requiredAuth: ['token'],
    docsUrl: 'https://docs.digitalocean.com/reference/api/',
  },
  {
    name: 'linear',
    displayName: 'Linear',
    patterns: [/api\.linear\.app/],
    factory: linear,
    category: 'saas',
    requiredAuth: ['apiKey'],
    docsUrl: 'https://developers.linear.app/docs',
  },
  {
    name: 'notion',
    displayName: 'Notion',
    patterns: [/api\.notion\.com/],
    factory: notion,
    category: 'saas',
    requiredAuth: ['token'],
    docsUrl: 'https://developers.notion.com/',
  },
  {
    name: 'slack',
    displayName: 'Slack',
    patterns: [/slack\.com\/api/],
    factory: slack,
    category: 'saas',
    requiredAuth: ['token'],
    docsUrl: 'https://api.slack.com/web',
  },
  {
    name: 'discord',
    displayName: 'Discord',
    patterns: [/discord\.com\/api/],
    factory: discord,
    category: 'saas',
    requiredAuth: ['token'],
    docsUrl: 'https://discord.com/developers/docs',
  },
];

/**
 * Detect preset from URL
 *
 * @param url - URL to check
 * @returns Preset info if found, undefined otherwise
 *
 * @example
 * ```typescript
 * const preset = detectPreset('https://api.openai.com/v1/chat/completions');
 * if (preset) {
 *   console.log(`Detected: ${preset.displayName}`);
 *   // => 'Detected: OpenAI'
 * }
 * ```
 */
export function detectPreset(url: string): PresetInfo | undefined {
  for (const preset of presetRegistry) {
    for (const pattern of preset.patterns) {
      if (pattern.test(url)) {
        return preset;
      }
    }
  }
  return undefined;
}

/**
 * Get preset by name
 *
 * @param name - Preset name
 * @returns Preset info if found
 */
export function getPreset(name: string): PresetInfo | undefined {
  return presetRegistry.find(p => p.name === name);
}

/**
 * List all presets by category
 *
 * @param category - Optional category filter
 * @returns Array of preset infos
 */
export function listPresets(category?: 'ai' | 'cloud' | 'saas' | 'devtools'): PresetInfo[] {
  if (category) {
    return presetRegistry.filter(p => p.category === category);
  }
  return [...presetRegistry];
}

/**
 * Get all AI platform presets
 */
export function listAIPresets(): PresetInfo[] {
  return listPresets('ai');
}

/**
 * Get all cloud provider presets
 */
export function listCloudPresets(): PresetInfo[] {
  return listPresets('cloud');
}

/**
 * Get all SaaS presets
 */
export function listSaaSPresets(): PresetInfo[] {
  return listPresets('saas');
}

/**
 * Get all devtools presets
 */
export function listDevToolsPresets(): PresetInfo[] {
  return listPresets('devtools');
}
