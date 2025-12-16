import { spawn } from 'node:child_process';
import { Transport, ReckerRequest, ReckerResponse } from '../types/index.js';
import { HttpResponse } from '../core/response.js';
import { NetworkError } from '../core/errors.js';
import { getCurlPath, hasImpersonate } from '../utils/binary-manager.js';

export class CurlTransport implements Transport {
  async dispatch(req: ReckerRequest): Promise<ReckerResponse> {
    return new Promise(async (resolve, reject) => {
      const args = [
        '-X', req.method,
        req.url,
        '-i', // Include headers in output
        '-s', // Silent mode (no progress meter)
        '--compressed', // Handle gzip/deflate/br automatically
        '--no-keepalive' // Avoid hanging connection, treat as one-shot
      ];

      // Headers
      req.headers.forEach((val, key) => {
        args.push('-H', `${key}: ${val}`);
      });

      // Body
      if (req.body && typeof req.body === 'string') {
        args.push('-d', req.body);
      }

      // Allow overriding binary via env var (e.g. RECKER_CURL_BIN=curl-impersonate-chrome)
      let command = process.env.RECKER_CURL_BIN;
      if (!command) {
          if (await hasImpersonate()) {
              command = getCurlPath();
          } else {
              command = 'curl';
          }
      }

      const child = spawn(command, args);

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
      child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

      child.on('error', (err) => {
        reject(new NetworkError(`Failed to spawn curl: ${err.message}`, 'ERR_CURL_SPAWN', req));
      });

      child.on('close', (code) => {
        if (code !== 0) {
          const stderr = Buffer.concat(stderrChunks).toString();
          // Code 23 = Write error (often pipe closed), usually harmless if we got data? No.
          reject(new NetworkError(`Curl exited with code ${code}: ${stderr}`, 'ERR_CURL_EXIT', req));
          return;
        }

        const fullOutput = Buffer.concat(stdoutChunks);
        
        // Robust Header/Body Splitter
        // Curl -i can output multiple header blocks (100 Continue, Redirects).
        // We want the headers that match the final content.
        // Or if we didn't follow redirects (-L is off), it's just the first block.
        // Assuming no -L:
        
        let headerEndIndex = fullOutput.indexOf('\r\n\r\n');
        let offset = 4;
        
        if (headerEndIndex === -1) {
             headerEndIndex = fullOutput.indexOf('\n\n');
             offset = 2;
        }

        // Detect 100 Continue and skip it if present
        if (headerEndIndex !== -1) {
            const firstLine = fullOutput.subarray(0, Math.min(20, headerEndIndex)).toString();
            if (firstLine.startsWith('HTTP/1.1 100') || firstLine.startsWith('HTTP/2 100')) {
                // Find NEXT block
                const nextStart = headerEndIndex + offset;
                const secondSplit = fullOutput.indexOf('\r\n\r\n', nextStart);
                if (secondSplit !== -1) {
                    headerEndIndex = secondSplit;
                    offset = 4;
                }
            }
        }

        if (headerEndIndex === -1) {
             // Fallback: assume all body if no headers found (weird with -i)
             const nativeResponse = new Response(fullOutput, { status: 200, statusText: 'OK' });
             resolve(new HttpResponse(nativeResponse, { connection: { protocol: 'curl' } }));
             return;
        }

        const headerBlock = fullOutput.subarray(0, headerEndIndex).toString();
        const bodyBlock = fullOutput.subarray(headerEndIndex + offset);

        // Parse Headers
        const headerLines = headerBlock.split(/\r?\n/);
        const statusLine = headerLines[0]; 
        
        let status = 200;
        let statusText = 'OK';
        
        const statusMatch = statusLine.match(/HTTP\/[\d\.]+ (\d+) ?(.*)/);
        if (statusMatch) {
            status = parseInt(statusMatch[1], 10);
            statusText = statusMatch[2] || '';
        }

        const headers = new Headers();
        for (let i = 1; i < headerLines.length; i++) {
            const line = headerLines[i];
            const colon = line.indexOf(':');
            if (colon > 0) {
                const key = line.substring(0, colon).trim();
                const val = line.substring(colon + 1).trim();
                headers.append(key, val);
            }
        }

        const nativeResponse = new Response(bodyBlock, {
            status,
            statusText,
            headers
        });

        resolve(new HttpResponse(nativeResponse, {
            timings: {}, // Curl timings require complex formatting options
            connection: { protocol: 'curl' }
        }));
      });
    });
  }
}
