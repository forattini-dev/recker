/**
 * Unified Commands Index
 *
 * Exports all unified command handlers and definitions.
 * These handlers work in both CLI and TUI modes.
 */

// =============================================================================
// AI Commands
// =============================================================================
export { aiChatHandler, aiCommands } from './ai.js'

// =============================================================================
// API Commands
// =============================================================================
export {
  graphqlHandler as apiGraphqlHandler,
  httpHandler,
  harHandler as apiHarHandler,
  apiCommands,
  // HTTP method handlers for TUI shell
  getHandler,
  postHandler,
  putHandler,
  deleteHandler,
  patchHandler,
  headHandler,
  optionsHandler,
} from './api.js'

// =============================================================================
// Bench Commands
// =============================================================================
export { loadTestHandler, benchCommands } from './bench.js'

// =============================================================================
// DNS Commands
// =============================================================================
export {
  lookupHandler,
  reverseHandler,
  propagateHandler,
  healthHandler,
  spfHandler,
  dmarcHandler,
  dkimHandler,
  systemHandler,
  digHandler,
  emailAuditHandler,
  dnsCommands,
} from './dns.js'

// =============================================================================
// HAR Commands
// =============================================================================
export {
  harRecordHandler,
  harPlayHandler,
  harInfoHandler,
  harCommands,
} from './har.js'

// =============================================================================
// Network Commands
// =============================================================================
export {
  pingHandler,
  tlsHandler,
  ipHandler,
  wsHandler,
  whoisHandler,
  rdapHandler,
  networkCommands,
} from './network.js'

// =============================================================================
// Protocol Commands
// =============================================================================
export {
  ftpLsHandler,
  ftpGetHandler,
  ftpPutHandler,
  telnetHandler,
  graphqlHandler,
  jsonrpcHandler,
  soapHandler,
  odataHandler,
  protocolCommands,
} from './protocols.js'

// =============================================================================
// Scrape Commands
// =============================================================================
export { scrapeHandler, scrapeCommands } from './scrape.js'

// =============================================================================
// Security Commands
// =============================================================================
export { securityHeadersHandler, securityCommands } from './security.js'

// =============================================================================
// SEO Commands
// =============================================================================
export {
  seoAnalyzeHandler,
  spiderHandler as seoSpiderHandler,
  robotsHandler,
  sitemapHandler,
  seoCommands,
} from './seo.js'

// =============================================================================
// Spider Commands
// =============================================================================
export { spiderHandler, spiderCommands } from './spider.js'

// =============================================================================
// Streaming Commands
// =============================================================================
export {
  hlsInfoHandler,
  hlsDownloadHandler,
  sseHandler,
  liveInfoHandler,
  liveDownloadHandler,
  streamingCommands,
} from './streaming.js'

// =============================================================================
// Utils Commands
// =============================================================================
export {
  uploadHandler,
  downloadHandler,
  proxyHandler,
  setupHandler,
  utilsCommands,
} from './utils.js'

// =============================================================================
// Video Commands
// =============================================================================
export {
  videoInfoHandler,
  videoSitesHandler,
  videoCheckHandler,
  videoShortcutsHandler,
  videoDownloadHandler,
  videoCommands,
} from './video.js'

// =============================================================================
// All Command Definitions (for TUI shell registration)
// =============================================================================
import { aiCommands } from './ai.js'
import { apiCommands } from './api.js'
import { benchCommands } from './bench.js'
import { dnsCommands } from './dns.js'
import { harCommands } from './har.js'
import { networkCommands } from './network.js'
import { protocolCommands } from './protocols.js'
import { scrapeCommands } from './scrape.js'
import { securityCommands } from './security.js'
import { seoCommands } from './seo.js'
import { spiderCommands } from './spider.js'
import { streamingCommands } from './streaming.js'
import { utilsCommands } from './utils.js'
import { videoCommands } from './video.js'

/**
 * All command definitions for easy iteration
 */
export const allCommandDefinitions = {
  ai: aiCommands,
  api: apiCommands,
  bench: benchCommands,
  dns: dnsCommands,
  har: harCommands,
  network: networkCommands,
  protocols: protocolCommands,
  scrape: scrapeCommands,
  security: securityCommands,
  seo: seoCommands,
  spider: spiderCommands,
  streaming: streamingCommands,
  utils: utilsCommands,
  video: videoCommands,
}
