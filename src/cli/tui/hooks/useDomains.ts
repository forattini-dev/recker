/**
 * useDomains - Domain Intelligence State Management
 *
 * Tracks all domain interactions across DNS, SEO, spider, downloads, and HTTP requests.
 * Provides a unified view of intelligence gathered per domain.
 */

import { createSignal } from 'tuiuiu.js';

// =============================================================================
// Types
// =============================================================================

export interface DnsRecord {
  type: 'A' | 'AAAA' | 'MX' | 'TXT' | 'NS' | 'CNAME' | 'SOA' | 'PTR';
  value: string;
  ttl?: number;
  priority?: number; // for MX records
}

export interface DnsIntelligence {
  records: DnsRecord[];
  queriedAt: Date;
  whois?: {
    registrar?: string;
    createdDate?: string;
    expiresDate?: string;
    nameServers?: string[];
  };
}

export interface SeoIntelligence {
  score: number;
  issues: number;
  categories: {
    technical: number;
    content: number;
    performance: number;
  };
  lastAnalyzed: Date;
}

export interface SpiderIntelligence {
  pagesFound: number;
  externalLinks: number;
  internalLinks: number;
  images: number;
  scripts: number;
  stylesheets: number;
  errors: number;
  lastCrawled: Date;
}

export interface DownloadEntry {
  type: 'live' | 'video' | 'hls' | 'file';
  filename: string;
  size: number; // bytes
  duration?: number; // seconds for video/live
  date: Date;
  url: string;
}

export interface RequestEntry {
  method: string;
  path: string;
  status: number;
  time: number; // ms
  date: Date;
}

export interface DomainIntelligence {
  domain: string;
  firstSeen: Date;
  lastAccessed: Date;

  // Intelligence categories
  dns?: DnsIntelligence;
  seo?: SeoIntelligence;
  spider?: SpiderIntelligence;

  // Activity logs
  downloads: DownloadEntry[];
  requests: RequestEntry[];

  // Metadata
  tags?: string[];
  notes?: string;
}

export interface DomainEntry {
  domain: string;
  intel: DomainIntelligence;
}

// =============================================================================
// State (Signals)
// =============================================================================

// Domain intelligence store
const [domains, setDomains] = createSignal<Map<string, DomainIntelligence>>(new Map());

// Selected domain for detail view
const [selectedDomain, setSelectedDomain] = createSignal<string | null>(null);

// View mode (list or detail)
const [domainViewMode, setDomainViewMode] = createSignal<'list' | 'detail'>('list');

// Search/filter query
const [domainFilter, setDomainFilter] = createSignal('');

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract domain from URL or hostname
 */
function extractDomain(input: string): string {
  try {
    // Handle shortcuts like @chaturbate/room
    if (input.startsWith('@')) {
      const parts = input.slice(1).split('/');
      return parts[0].toLowerCase();
    }

    // Handle full URLs
    if (input.includes('://')) {
      const url = new URL(input);
      return url.hostname.toLowerCase();
    }

    // Handle hostnames
    return input.toLowerCase().replace(/^www\./, '');
  } catch {
    return input.toLowerCase();
  }
}

/**
 * Get or create domain intelligence entry
 */
function getOrCreate(domain: string): DomainIntelligence {
  const normalized = extractDomain(domain);
  const current = domains();
  const existing = current.get(normalized);

  if (existing) {
    return existing;
  }

  const newEntry: DomainIntelligence = {
    domain: normalized,
    firstSeen: new Date(),
    lastAccessed: new Date(),
    downloads: [],
    requests: [],
  };

  const updated = new Map(current);
  updated.set(normalized, newEntry);
  setDomains(updated);

  return newEntry;
}

// =============================================================================
// Tracking Functions
// =============================================================================

/**
 * Track DNS records for a domain
 */
function trackDns(domain: string, records: DnsRecord[], whois?: DnsIntelligence['whois']): void {
  const normalized = extractDomain(domain);
  const intel = getOrCreate(normalized);

  intel.dns = {
    records,
    queriedAt: new Date(),
    whois: whois || intel.dns?.whois,
  };
  intel.lastAccessed = new Date();

  const updated = new Map(domains());
  updated.set(normalized, intel);
  setDomains(updated);
}

/**
 * Track SEO analysis for a domain
 */
function trackSeo(domain: string, seo: Omit<SeoIntelligence, 'lastAnalyzed'>): void {
  const normalized = extractDomain(domain);
  const intel = getOrCreate(normalized);

  intel.seo = {
    ...seo,
    lastAnalyzed: new Date(),
  };
  intel.lastAccessed = new Date();

  const updated = new Map(domains());
  updated.set(normalized, intel);
  setDomains(updated);
}

/**
 * Track spider/crawl results for a domain
 */
function trackSpider(domain: string, spider: Omit<SpiderIntelligence, 'lastCrawled'>): void {
  const normalized = extractDomain(domain);
  const intel = getOrCreate(normalized);

  intel.spider = {
    ...spider,
    lastCrawled: new Date(),
  };
  intel.lastAccessed = new Date();

  const updated = new Map(domains());
  updated.set(normalized, intel);
  setDomains(updated);
}

/**
 * Track a download from a domain
 */
function trackDownload(domain: string, download: Omit<DownloadEntry, 'date'>): void {
  const normalized = extractDomain(domain);
  const intel = getOrCreate(normalized);

  intel.downloads.push({
    ...download,
    date: new Date(),
  });
  intel.lastAccessed = new Date();

  // Keep only last 50 downloads per domain
  if (intel.downloads.length > 50) {
    intel.downloads = intel.downloads.slice(-50);
  }

  const updated = new Map(domains());
  updated.set(normalized, intel);
  setDomains(updated);
}

/**
 * Track an HTTP request to a domain
 */
function trackRequest(domain: string, request: Omit<RequestEntry, 'date'>): void {
  const normalized = extractDomain(domain);
  const intel = getOrCreate(normalized);

  intel.requests.push({
    ...request,
    date: new Date(),
  });
  intel.lastAccessed = new Date();

  // Keep only last 100 requests per domain
  if (intel.requests.length > 100) {
    intel.requests = intel.requests.slice(-100);
  }

  const updated = new Map(domains());
  updated.set(normalized, intel);
  setDomains(updated);
}

// =============================================================================
// Query Functions
// =============================================================================

/**
 * Get intelligence for a specific domain
 */
function getDomainIntel(domain: string): DomainIntelligence | undefined {
  return domains().get(extractDomain(domain));
}

/**
 * List all tracked domains (sorted by lastAccessed)
 */
function listDomains(): DomainEntry[] {
  const filter = domainFilter().toLowerCase();
  const all = Array.from(domains().entries()).map(([domain, intel]) => ({
    domain,
    intel,
  }));

  // Filter if search query exists
  const filtered = filter
    ? all.filter(entry => entry.domain.includes(filter))
    : all;

  // Sort by lastAccessed (most recent first)
  return filtered.sort((a, b) =>
    b.intel.lastAccessed.getTime() - a.intel.lastAccessed.getTime()
  );
}

/**
 * Get count of tracked domains
 */
function getDomainCount(): number {
  return domains().size;
}

/**
 * Check if a domain has any intelligence
 */
function hasDomain(domain: string): boolean {
  return domains().has(extractDomain(domain));
}

// =============================================================================
// Management Functions
// =============================================================================

/**
 * Remove a domain from tracking
 */
function removeDomain(domain: string): boolean {
  const normalized = extractDomain(domain);
  const current = domains();

  if (!current.has(normalized)) {
    return false;
  }

  const updated = new Map(current);
  updated.delete(normalized);
  setDomains(updated);

  // Clear selection if this was the selected domain
  if (selectedDomain() === normalized) {
    setSelectedDomain(null);
    setDomainViewMode('list');
  }

  return true;
}

/**
 * Clear all tracked domains
 */
function clearDomains(): void {
  setDomains(new Map());
  setSelectedDomain(null);
  setDomainViewMode('list');
}

/**
 * Add tags to a domain
 */
function addDomainTag(domain: string, tag: string): void {
  const normalized = extractDomain(domain);
  const intel = getDomainIntel(normalized);

  if (intel) {
    intel.tags = intel.tags || [];
    if (!intel.tags.includes(tag)) {
      intel.tags.push(tag);
      const updated = new Map(domains());
      updated.set(normalized, intel);
      setDomains(updated);
    }
  }
}

/**
 * Add a note to a domain
 */
function setDomainNote(domain: string, note: string): void {
  const normalized = extractDomain(domain);
  const intel = getDomainIntel(normalized);

  if (intel) {
    intel.notes = note;
    const updated = new Map(domains());
    updated.set(normalized, intel);
    setDomains(updated);
  }
}

// =============================================================================
// Navigation Functions
// =============================================================================

/**
 * Select next domain in list
 */
function selectNextDomain(): void {
  const list = listDomains();
  if (list.length === 0) return;

  const current = selectedDomain();
  if (current === null) {
    setSelectedDomain(list[0].domain);
    return;
  }

  const idx = list.findIndex(e => e.domain === current);
  const nextIdx = (idx + 1) % list.length;
  setSelectedDomain(list[nextIdx].domain);
}

/**
 * Select previous domain in list
 */
function selectPrevDomain(): void {
  const list = listDomains();
  if (list.length === 0) return;

  const current = selectedDomain();
  if (current === null) {
    setSelectedDomain(list[list.length - 1].domain);
    return;
  }

  const idx = list.findIndex(e => e.domain === current);
  const prevIdx = idx === 0 ? list.length - 1 : idx - 1;
  setSelectedDomain(list[prevIdx].domain);
}

/**
 * Toggle between list and detail view
 */
function toggleDomainDetail(): void {
  if (domainViewMode() === 'list') {
    // Auto-select first if none selected
    if (!selectedDomain() && listDomains().length > 0) {
      setSelectedDomain(listDomains()[0].domain);
    }
    setDomainViewMode('detail');
  } else {
    setDomainViewMode('list');
  }
}

/**
 * Get the currently selected domain's intelligence
 */
function getSelectedDomainIntel(): DomainIntelligence | undefined {
  const domain = selectedDomain();
  return domain ? getDomainIntel(domain) : undefined;
}

// =============================================================================
// Stats Functions
// =============================================================================

/**
 * Get aggregate stats across all domains
 */
function getDomainStats(): {
  total: number;
  withDns: number;
  withSeo: number;
  withSpider: number;
  withDownloads: number;
  totalDownloads: number;
  totalRequests: number;
} {
  const all = Array.from(domains().values());

  return {
    total: all.length,
    withDns: all.filter(d => d.dns).length,
    withSeo: all.filter(d => d.seo).length,
    withSpider: all.filter(d => d.spider).length,
    withDownloads: all.filter(d => d.downloads.length > 0).length,
    totalDownloads: all.reduce((sum, d) => sum + d.downloads.length, 0),
    totalRequests: all.reduce((sum, d) => sum + d.requests.length, 0),
  };
}

// =============================================================================
// Exports
// =============================================================================

export {
  // Signals (reactive state)
  domains,
  selectedDomain,
  setSelectedDomain,
  domainViewMode,
  setDomainViewMode,
  domainFilter,
  setDomainFilter,

  // Tracking functions
  trackDns,
  trackSeo,
  trackSpider,
  trackDownload,
  trackRequest,

  // Query functions
  getDomainIntel,
  listDomains,
  getDomainCount,
  hasDomain,
  getSelectedDomainIntel,

  // Management functions
  removeDomain,
  clearDomains,
  addDomainTag,
  setDomainNote,

  // Navigation functions
  selectNextDomain,
  selectPrevDomain,
  toggleDomainDetail,

  // Stats
  getDomainStats,

  // Helpers
  extractDomain,
};
