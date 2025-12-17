/**
 * Video Module
 *
 * Provides video extraction and download capabilities.
 */

export { VideoBuilder, createVideoBuilder } from './builder.js';
export type {
  QualityOption,
  LiveOptions,
  DownloadOptions,
  ProgressCallback,
  VideoProgress,
} from './builder.js';
