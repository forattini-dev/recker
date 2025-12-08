/**
 * SEO Thresholds and Configuration
 */

export const SEO_THRESHOLDS = {
  // Title
  title: {
    min: 30,
    ideal: { min: 50, max: 60 },
    max: 70,
  },

  // Meta Description
  metaDescription: {
    min: 70,
    ideal: { min: 120, max: 155 },
    max: 160,
  },

  // OpenGraph (Meta/Facebook/Instagram)
  og: {
    title: { min: 30, ideal: { min: 40, max: 60 }, max: 90 },
    description: { min: 55, ideal: { min: 110, max: 155 }, max: 200 },
    image: {
      dimensions: { width: 1200, height: 630 },
      minDimensions: { width: 600, height: 315 },
      ratio: 1.91,
      maxSizeKb: 300,
      maxSizeKbAbsolute: 1000,
      formats: ['jpg', 'jpeg', 'png', 'webp'],
    },
    // Meta-specific limits
    meta: {
      maxUrlLength: 2000,
      maxDescriptionEmojis: 2, // Universal spec: 1-2 max (Slack/Discord render poorly)
      maxCapsPercentage: 30, // Max % of uppercase letters
    },
    // Universal fallbacks
    fallbacks: {
      requireMetaTitle: true, // <meta name="title">
      requireMetaDescription: true, // <meta name="description">
    },
  },

  // Twitter Card
  twitter: {
    title: { min: 30, ideal: { min: 40, max: 55 }, max: 70 },
    description: { min: 70, ideal: { min: 125, max: 200 }, max: 200 },
    image: {
      summary: { min: { width: 144, height: 144 }, max: { width: 4096, height: 4096 } },
      summaryLarge: { min: { width: 300, height: 157 }, max: { width: 4096, height: 4096 } },
      maxSizeMb: 5,
    },
  },

  // Headings
  headings: {
    h1: { count: 1, minLength: 20, maxLength: 70 },
    h2: { min: 2, max: 8 },
  },

  // Images
  images: {
    alt: { minLength: 10, idealLength: { min: 80, max: 120 }, maxLength: 150 },
    maxSizeKb: 100,
    maxSizeKbAcceptable: 500,
  },

  // Links
  links: {
    minInternal: 3,
    maxExternal: 100,
    genericTexts: ['clique aqui', 'click here', 'saiba mais', 'learn more', 'read more', 'leia mais', 'here', 'aqui'],
  },

  // Content
  content: {
    // General content word count recommendations
    minWordsSimple: 150, // For simple pages
    minWordsRanking: 300, // For pages meant to rank
    minWordsAuthority: 800, // For authority content
    idealWordsAuthority: 2500, // Max for authority content
    maxWordsPerSentence: 25, // User suggested 20-25, using 25 as upper limit
    maxWordsPerParagraph: 90, // User suggested 40-90
    minWordsPerParagraph: 40, // User suggested 40-90
    minWordsPerH2Section: 150, // Min words within an H2 section
    minWordsPerH3Section: 50, // Min words within an H3 section
    imageWordRatio: { min: 200, max: 300 }, // 1 image per 200-300 words

    // Keyword density and redundancy (heuristic)
    keywordDensity: { min: 0.8, max: 2.0 }, // Percentage
    redundancyTolerance: 3, // Max times main keyword appears in intro/conclusion/alt
  },

  // URL
  url: {
    maxLength: 75,
    maxLengthAbsolute: 2048,
  },

  // Mobile
  mobile: {
    minFontSize: 16,
    minTouchTarget: 48,
  },

  // Content
  thinContent: {
    minWords: 150, // General minimum to avoid "thin content" penalty
    veryThinWords: 100, // Very thin (e.g., single paragraph)
  },

  // Timing (Core Web Vitals and Google recommendations)
  timing: {
    ttfb: {
      good: 200, // Under 200ms is good
      needsImprovement: 500, // 200-500ms needs improvement
      poor: 600, // Over 600ms is poor
    },
    total: {
      good: 1000, // Under 1s is good
      needsImprovement: 2500, // Under 2.5s is acceptable
      poor: 4000, // Over 4s is poor
    },
    dnsLookup: {
      good: 50,
      poor: 200,
    },
    tcpConnect: {
      good: 100,
      poor: 300,
    },
    tlsHandshake: {
      good: 100,
      poor: 300,
    },
  },

  // Response size
  responseSize: {
    html: {
      good: 100 * 1024, // 100KB
      warning: 500 * 1024, // 500KB
      poor: 1024 * 1024, // 1MB
    },
    total: {
      good: 1024 * 1024, // 1MB
      warning: 3 * 1024 * 1024, // 3MB
      poor: 5 * 1024 * 1024, // 5MB
    },
  },
} as const;
