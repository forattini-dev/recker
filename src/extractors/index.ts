/**
 * Extractors Registry
 *
 * Auto-detection and registration of video extractors.
 *
 * @example
 * ```typescript
 * import { extract, extractors } from 'recker';
 *
 * // Auto-detect site and extract
 * const info = await extract('https://chaturbate.com/username/', client);
 *
 * // Use specific extractor
 * const chaturbate = new extractors.Chaturbate(client);
 * const info = await chaturbate.extract('https://chaturbate.com/username/');
 * ```
 */

import type { Client } from '../core/client.js';
import { BaseExtractor, ExtractorResult, ExtractorError, Format } from './base.js';
import { ChaturbateExtractor } from './chaturbate.js';
import { PornHubExtractor } from './pornhub.js';
import { XVideosExtractor, XVideosQuickiesExtractor } from './xvideos.js';
import { GenericExtractor } from './generic.js';
import { YouTubeExtractor } from './youtube.js';
import { TwitchExtractor } from './twitch.js';
import { TwitterExtractor, XExtractor } from './twitter.js';
import { TikTokExtractor } from './tiktok.js';
import { InstagramExtractor } from './instagram.js';
import { VimeoExtractor } from './vimeo.js';
import { DailymotionExtractor } from './dailymotion.js';
import { RedditExtractor } from './reddit.js';
import { KickExtractor } from './kick.js';
import { FacebookExtractor } from './facebook.js';
import { SoundCloudExtractor } from './soundcloud.js';
import { BilibiliExtractor } from './bilibili.js';
import { RumbleExtractor } from './rumble.js';
import { OdyseeExtractor } from './odysee.js';
import { VKExtractor } from './vk.js';
import { NicoNicoExtractor } from './niconico.js';
import { BandcampExtractor } from './bandcamp.js';
import { StreamableExtractor } from './streamable.js';
import { ImgurExtractor } from './imgur.js';
import { NineGagExtractor } from './9gag.js';
import { CoubExtractor } from './coub.js';
import { RedGifsExtractor } from './redgifs.js';
import { TumblrExtractor } from './tumblr.js';
import { PinterestExtractor } from './pinterest.js';
import { FlickrExtractor } from './flickr.js';
import { MixcloudExtractor } from './mixcloud.js';
import { AudiomackExtractor } from './audiomack.js';
import { JamendoExtractor } from './jamendo.js';
import { LastFmExtractor } from './lastfm.js';
import { BeatportExtractor } from './beatport.js';
import { PeerTubeExtractor } from './peertube.js';
import { FunkwhaleExtractor } from './funkwhale.js';

export {
  BaseExtractor,
  ExtractorError,
  GenericExtractor,
  YouTubeExtractor,
  TwitchExtractor,
  TwitterExtractor,
  XExtractor,
  TikTokExtractor,
  InstagramExtractor,
  FacebookExtractor,
  VimeoExtractor,
  DailymotionExtractor,
  RedditExtractor,
  KickExtractor,
  SoundCloudExtractor,
  BilibiliExtractor,
  RumbleExtractor,
  OdyseeExtractor,
  VKExtractor,
  NicoNicoExtractor,
  BandcampExtractor,
  StreamableExtractor,
  ImgurExtractor,
  NineGagExtractor,
  CoubExtractor,
  RedGifsExtractor,
  TumblrExtractor,
  PinterestExtractor,
  FlickrExtractor,
  MixcloudExtractor,
  AudiomackExtractor,
  JamendoExtractor,
  LastFmExtractor,
  BeatportExtractor,
  PeerTubeExtractor,
  FunkwhaleExtractor,
  ChaturbateExtractor,
  PornHubExtractor,
  XVideosExtractor,
  XVideosQuickiesExtractor,
};

// Re-export types
export type { ExtractorResult, Format } from './base.js';

/**
 * Extractor constructor type
 */
type ExtractorConstructor = new (client: Client) => BaseExtractor;

/**
 * Test if a URL matches an extractor's pattern
 */
function matchesPattern(url: string, pattern: RegExp | RegExp[]): boolean {
  if (Array.isArray(pattern)) {
    return pattern.some((p) => p.test(url));
  }
  return pattern.test(url);
}

/**
 * Extractor metadata for registry
 */
interface ExtractorMeta {
  name: string;
  constructor: ExtractorConstructor;
}

/**
 * Registry of all available extractors
 * Order matters - more specific extractors should come first
 */
const EXTRACTOR_REGISTRY: ExtractorMeta[] = [
  { name: 'youtube', constructor: YouTubeExtractor },
  { name: 'twitch', constructor: TwitchExtractor },
  { name: 'twitter', constructor: TwitterExtractor },
  { name: 'tiktok', constructor: TikTokExtractor },
  { name: 'instagram', constructor: InstagramExtractor },
  { name: 'facebook', constructor: FacebookExtractor },
  { name: 'vimeo', constructor: VimeoExtractor },
  { name: 'dailymotion', constructor: DailymotionExtractor },
  { name: 'reddit', constructor: RedditExtractor },
  { name: 'kick', constructor: KickExtractor },
  { name: 'soundcloud', constructor: SoundCloudExtractor },
  { name: 'bilibili', constructor: BilibiliExtractor },
  { name: 'rumble', constructor: RumbleExtractor },
  { name: 'odysee', constructor: OdyseeExtractor },
  { name: 'vk', constructor: VKExtractor },
  { name: 'niconico', constructor: NicoNicoExtractor },
  { name: 'bandcamp', constructor: BandcampExtractor },
  { name: 'streamable', constructor: StreamableExtractor },
  { name: 'imgur', constructor: ImgurExtractor },
  { name: '9gag', constructor: NineGagExtractor },
  { name: 'coub', constructor: CoubExtractor },
  { name: 'redgifs', constructor: RedGifsExtractor },
  { name: 'tumblr', constructor: TumblrExtractor },
  { name: 'pinterest', constructor: PinterestExtractor },
  { name: 'flickr', constructor: FlickrExtractor },
  { name: 'mixcloud', constructor: MixcloudExtractor },
  { name: 'audiomack', constructor: AudiomackExtractor },
  { name: 'jamendo', constructor: JamendoExtractor },
  { name: 'lastfm', constructor: LastFmExtractor },
  { name: 'beatport', constructor: BeatportExtractor },
  { name: 'peertube', constructor: PeerTubeExtractor },
  { name: 'funkwhale', constructor: FunkwhaleExtractor },
  { name: 'chaturbate', constructor: ChaturbateExtractor },
  { name: 'pornhub', constructor: PornHubExtractor },
  { name: 'xvideos:quickies', constructor: XVideosQuickiesExtractor },
  { name: 'xvideos', constructor: XVideosExtractor },
  { name: 'generic', constructor: GenericExtractor },
];

export const extractors = {
  YouTube: YouTubeExtractor,
  Twitch: TwitchExtractor,
  Twitter: TwitterExtractor,
  X: XExtractor,
  TikTok: TikTokExtractor,
  Instagram: InstagramExtractor,
  Facebook: FacebookExtractor,
  Vimeo: VimeoExtractor,
  Dailymotion: DailymotionExtractor,
  Reddit: RedditExtractor,
  Kick: KickExtractor,
  SoundCloud: SoundCloudExtractor,
  Bilibili: BilibiliExtractor,
  Rumble: RumbleExtractor,
  Odysee: OdyseeExtractor,
  VK: VKExtractor,
  NicoNico: NicoNicoExtractor,
  Bandcamp: BandcampExtractor,
  Streamable: StreamableExtractor,
  Imgur: ImgurExtractor,
  NineGag: NineGagExtractor,
  Coub: CoubExtractor,
  RedGifs: RedGifsExtractor,
  Tumblr: TumblrExtractor,
  Pinterest: PinterestExtractor,
  Flickr: FlickrExtractor,
  Mixcloud: MixcloudExtractor,
  Audiomack: AudiomackExtractor,
  Jamendo: JamendoExtractor,
  LastFm: LastFmExtractor,
  Beatport: BeatportExtractor,
  PeerTube: PeerTubeExtractor,
  Funkwhale: FunkwhaleExtractor,
  Chaturbate: ChaturbateExtractor,
  PornHub: PornHubExtractor,
  XVideos: XVideosExtractor,
  XVideosQuickies: XVideosQuickiesExtractor,
  Generic: GenericExtractor,
};

/**
 * Get all registered extractors
 */
export function getExtractors(): ExtractorConstructor[] {
  return EXTRACTOR_REGISTRY.map((e) => e.constructor);
}

/**
 * Register a custom extractor
 * @param extractor Extractor constructor to register
 * @param name Name for the extractor
 * @param priority 'first' | 'last' | 'before-generic' (default: 'before-generic')
 */
export function registerExtractor(
  extractor: ExtractorConstructor,
  name: string,
  priority: 'first' | 'last' | 'before-generic' = 'before-generic'
): void {
  // Remove if already exists
  const existingIndex = EXTRACTOR_REGISTRY.findIndex((e) => e.constructor === extractor);
  if (existingIndex !== -1) {
    EXTRACTOR_REGISTRY.splice(existingIndex, 1);
  }

  const meta: ExtractorMeta = { name, constructor: extractor };

  switch (priority) {
    case 'first':
      EXTRACTOR_REGISTRY.unshift(meta);
      break;
    case 'last':
      EXTRACTOR_REGISTRY.push(meta);
      break;
    case 'before-generic':
    default:
      // Insert before GenericExtractor
      const genericIndex = EXTRACTOR_REGISTRY.findIndex(
        (e) => e.constructor === GenericExtractor
      );
      if (genericIndex !== -1) {
        EXTRACTOR_REGISTRY.splice(genericIndex, 0, meta);
      } else {
        EXTRACTOR_REGISTRY.push(meta);
      }
      break;
  }
}

/**
 * Find the appropriate extractor for a URL
 * @param url URL to find extractor for
 * @param client HTTP client
 * @param includeGeneric Include generic extractor in search (default: true)
 * @returns Extractor instance or null
 */
export function findExtractor(
  url: string,
  client: Client,
  includeGeneric: boolean = true
): BaseExtractor | null {
  for (const { constructor: ExtractorClass } of EXTRACTOR_REGISTRY) {
    // Skip generic if not wanted
    if (!includeGeneric && ExtractorClass === GenericExtractor) {
      continue;
    }

    const extractor = new ExtractorClass(client);
    if (matchesPattern(url, extractor.VALID_URL)) {
      return extractor;
    }
  }
  return null;
}

/**
 * Extract video information from a URL
 * Automatically selects the appropriate extractor.
 *
 * @param url Video URL to extract from
 * @param client HTTP client instance
 * @param options Extraction options
 * @returns Extracted video information
 * @throws ExtractorError if extraction fails
 *
 * @example
 * ```typescript
 * const client = new Client();
 * const info = await extract('https://chaturbate.com/username/', client);
 * console.log(info.id, info.title, info.formats);
 * ```
 */
export async function extract(
  url: string,
  client: Client,
  options: {
    /** Try specific extractor first */
    preferExtractor?: string;
    /** Skip generic extractor */
    skipGeneric?: boolean;
    /** Throw if no specific extractor found (before trying generic) */
    requireSpecific?: boolean;
  } = {}
): Promise<ExtractorResult> {
  const { preferExtractor, skipGeneric = false, requireSpecific = false } = options;

  // Try preferred extractor first
  if (preferExtractor) {
    const ExtractorClass = Object.values(extractors).find(
      (e) => new e(client).IE_NAME === preferExtractor
    );
    if (ExtractorClass) {
      const extractor = new ExtractorClass(client);
      if (matchesPattern(url, extractor.VALID_URL)) {
        return extractor.extract(url);
      }
    }
  }

  // Find matching extractor
  const extractor = findExtractor(url, client, !skipGeneric && !requireSpecific);

  if (!extractor) {
    throw new ExtractorError(
      `No extractor found for URL: ${url}`,
      false
    );
  }

  // Check if we got generic but require specific
  if (
    requireSpecific &&
    extractor.IE_NAME === 'generic'
  ) {
    throw new ExtractorError(
      `No specific extractor found for URL: ${url}`,
      false
    );
  }

  return extractor.extract(url);
}

// Cached patterns for URL matching (populated on first use)
let cachedPatterns: Array<{ name: string; pattern: RegExp | RegExp[] }> | null = null;

async function getPatterns(): Promise<Array<{ name: string; pattern: RegExp | RegExp[] }>> {
  if (cachedPatterns) return cachedPatterns;

  const { Client } = await import('../core/client.js');
  const client = new Client();

  cachedPatterns = EXTRACTOR_REGISTRY.map(({ name, constructor: ExtractorClass }) => {
    const extractor = new ExtractorClass(client);
    return { name, pattern: extractor.VALID_URL };
  });

  return cachedPatterns;
}

/**
 * Check if a URL is supported by any extractor
 * @param url URL to check
 * @param includeGeneric Include generic extractor (default: false)
 */
export async function isSupported(url: string, includeGeneric: boolean = false): Promise<boolean> {
  const patterns = await getPatterns();

  for (const { name, pattern } of patterns) {
    if (!includeGeneric && name === 'generic') {
      continue;
    }

    if (matchesPattern(url, pattern)) {
      return true;
    }
  }
  return includeGeneric; // Generic matches everything
}

/**
 * Get extractor name for a URL
 * @param url URL to check
 * @returns Extractor name or null
 */
export async function getExtractorName(url: string): Promise<string | null> {
  const patterns = await getPatterns();

  for (const { name, pattern } of patterns) {
    if (matchesPattern(url, pattern)) {
      return name;
    }
  }
  return null;
}

/**
 * List all available extractor names
 */
export function listExtractors(): string[] {
  return EXTRACTOR_REGISTRY.map((e) => e.name);
}
