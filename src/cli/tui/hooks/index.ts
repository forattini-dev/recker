/**
 * Hooks for rek shell TUI
 */

export * from './useShellState.js';
export * from './useJobs.js';
export * from './useOverlays.js';
export * from './useProxy.js';
// useDomains has conflicting export with useShellState (DnsRecord)
// Export only what's needed or use explicit imports
export {
  trackDns,
  trackSeo,
  trackSpider,
  trackDownload,
  trackRequest,
  getDomainIntel,
  listDomains,
  getDomainCount,
  hasDomain,
  getSelectedDomainIntel,
  removeDomain,
  clearDomains,
  addDomainTag,
  setDomainNote,
  selectNextDomain,
  selectPrevDomain,
  toggleDomainDetail,
  getDomainStats,
  extractDomain,
  domains,
  selectedDomain,
  setSelectedDomain,
  domainViewMode,
  setDomainViewMode,
  domainFilter,
  setDomainFilter,
  type DomainIntelligence,
  type DomainEntry,
  type SeoIntelligence,
  type SpiderIntelligence,
  type DownloadEntry,
  type RequestEntry,
  type DnsIntelligence,
} from './useDomains.js';
export * from './useHelp.js';
export * from './useLoadTest.js';
export * from './useSystemMetrics.js';
