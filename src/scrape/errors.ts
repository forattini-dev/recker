/**
 * Typed recovery errors for the Spider.
 *
 * Each error class carries enough context to drive a specific recovery
 * strategy via `instanceof` narrowing — transport swap for blocks, cooldown
 * for challenges, hard-skip for robots/scope/depth violations.
 *
 * All classes extend ReckerError so they plug into the shared error
 * classification, retry policy, and `onError` callback surface.
 */

import { ReckerError } from '../core/errors.js';
import type { BlockDetectionResult } from '../utils/block-detector.js';
import type { CaptchaDetectionResult } from '../utils/block-detector.js';

export type SpiderTransportLabel = 'auto' | 'undici' | 'curl';
export type CaptchaProviderLabel = CaptchaDetectionResult['provider'];

/**
 * Bot-protection / WAF block detected on a response.
 * Retriable — typically after transport swap or cooldown.
 */
export class SpiderBlockError extends ReckerError {
  url: string;
  domain: string;
  reason: BlockDetectionResult['reason'];
  confidence: number;
  transport: SpiderTransportLabel;
  preferredTransport?: SpiderTransportLabel;

  constructor(opts: {
    url: string;
    domain: string;
    reason: BlockDetectionResult['reason'];
    confidence: number;
    transport: SpiderTransportLabel;
    preferredTransport?: SpiderTransportLabel;
    statusCode?: number;
    message?: string;
  }) {
    super(
      opts.message ?? `Request to ${opts.url} was blocked (${opts.reason ?? 'unknown'})`,
      undefined,
      undefined,
      [
        opts.preferredTransport && opts.preferredTransport !== opts.transport
          ? `Retry with the ${opts.preferredTransport} transport.`
          : 'Rotate user-agent, proxy, or use curl-impersonate to bypass TLS fingerprinting.',
        'Increase the retry delay and honor any Retry-After header.',
      ],
      true,
      {
        category: 'scrape',
        source: 'spider',
        severity: 'medium',
        canRetry: true,
        reason: `Blocked: ${opts.reason ?? 'unknown'}`,
        statusCode: opts.statusCode,
      }
    );
    this.name = 'SpiderBlockError';
    this.url = opts.url;
    this.domain = opts.domain;
    this.reason = opts.reason;
    this.confidence = opts.confidence;
    this.transport = opts.transport;
    this.preferredTransport = opts.preferredTransport;
  }
}

/**
 * CAPTCHA / interactive challenge detected.
 * Retriable, but caller should cool down before next attempt to avoid
 * triggering a harder challenge tier.
 */
export class SpiderChallengeError extends ReckerError {
  url: string;
  domain: string;
  provider?: CaptchaProviderLabel;
  confidence: number;
  cooldownMs: number;
  transport: SpiderTransportLabel;

  constructor(opts: {
    url: string;
    domain: string;
    provider?: CaptchaProviderLabel;
    confidence: number;
    cooldownMs: number;
    transport: SpiderTransportLabel;
    statusCode?: number;
  }) {
    super(
      `CAPTCHA challenge detected on ${opts.url}${opts.provider ? ` (${opts.provider})` : ''}`,
      undefined,
      undefined,
      [
        `Cool down the host for at least ${opts.cooldownMs}ms before retrying.`,
        'Consider solving the challenge via an external CAPTCHA-solving service.',
        'Rotate proxy/IP before retrying.',
      ],
      true,
      {
        category: 'scrape',
        source: 'spider',
        severity: 'high',
        canRetry: true,
        reason: opts.provider ? `Challenge: ${opts.provider}` : 'CAPTCHA challenge',
        statusCode: opts.statusCode,
        retryAfterMs: opts.cooldownMs,
      }
    );
    this.name = 'SpiderChallengeError';
    this.url = opts.url;
    this.domain = opts.domain;
    this.provider = opts.provider;
    this.confidence = opts.confidence;
    this.cooldownMs = opts.cooldownMs;
    this.transport = opts.transport;
  }
}

/**
 * URL blocked by robots.txt Disallow rule.
 * Not retriable — caller must skip the URL.
 */
export class SpiderRobotsDisallowedError extends ReckerError {
  url: string;
  path: string;
  userAgent: string;
  robotsUrl: string;

  constructor(opts: {
    url: string;
    path: string;
    userAgent: string;
    robotsUrl: string;
  }) {
    super(
      `URL ${opts.url} is disallowed by robots.txt for ${opts.userAgent}`,
      undefined,
      undefined,
      [
        'Do not crawl this URL — the site operator has explicitly excluded it.',
        `Check ${opts.robotsUrl} for the full rules.`,
      ],
      false,
      {
        category: 'scrape',
        source: 'spider',
        severity: 'low',
        canRetry: false,
        reason: 'Disallowed by robots.txt',
      }
    );
    this.name = 'SpiderRobotsDisallowedError';
    this.url = opts.url;
    this.path = opts.path;
    this.userAgent = opts.userAgent;
    this.robotsUrl = opts.robotsUrl;
  }
}

/**
 * URL exceeds the configured maximum crawl depth.
 * Not retriable.
 */
export class SpiderDepthLimitError extends ReckerError {
  url: string;
  depth: number;
  maxDepth: number;

  constructor(opts: { url: string; depth: number; maxDepth: number }) {
    super(
      `URL ${opts.url} exceeds max crawl depth (${opts.depth} > ${opts.maxDepth})`,
      undefined,
      undefined,
      ['Increase maxDepth if deeper crawls are expected.'],
      false,
      {
        category: 'scrape',
        source: 'spider',
        severity: 'low',
        canRetry: false,
        reason: 'Depth limit exceeded',
      }
    );
    this.name = 'SpiderDepthLimitError';
    this.url = opts.url;
    this.depth = opts.depth;
    this.maxDepth = opts.maxDepth;
  }
}

/**
 * URL is outside the configured crawl scope (wrong domain / not in allowedDomains).
 * Not retriable.
 */
export class SpiderDomainOutOfScopeError extends ReckerError {
  url: string;
  allowedDomains?: string[];

  constructor(opts: { url: string; allowedDomains?: string[] }) {
    super(
      `URL ${opts.url} is outside the crawl scope`,
      undefined,
      undefined,
      ['Add the host to allowedDomains or disable sameDomain filtering.'],
      false,
      {
        category: 'scrape',
        source: 'spider',
        severity: 'low',
        canRetry: false,
        reason: 'Domain out of scope',
      }
    );
    this.name = 'SpiderDomainOutOfScopeError';
    this.url = opts.url;
    this.allowedDomains = opts.allowedDomains;
  }
}

/**
 * Response is a binary / document type the spider cannot parse as HTML.
 * Not retriable — caller should route to a specialty handler or skip.
 */
export class SpiderUnsupportedContentError extends ReckerError {
  url: string;
  contentType: string;
  reason: 'binary' | 'pdf' | 'doc' | 'media' | 'archive';
  fallbackSuggestion?: string;

  constructor(opts: {
    url: string;
    contentType: string;
    reason: 'binary' | 'pdf' | 'doc' | 'media' | 'archive';
    fallbackSuggestion?: string;
  }) {
    super(
      `Unsupported content type on ${opts.url}: ${opts.contentType}`,
      undefined,
      undefined,
      opts.fallbackSuggestion ? [opts.fallbackSuggestion] : ['Handle this URL with a specialty fetcher or skip.'],
      false,
      {
        category: 'scrape',
        source: 'spider',
        severity: 'low',
        canRetry: false,
        reason: `Unsupported content: ${opts.contentType}`,
      }
    );
    this.name = 'SpiderUnsupportedContentError';
    this.url = opts.url;
    this.contentType = opts.contentType;
    this.reason = opts.reason;
    this.fallbackSuggestion = opts.fallbackSuggestion;
  }
}
