/**
 * URL Shortcut Expander
 *
 * Expands shortcut syntax like @youtube/dQw4w9WgXcQ to full URLs.
 *
 * Supported formats:
 * - @youtube/VIDEO_ID → https://youtube.com/watch?v=VIDEO_ID
 * - @twitch/USERNAME → https://twitch.tv/USERNAME
 * - @chaturbate/ROOM → https://chaturbate.com/ROOM/
 * - youtube/VIDEO_ID → https://youtube.com/watch?v=VIDEO_ID (without @)
 *
 * @example
 * ```typescript
 * expandShortcut('@youtube/dQw4w9WgXcQ');
 * // → 'https://youtube.com/watch?v=dQw4w9WgXcQ'
 *
 * expandShortcut('twitch/shroud');
 * // → 'https://twitch.tv/shroud'
 *
 * expandShortcut('https://youtube.com/watch?v=xxx');
 * // → 'https://youtube.com/watch?v=xxx' (unchanged)
 * ```
 */

export interface ShortcutPattern {
  pattern: RegExp;
  expand: (match: RegExpMatchArray) => string;
  examples: string[];
}

/**
 * Shortcut patterns for video/live sites
 */
export const SHORTCUT_PATTERNS: Record<string, ShortcutPattern> = {
  // Video platforms
  youtube: {
    pattern: /^@?youtube\/(.+)$/i,
    expand: (m) => `https://youtube.com/watch?v=${m[1]}`,
    examples: ['@youtube/dQw4w9WgXcQ', 'youtube/dQw4w9WgXcQ'],
  },
  twitch: {
    pattern: /^@?twitch\/(.+)$/i,
    expand: (m) => `https://twitch.tv/${m[1]}`,
    examples: ['@twitch/shroud', 'twitch/xqc'],
  },
  kick: {
    pattern: /^@?kick\/(.+)$/i,
    expand: (m) => `https://kick.com/${m[1]}`,
    examples: ['@kick/xqc', 'kick/ninja'],
  },
  tiktok: {
    pattern: /^@?tiktok\/(@?[^/]+)(?:\/(\d+))?$/i,
    expand: (m) => {
      const user = m[1].startsWith('@') ? m[1] : `@${m[1]}`;
      if (m[2]) {
        return `https://tiktok.com/${user}/video/${m[2]}`;
      }
      return `https://tiktok.com/${user}/live`;
    },
    examples: ['@tiktok/@user/123456', 'tiktok/user/123456', '@tiktok/user'],
  },
  instagram: {
    pattern: /^@?instagram\/(?:p\/|reel\/)?(.+)$/i,
    expand: (m) => {
      // If it looks like a shortcode (11 chars), use /p/
      if (m[1].length === 11 && !m[1].includes('/')) {
        return `https://instagram.com/p/${m[1]}`;
      }
      // Otherwise treat as username for live
      return `https://instagram.com/${m[1]}/live`;
    },
    examples: ['@instagram/p/ABC123', 'instagram/username'],
  },
  facebook: {
    pattern: /^@?facebook\/(.+)$/i,
    expand: (m) => `https://facebook.com/${m[1]}`,
    examples: ['@facebook/page/videos/123', 'facebook/user/live'],
  },
  twitter: {
    pattern: /^@?(?:twitter|x)\/(.+)$/i,
    expand: (m) => `https://twitter.com/${m[1]}`,
    examples: ['@twitter/user/status/123', '@x/i/spaces/xxx'],
  },
  vimeo: {
    pattern: /^@?vimeo\/(\d+)$/i,
    expand: (m) => `https://vimeo.com/${m[1]}`,
    examples: ['@vimeo/123456789', 'vimeo/987654321'],
  },
  dailymotion: {
    pattern: /^@?dailymotion\/(.+)$/i,
    expand: (m) => `https://dailymotion.com/video/${m[1]}`,
    examples: ['@dailymotion/x8abc12', 'dailymotion/x8abc12'],
  },
  reddit: {
    pattern: /^@?reddit\/(.+)$/i,
    expand: (m) => `https://reddit.com/${m[1]}`,
    examples: ['@reddit/r/videos/comments/xxx', 'reddit/r/sub/comments/123/title'],
  },
  soundcloud: {
    pattern: /^@?soundcloud\/(.+)$/i,
    expand: (m) => `https://soundcloud.com/${m[1]}`,
    examples: ['@soundcloud/artist/track', 'soundcloud/user/song'],
  },
  bandcamp: {
    pattern: /^@?bandcamp\/([^/]+)(?:\/(.+))?$/i,
    expand: (m) => {
      if (m[2]) {
        return `https://${m[1]}.bandcamp.com/track/${m[2]}`;
      }
      return `https://${m[1]}.bandcamp.com`;
    },
    examples: ['@bandcamp/artist/track', 'bandcamp/artist'],
  },
  bilibili: {
    pattern: /^@?bilibili\/(.+)$/i,
    expand: (m) => `https://bilibili.com/video/${m[1]}`,
    examples: ['@bilibili/BV1xx411c7mD', 'bilibili/av123456'],
  },
  rumble: {
    pattern: /^@?rumble\/(.+)$/i,
    expand: (m) => `https://rumble.com/${m[1]}`,
    examples: ['@rumble/v1abc2-title', 'rumble/user/username'],
  },
  odysee: {
    pattern: /^@?odysee\/(.+)$/i,
    expand: (m) => `https://odysee.com/${m[1]}`,
    examples: ['@odysee/@channel/video', 'odysee/@user:5/video:a'],
  },
  vk: {
    pattern: /^@?vk\/(.+)$/i,
    expand: (m) => `https://vk.com/video${m[1]}`,
    examples: ['@vk/-123456_789', 'vk/123456789'],
  },
  niconico: {
    pattern: /^@?(?:niconico|nico)\/(.+)$/i,
    expand: (m) => `https://nicovideo.jp/watch/${m[1]}`,
    examples: ['@niconico/sm12345678', 'nico/sm98765432'],
  },
  peertube: {
    pattern: /^@?peertube\/([^/]+)\/(.+)$/i,
    expand: (m) => `https://${m[1]}/w/${m[2]}`,
    examples: ['@peertube/instance.com/abc123', 'peertube/tube.example/xyz'],
  },
  // Adult sites
  chaturbate: {
    pattern: /^@?chaturbate\/(.+)$/i,
    expand: (m) => `https://chaturbate.com/${m[1]}/`,
    examples: ['@chaturbate/username', 'chaturbate/room'],
  },
  pornhub: {
    pattern: /^@?pornhub\/(.+)$/i,
    expand: (m) => `https://pornhub.com/view_video.php?viewkey=${m[1]}`,
    examples: ['@pornhub/ph12345abc', 'pornhub/viewkey123'],
  },
  xvideos: {
    pattern: /^@?xvideos\/(.+)$/i,
    expand: (m) => `https://xvideos.com/video${m[1]}`,
    examples: ['@xvideos/12345/title', 'xvideos/67890/video-title'],
  },
  redgifs: {
    pattern: /^@?redgifs\/(.+)$/i,
    expand: (m) => `https://redgifs.com/watch/${m[1]}`,
    examples: ['@redgifs/gifname', 'redgifs/SomeGifId'],
  },
  // Short video / image platforms
  streamable: {
    pattern: /^@?streamable\/(.+)$/i,
    expand: (m) => `https://streamable.com/${m[1]}`,
    examples: ['@streamable/abc123', 'streamable/xyz789'],
  },
  imgur: {
    pattern: /^@?imgur\/(.+)$/i,
    expand: (m) => `https://imgur.com/${m[1]}`,
    examples: ['@imgur/abc123', 'imgur/gallery/xyz'],
  },
  '9gag': {
    pattern: /^@?9gag\/(.+)$/i,
    expand: (m) => `https://9gag.com/gag/${m[1]}`,
    examples: ['@9gag/abc123', '9gag/xyz789'],
  },
  coub: {
    pattern: /^@?coub\/(.+)$/i,
    expand: (m) => `https://coub.com/view/${m[1]}`,
    examples: ['@coub/abc123', 'coub/xyz789'],
  },
  tumblr: {
    pattern: /^@?tumblr\/([^/]+)\/(\d+)$/i,
    expand: (m) => `https://${m[1]}.tumblr.com/post/${m[2]}`,
    examples: ['@tumblr/blogname/123456789', 'tumblr/user/987654321'],
  },
  pinterest: {
    pattern: /^@?pinterest\/(.+)$/i,
    expand: (m) => `https://pinterest.com/pin/${m[1]}`,
    examples: ['@pinterest/123456789', 'pinterest/987654321'],
  },
  flickr: {
    pattern: /^@?flickr\/([^/]+)\/(\d+)$/i,
    expand: (m) => `https://flickr.com/photos/${m[1]}/${m[2]}`,
    examples: ['@flickr/user/12345678901', 'flickr/username/98765432100'],
  },
  // Audio platforms
  mixcloud: {
    pattern: /^@?mixcloud\/(.+)$/i,
    expand: (m) => `https://mixcloud.com/${m[1]}`,
    examples: ['@mixcloud/user/mix-name', 'mixcloud/dj/set-title'],
  },
  audiomack: {
    pattern: /^@?audiomack\/(.+)$/i,
    expand: (m) => `https://audiomack.com/${m[1]}`,
    examples: ['@audiomack/artist/song', 'audiomack/user/track'],
  },
  jamendo: {
    pattern: /^@?jamendo\/(.+)$/i,
    expand: (m) => `https://jamendo.com/track/${m[1]}`,
    examples: ['@jamendo/123456', 'jamendo/987654'],
  },
};

/**
 * Check if a string looks like a URL (has protocol or common TLD patterns)
 */
export function isUrl(input: string): boolean {
  // Has protocol
  if (/^https?:\/\//i.test(input)) {
    return true;
  }

  // Common URL patterns without protocol
  if (/^(www\.)?[a-z0-9-]+\.(com|net|org|io|tv|co|me|gg|live|fm)/i.test(input)) {
    return true;
  }

  return false;
}

/**
 * Check if a string looks like a shortcut
 */
export function isShortcut(input: string): boolean {
  // Starts with @ followed by a known site
  if (input.startsWith('@')) {
    const sitePart = input.slice(1).split('/')[0].toLowerCase();
    return sitePart in SHORTCUT_PATTERNS;
  }

  // site/path format (no @)
  const slashIndex = input.indexOf('/');
  if (slashIndex > 0 && slashIndex < input.length - 1) {
    const sitePart = input.slice(0, slashIndex).toLowerCase();
    return sitePart in SHORTCUT_PATTERNS;
  }

  return false;
}

/**
 * Expand a shortcut to a full URL
 *
 * @param input - Shortcut string like @youtube/dQw4w9WgXcQ or youtube/dQw4w9WgXcQ
 * @returns Full URL or the original input if not a recognized shortcut
 */
export function expandShortcut(input: string): string {
  // Already a URL, return as-is
  if (isUrl(input)) {
    return input.startsWith('http') ? input : `https://${input}`;
  }

  // Try to match against all patterns
  for (const [_name, pattern] of Object.entries(SHORTCUT_PATTERNS)) {
    const match = input.match(pattern.pattern);
    if (match) {
      return pattern.expand(match);
    }
  }

  // Not a known shortcut, return as-is (might be a URL without protocol)
  return input;
}

/**
 * Get the site name from a shortcut
 *
 * @param input - Shortcut string
 * @returns Site name or null if not a shortcut
 */
export function getShortcutSite(input: string): string | null {
  if (input.startsWith('@')) {
    const sitePart = input.slice(1).split('/')[0].toLowerCase();
    return sitePart in SHORTCUT_PATTERNS ? sitePart : null;
  }

  const slashIndex = input.indexOf('/');
  if (slashIndex > 0) {
    const sitePart = input.slice(0, slashIndex).toLowerCase();
    return sitePart in SHORTCUT_PATTERNS ? sitePart : null;
  }

  return null;
}

/**
 * List all available shortcuts with examples
 */
export function listShortcuts(): Array<{ site: string; examples: string[] }> {
  return Object.entries(SHORTCUT_PATTERNS).map(([site, pattern]) => ({
    site,
    examples: pattern.examples,
  }));
}
