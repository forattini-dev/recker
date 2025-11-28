import { Client } from '../core/client.js';
import { createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';

export interface Variant {
  url: string;
  bandwidth?: number;
  resolution?: string;
}

export interface Segment {
  url: string;
  duration: number;
  sequence: number;
  key?: KeyInfo;
}

export interface KeyInfo {
  method: string;
  uri?: string;
  iv?: string;
}

export interface HlsHooks {
  /** Modify manifest content before parsing */
  onManifest?: (manifest: string, url: string) => string | void;
  /** Select specific variant from master playlist */
  onVariantSelected?: (variants: Variant[], defaultSelected: Variant) => Variant | void;
  /** Modify or skip segment (return null to skip) */
  onSegment?: (segment: Segment) => Segment | void | null;
  /** Intercept key info for decryption */
  onKey?: (key: KeyInfo) => KeyInfo | void;
}

export interface HlsOptions extends HlsHooks {
  concurrency?: number;
  /** If true, merges chunks into a single file. If false, saves chunks individually. */
  merge?: boolean; 
  /** Enable live stream monitoring (polling) */
  live?: boolean;
  /** Max duration to record in milliseconds (for live) */
  duration?: number;
  /** On info/progress messages */
  onInfo?: (message: string) => void;
  /** On error message */
  onError?: (error: Error) => void;
}

interface PlaylistInfo {
  segments: Segment[];
  targetDuration: number;
  endList: boolean;
  mediaSequence: number;
}

/**
 * Basic M3U8 Parser
 */
function parseM3u8(content: string, baseUrl: string): PlaylistInfo {
  const lines = content.split('\n');
  const segments: Segment[] = [];
  let currentDuration = 0;
  let mediaSequence = 0;
  let targetDuration = 5; // Default
  let endList = false;
  let currentKey: KeyInfo | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
        targetDuration = parseFloat(line.split(':')[1]);
    } else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
        mediaSequence = parseInt(line.split(':')[1], 10);
    } else if (line.startsWith('#EXT-X-ENDLIST')) {
        endList = true;
    } else if (line.startsWith('#EXT-X-KEY:')) {
        // Parse Key
        // #EXT-X-KEY:METHOD=AES-128,URI="key.php",IV=0x...
        const attrs = line.substring(11);
        const methodMatch = attrs.match(/METHOD=([^,]+)/);
        const uriMatch = attrs.match(/URI="([^"]+)"/);
        const ivMatch = attrs.match(/IV=([^,]+)/);
        
        if (methodMatch) {
            currentKey = {
                method: methodMatch[1],
                uri: uriMatch ? uriMatch[1] : undefined,
                iv: ivMatch ? ivMatch[1] : undefined
            };
        }
    } else if (line.startsWith('#EXTINF:')) {
      const durationStr = line.substring(8).split(',', 1)[0];
      currentDuration = parseFloat(durationStr);
    } else if (!line.startsWith('#')) {
      let url = line;
      if (!url.startsWith('http')) {
        try {
            const base = new URL(baseUrl);
            const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);
            url = new URL(url, base.origin + basePath).toString();
        } catch {
            // If baseUrl is invalid relative path, just use as is (rare)
        }
      }
      
      segments.push({
        url,
        duration: currentDuration,
        sequence: 0, // Will be adjusted by mediaSequence
        key: currentKey
      });
    }
  }

  // Adjust sequences
  segments.forEach((seg, idx) => {
      seg.sequence = mediaSequence + idx;
  });

  return { segments, targetDuration, endList, mediaSequence };
}

function parseVariants(content: string, baseUrl: string): Variant[] {
    const lines = content.split('\n');
    const variants: Variant[] = [];
    let currentBandwidth: number | undefined;
    let currentResolution: string | undefined;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (line.startsWith('#EXT-X-STREAM-INF:')) {
            const bwMatch = line.match(/BANDWIDTH=(\d+)/);
            const resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
            if (bwMatch) currentBandwidth = parseInt(bwMatch[1], 10);
            if (resMatch) currentResolution = resMatch[1];
        } else if (!line.startsWith('#')) {
            let url = line;
            if (!url.startsWith('http')) {
                try {
                    const base = new URL(baseUrl);
                    const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);
                    url = new URL(url, base.origin + basePath).toString();
                } catch {} 
            }
            variants.push({
                url,
                bandwidth: currentBandwidth,
                resolution: currentResolution
            });
        }
    }
    return variants;
}

/**
 * Download HLS Stream (VOD or Live)
 */
export async function downloadHls(
  client: Client,
  manifestUrl: string,
  outputPath: string,
  options: HlsOptions = {}
) {
  const merge = options.merge !== false; 
  const concurrency = options.concurrency || 5;
  const isLive = options.live === true;
  const maxDuration = options.duration || (isLive ? Infinity : 0);
  const info = options.onInfo || (() => {});
  const error = options.onError || ((err) => { throw err; });

  const seenSegments = new Set<string>(); // Track downloaded URLs/Sequences
  
  // Ensure output dir
  const outputDir = merge ? dirname(outputPath) : outputPath;
  await mkdir(outputDir, { recursive: true });
  
  // Temp dir for chunks
  const tempDir = join(outputDir, `.tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  if (merge) {
      await mkdir(tempDir, { recursive: true });
  }

  // Resolve Master Playlist if needed
  let currentManifestUrl = manifestUrl;
  try {
    let initialManifest = await client.get(currentManifestUrl).text();
    
    // Hook: onManifest
    if (options.onManifest) {
        const modified = options.onManifest(initialManifest, currentManifestUrl);
        if (typeof modified === 'string') initialManifest = modified;
    }
    
    if (initialManifest.includes('#EXT-X-STREAM-INF')) {
        const variants = parseVariants(initialManifest, currentManifestUrl);
        if (variants.length > 0) {
            // Default: Last one (highest quality usually)
            let selected = variants[variants.length - 1];
            
            // Hook: onVariantSelected
            if (options.onVariantSelected) {
                const userSelected = options.onVariantSelected(variants, selected);
                if (userSelected) selected = userSelected;
            }
            
            currentManifestUrl = selected.url;
            info(`Master playlist detected. Switching to variant: ${currentManifestUrl}`);
        }
    }
  } catch (err) {
      error(new Error(`Failed to fetch initial manifest: ${err}`));
      return;
  }


  const { RequestRunner } = await import('../runner/request-runner.js');
  const runner = new RequestRunner({ concurrency });

  const startTime = Date.now();
  let recording = true;

  while (recording) {
      try {
        // Fetch current playlist state
        let content = await client.get(currentManifestUrl).text();
        
        // Hook: onManifest (Live updates)
        if (options.onManifest) {
            const modified = options.onManifest(content, currentManifestUrl);
            if (typeof modified === 'string') content = modified;
        }

        const playlist = parseM3u8(content, currentManifestUrl);

        // Filter new segments
        let newSegments = playlist.segments.filter(s => !seenSegments.has(s.url));
        
        // Hook: onSegment (Filter/Modify)
        if (options.onSegment) {
            const filtered: Segment[] = [];
            for (const seg of newSegments) {
                // If key present, hook: onKey
                if (seg.key && options.onKey) {
                    const modifiedKey = options.onKey(seg.key);
                    if (modifiedKey) seg.key = modifiedKey;
                }

                const res = options.onSegment(seg);
                if (res === null) continue; // Skip
                if (res) filtered.push(res);
                else filtered.push(seg);
            }
            newSegments = filtered;
        }
        
        if (newSegments.length > 0) {
            info(`Found ${newSegments.length} new segments.`);
            
            // Download batch
            await runner.run(newSegments, async (seg) => {
                seenSegments.add(seg.url); 
                
                const fileDest = merge 
                    ? join(tempDir, `${seg.sequence.toString().padStart(10, '0')}.ts`) 
                    : join(outputDir, `segment_${seg.sequence}.ts`);
                
                await client.get(seg.url).write(fileDest);
            });
        }

        // Check stop conditions
        if (!isLive || playlist.endList) {
            recording = false;
            break;
        }

        if (maxDuration > 0 && (Date.now() - startTime) > maxDuration) {
            info('Max duration reached. Stopping.');
            recording = false;
            break;
        }

        // Wait for next update (targetDuration / 2 is usually a safe polling interval)
        const waitTime = Math.max(1000, (playlist.targetDuration * 1000) / 2);
        await new Promise(r => setTimeout(r, waitTime));
      } catch (err: any) {
          // If live, don't stop on temporary network errors, just warn and retry
          if (isLive) {
              info(`Error fetching live manifest, retrying: ${err.message}`);
              // Default to 5s wait if parse failed
              const waitTime = 5000; 
              await new Promise(r => setTimeout(r, waitTime));
          } else {
              error(new Error(`HLS download failed: ${err.message}`));
              recording = false;
          }
      }
  }

  // Merge Phase
  if (merge) {
      info('Merging segments...');
      const dest = createWriteStream(outputPath);
      
      const files = (await readdir(tempDir)).sort();
      
      for (const file of files) {
          if (!file.endsWith('.ts')) continue;
          const chunk = await readFile(join(tempDir, file));
          dest.write(chunk);
      }
      
      dest.end();
      
      // Cleanup
      await rm(tempDir, { recursive: true, force: true });
      info(`Saved to ${outputPath}`);
  } else {
      info(`Download complete.`);
  }
}