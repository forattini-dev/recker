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
