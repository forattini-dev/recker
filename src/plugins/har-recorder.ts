import { Plugin, ReckerRequest, ReckerResponse } from '../types/index.js';

interface HarEntry {
  startedDateTime: string;
  time: number;
  request: any;
  response: any;
  timings: any;
  cache: {};
}

/**
 * Universal HAR Recorder
 * Records requests in memory and allows saving (Node) or downloading (Browser).
 */
export class HarRecorder {
  private entries: HarEntry[] = [];
  private isRecording = false;
  private onEntry?: (entry: HarEntry) => void;

  start() {
    this.isRecording = true;
    this.entries = [];
  }

  stop() {
    this.isRecording = false;
  }

  clear() {
    this.entries = [];
  }

  getEntries() {
    return this.entries;
  }

  setOnEntry(cb: (entry: HarEntry) => void) {
    this.onEntry = cb;
  }

  generateHar() {
    return {
      log: {
        version: '1.2',
        creator: { name: 'Recker', version: '1.0.0' },
        pages: [],
        entries: this.entries
      }
    };
  }

  /**
   * Browser: Download HAR file
   */
  download(filename = 'recker-session.har') {
    if (typeof Blob === 'undefined' || typeof document === 'undefined') {
      throw new Error('download() is only supported in browser. Use save() in Node.js');
    }

    const har = this.generateHar();
    const blob = new Blob([JSON.stringify(har, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Node.js: Save HAR to file
   */
  async save(path: string) {
    if (typeof window !== 'undefined') {
        throw new Error('save() is only supported in Node.js. Use download() in browser');
    }
    
    try {
        const fs = await import('node:fs/promises');
        const har = this.generateHar();
        await fs.writeFile(path, JSON.stringify(har, null, 2));
    } catch (e: any) {
        throw new Error(`Failed to save HAR: ${e.message}`);
    }
  }

  /**
   * Plugin middleware
   */
  plugin(): Plugin {
    return (client: any) => {
      if (!client.hooks.afterResponse) client.hooks.afterResponse = [];
      
      client.hooks.afterResponse.push(async (req: ReckerRequest, res: ReckerResponse) => {
        if (!this.isRecording) return;

        const entry: HarEntry = {
          startedDateTime: new Date().toISOString(),
          time: res.timings?.total || 0,
          request: {
            method: req.method,
            url: req.url,
            httpVersion: "HTTP/1.1",
            headers: this.mapHeaders(req.headers),
            queryString: [], 
            cookies: [],
            headersSize: -1,
            bodySize: -1,
          },
          response: {
            status: res.status,
            statusText: res.statusText,
            httpVersion: "HTTP/1.1",
            headers: this.mapHeaders(res.headers),
            cookies: [],
            content: {
              size: -1,
              mimeType: res.headers.get('content-type') || '',
              text: "[Body capture disabled]"
            },
            redirectURL: "",
            headersSize: -1,
            bodySize: -1,
          },
          cache: {},
          timings: {
            send: 0,
            wait: res.timings?.firstByte || 0,
            receive: (res.timings?.total || 0) - (res.timings?.firstByte || 0)
          }
        };

        this.entries.push(entry);
        this.onEntry?.(entry);
        return res;
      });
    };
  }

  private mapHeaders(headers: Headers): { name: string; value: string }[] {
    const arr: { name: string; value: string }[] = [];
    headers.forEach((value, key) => arr.push({ name: key, value }));
    return arr;
  }
}

export const harRecorder = new HarRecorder();
export const harRecorderPlugin = (options?: { path?: string, onEntry?: (entry: any) => void }) => {
    harRecorder.start();
    if (options?.onEntry) {
        harRecorder.setOnEntry(options.onEntry);
    }
    return harRecorder.plugin();
};