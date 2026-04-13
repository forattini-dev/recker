/**
 * Protocol Utilities
 *
 * Provides simple async interfaces for common network protocols
 * alongside the main HTTP client.
 */

// FTP
export {
  FTP,
  createFTP,
  ftp,
  type FTPConfig,
  type FTPListItem,
  type FTPTransferProgress,
  type FTPResponse
} from './ftp.js';

// SFTP
export {
  SFTP,
  createSFTP,
  sftp,
  type SFTPConfig,
  type SFTPListItem,
  type SFTPResponse
} from './sftp.js';

// Telnet
export {
  Telnet,
  createTelnet,
  telnet,
  type TelnetConfig,
  type TelnetResponse,
  type TelnetExecOptions
} from './telnet.js';

// RedDB
export {
  RedDbClient,
  createRedDbClient,
  reddb,
  type RedDbTransportMode,
  type RedDbResolvedTransport,
  type RedDbQueryStats,
  type RedDbQueryData,
  type RedDbBatchQueryData,
  type RedDbScanEntity,
  type RedDbScanData,
  type RedDbBulkInsertData,
  type RedDbCapabilities,
  type RedDbOperationMetrics,
  type RedDbOperationEnvelope,
  type RedDbQueryOptions,
  type RedDbScanRequest,
  type RedDbBulkInsertRowsRequest,
  type RedDbBinaryValue,
  type RedDbBulkInsertBinaryRequest,
  type RedDbEnsureCollectionOptions,
  type RedDbEnsureIndexOptions,
  type RedDbWarmupIndexOptions,
  type RedDbStatsOptions,
  type RedDbWireTlsOptions,
  type RedDbClientOptions
} from '../clients/reddb.js';
