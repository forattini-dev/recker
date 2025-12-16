import { ClientOptions } from '../types/index.js';

export interface ElevenLabsPresetOptions {
  /**
   * ElevenLabs API key
   */
  apiKey: string;
}

/**
 * ElevenLabs Text-to-Speech API preset
 *
 * Particularities:
 * - TTS generation can take 5-30 seconds depending on text length
 * - Returns audio streams (mp3, wav, pcm)
 * - Rate limits vary by subscription tier
 * - Supports streaming audio for real-time playback
 *
 * @see https://elevenlabs.io/docs/api-reference
 *
 * @example Text-to-Speech
 * ```typescript
 * const client = createClient(elevenlabs({ apiKey: 'xxx' }));
 *
 * // Generate speech (returns audio stream)
 * const response = await client.post('/text-to-speech/voice_id', {
 *   json: {
 *     text: 'Hello, world!',
 *     model_id: 'eleven_monolingual_v1',
 *     voice_settings: { stability: 0.5, similarity_boost: 0.5 }
 *   }
 * });
 *
 * // Save audio
 * const audio = await response.blob();
 *
 * // List voices
 * const voices = await client.get('/voices').json();
 * ```
 *
 * @example Streaming TTS
 * ```typescript
 * const response = await client.post('/text-to-speech/voice_id/stream', {
 *   json: { text: 'Streaming audio...', model_id: 'eleven_turbo_v2' }
 * });
 *
 * // Stream audio chunks
 * for await (const chunk of response) {
 *   // Process audio chunk
 * }
 * ```
 */
export function elevenlabs(options: ElevenLabsPresetOptions): ClientOptions {
  return {
    baseUrl: 'https://api.elevenlabs.io/v1',
    headers: {
      'xi-api-key': options.apiKey,
      'Content-Type': 'application/json',
    },
    // TTS can take a while for long text
    timeout: 3 * 60 * 1000, // 3 minutes
    retry: {
      maxAttempts: 2, // Less retries - TTS is expensive
      backoff: 'exponential',
      delay: 2000,
      statusCodes: [408, 429, 500, 502, 503, 504],
    }
  };
}

/**
 * ElevenLabs Voice Cloning preset
 */
export const elevenlabsVoices = (options: ElevenLabsPresetOptions): ClientOptions => ({
  ...elevenlabs(options),
  baseUrl: 'https://api.elevenlabs.io/v1/voices',
});
