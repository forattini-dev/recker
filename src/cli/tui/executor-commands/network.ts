/**
 * Network Commands
 *
 * Commands for network diagnostics:
 * - ping: TCP connectivity test
 * - tls: TLS certificate inspection
 * - ip: IP geolocation lookup
 * - ws: WebSocket client
 */

import { isHelpArg } from './parser.js';
import type { CommandContext, CommandResult } from './types.js';

// =============================================================================
// Ping Command
// =============================================================================

export async function cmdPing(ctx: CommandContext, args: string[]): Promise<CommandResult> {
  let host = args[0];
  const portStr = args[1];

  // Show help if help flag or no args
  if (isHelpArg(host) || !host) {
    const base = ctx.baseUrl();
    if (!isHelpArg(host) && base) {
      try {
        const url = new URL(base);
        host = url.hostname;
      } catch {
        // Invalid URL, show help
      }
    }

    if (!host || isHelpArg(host)) {
      ctx.addHistoryItem({
        type: 'info',
        content: `TCP Ping - Test network connectivity

Usage: ping <host> [port]

Options:
  port    Port to connect to (default: 80)

Examples:
  ping google.com
  ping api.example.com 443
  ping localhost 3000`,
      });
      return { success: true };
    }
  }

  const port = portStr ? parseInt(portStr, 10) : 80;
  ctx.setIsLoading(true);

  try {
    const net = await import('node:net');
    const startTime = Date.now();

    const result = await new Promise<{ success: boolean; time: number }>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(5000);

      socket.on('connect', () => {
        const time = Date.now() - startTime;
        socket.destroy();
        resolve({ success: true, time });
      });

      socket.on('error', () => {
        resolve({ success: false, time: Date.now() - startTime });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({ success: false, time: 5000 });
      });

      socket.connect(port, host);
    });

    if (result.success) {
      ctx.addHistoryItem({
        type: 'response',
        content: { host, port, success: true, time: result.time },
        meta: { responseType: 'ping' },
      });
    } else {
      ctx.addHistoryItem({
        type: 'error',
        content: `Connection to ${host}:${port} failed (${result.time}ms)`,
      });
    }

    return { success: result.success };

  } catch (err: any) {
    ctx.addHistoryItem({ type: 'error', content: `Ping failed: ${err.message}` });
    return { success: false, error: err.message };

  } finally {
    ctx.setIsLoading(false);
  }
}

// =============================================================================
// TLS Command
// =============================================================================

export async function cmdTls(ctx: CommandContext, args: string[]): Promise<CommandResult> {
  let host = args[0];

  // Show help if help flag or no args
  if (isHelpArg(host) || !host) {
    const base = ctx.baseUrl();
    if (!isHelpArg(host) && base) {
      try {
        const url = new URL(base);
        host = url.hostname;
      } catch {
        // Invalid URL, show help
      }
    }
  }

  if (!host || isHelpArg(host)) {
    ctx.addHistoryItem({
      type: 'info',
      content: `TLS/SSL Security Inspection

Usage: tls <hostname> (or set base URL first)

Examples:
  tls google.com
  tls api.github.com

Shows: Certificate info, expiry, issuer, protocol, cipher suite`,
    });
    return { success: true };
  }

  ctx.setIsLoading(true);

  try {
    const tls = await import('node:tls');

    const hostname = host.replace(/^https?:\/\//, '').split('/')[0];
    const port = 443;

    const result = await new Promise<any>((resolve, reject) => {
      const socket = tls.connect({ host: hostname, port, servername: hostname }, () => {
        const cert = socket.getPeerCertificate();
        const protocol = socket.getProtocol();
        const cipher = socket.getCipher();

        socket.end();
        resolve({
          host: hostname,
          valid: socket.authorized,
          protocol,
          cipher: cipher?.name,
          subject: cert.subject?.CN,
          issuer: cert.issuer?.O,
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          fingerprint: cert.fingerprint,
        });
      });
      socket.on('error', reject);
      socket.setTimeout(10000, () => {
        socket.destroy();
        reject(new Error('Connection timeout'));
      });
    });

    const now = new Date();
    const expiry = new Date(result.validTo);
    const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    ctx.addHistoryItem({
      type: 'response',
      content: {
        host: result.host,
        valid: result.valid,
        issuer: result.issuer,
        subject: result.subject,
        validFrom: result.validFrom,
        validTo: result.validTo,
        daysRemaining: daysLeft,
        protocol: result.protocol,
        cipher: result.cipher,
        fingerprint: result.fingerprint,
      },
      meta: { responseType: 'tls' },
    });

    ctx.setLastResponse(result);
    return { success: true, data: result };

  } catch (err: any) {
    ctx.addHistoryItem({ type: 'error', content: `TLS inspection failed: ${err.message}` });
    return { success: false, error: err.message };
  } finally {
    ctx.setIsLoading(false);
  }
}

// =============================================================================
// IP Command
// =============================================================================

export async function cmdIp(ctx: CommandContext, args: string[]): Promise<CommandResult> {
  const ip = args[0];

  if (!ip || isHelpArg(ip)) {
    ctx.addHistoryItem({
      type: 'info',
      content: `IP Intelligence - Lookup IP geolocation

Usage: ip <address>

Examples:
  ip 8.8.8.8
  ip 2001:4860:4860::8888

Uses local GeoLite2 database for fast, offline lookups.`,
    });
    return { success: true };
  }

  ctx.setIsLoading(true);

  try {
    const { getIpInfo } = await import('../../../mcp/ip-intel.js');
    const info = await getIpInfo(ip);

    if (info.bogon) {
      ctx.addHistoryItem({
        type: 'info',
        content: `Warning: ${ip} is a Bogon/Private IP (${info.bogonType})`,
      });
      return { success: true, data: info };
    }

    // Parse lat/lon from loc string (format: "lat,lon")
    let lat: number | undefined;
    let lon: number | undefined;
    if (info.loc) {
      const [latStr, lonStr] = info.loc.split(',');
      lat = parseFloat(latStr);
      lon = parseFloat(lonStr);
    }

    ctx.addHistoryItem({
      type: 'response',
      content: {
        ip: info.ip,
        country: info.country,
        countryCode: info.countryCode,
        city: info.city,
        region: info.region,
        timezone: info.timezone,
        org: info.org,
        asn: info.asn ? String(info.asn) : undefined,
        lat,
        lon,
      },
      meta: { responseType: 'geoip' },
    });

    ctx.setLastResponse(info);
    return { success: true, data: info };

  } catch (err: any) {
    ctx.addHistoryItem({ type: 'error', content: `IP lookup failed: ${err.message}` });
    return { success: false, error: err.message };

  } finally {
    ctx.setIsLoading(false);
  }
}

// =============================================================================
// WebSocket Command
// =============================================================================

export async function cmdWs(ctx: CommandContext, args: string[]): Promise<CommandResult> {
  if (args.length === 0 || isHelpArg(args[0])) {
    ctx.addHistoryItem({
      type: 'info',
      content: `WebSocket Client

Usage: ws <url> [options]

Options:
  duration=<seconds>   Listen duration (default: 30)
  send=<message>       Send message on connect

Examples:
  ws wss://echo.websocket.org
  ws wss://api.example.com/events duration=60
  ws ws://localhost:8080 send="hello"

Note: For WebSocket server, use 'serve ws' or 'serve websocket &'`,
    });
    return { success: true };
  }

  let url = args[0];

  // Add wss:// if no protocol specified
  if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
    url = `wss://${url}`;
  }

  // Parse options
  const durationMatch = args.find(a => a.startsWith('duration='));
  const duration = durationMatch ? parseInt(durationMatch.split('=')[1], 10) * 1000 : 30000;

  const sendMatch = args.find(a => a.startsWith('send='));
  const sendMessage = sendMatch ? sendMatch.slice(5) : undefined;

  ctx.setIsLoading(true);
  ctx.addHistoryItem({ type: 'info', content: `Connecting to WebSocket: ${url} (${duration / 1000}s)` });

  try {
    const { createClient } = await import('../../../core/client.js');
    const client = createClient();
    const ws = client.websocket(url);

    const messages: any[] = [];
    const startTime = Date.now();

    // Set up event handlers
    ws.on('message', (msg) => {
      const content = msg.isBinary ? `<Binary ${msg.data.length} bytes>` : msg.data.toString();
      messages.push({ type: 'received', content, time: Date.now() - startTime });
    });

    ws.on('error', (err) => {
      messages.push({ type: 'error', content: err.message, time: Date.now() - startTime });
    });

    // Connect
    await ws.connect();
    ctx.addHistoryItem({ type: 'info', content: '✔ Connected' });

    // Send initial message if provided
    if (sendMessage && ws.isConnected) {
      ws.send(sendMessage);
      messages.push({ type: 'sent', content: sendMessage, time: Date.now() - startTime });
    }

    // Wait for duration
    await new Promise(resolve => setTimeout(resolve, duration));

    // Close connection
    if (ws.isConnected) {
      ws.close();
    }

    ctx.addHistoryItem({
      type: 'response',
      content: {
        url,
        duration: `${duration / 1000}s`,
        messagesReceived: messages.filter(m => m.type === 'received').length,
        messages: messages.slice(-10),
      },
    });

    ctx.setLastResponse({ messages });
    return { success: true, data: { messages } };

  } catch (err: any) {
    ctx.addHistoryItem({ type: 'error', content: `WebSocket error: ${err.message}` });
    return { success: false, error: err.message };

  } finally {
    ctx.setIsLoading(false);
  }
}
