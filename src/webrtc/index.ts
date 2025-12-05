/**
 * Recker WebRTC Module
 *
 * Provides WebRTC utilities for peer-to-peer communication and data channels.
 * Note: WebRTC requires a browser environment or Node.js with wrtc package.
 */

import {
  StateError,
  TimeoutError,
  ConnectionError,
  UnsupportedError,
} from '../core/errors.js';

/**
 *
 * @example
 * ```typescript
 * import { WebRTCClient, SignalingChannel } from 'recker/webrtc';
 *
 * // Create a signaling channel (you provide the transport)
 * const signaling = new SignalingChannel({
 *   send: (msg) => ws.send(JSON.stringify(msg)),
 *   onMessage: (handler) => ws.on('message', (data) => handler(JSON.parse(data)))
 * });
 *
 * // Create WebRTC client
 * const client = new WebRTCClient({
 *   signaling,
 *   iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
 * });
 *
 * // Connect to peer
 * await client.connect('peer-id');
 *
 * // Send data
 * client.send({ type: 'chat', message: 'Hello!' });
 *
 * // Receive data
 * client.on('data', (data) => console.log('Received:', data));
 * ```
 *
 * @packageDocumentation
 */

import { EventEmitter } from 'node:events';

// ============================================================================
// Types
// ============================================================================

/**
 * ICE Server configuration
 */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * Signaling message types
 */
export type SignalingMessageType = 'offer' | 'answer' | 'ice-candidate' | 'bye';

/**
 * Signaling message
 */
export interface SignalingMessage {
  type: SignalingMessageType;
  from: string;
  to: string;
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit | null;
}

/**
 * Signaling channel interface
 */
export interface SignalingChannelOptions {
  /** Send a message to the signaling server */
  send: (message: SignalingMessage) => void | Promise<void>;
  /** Register handler for incoming messages */
  onMessage: (handler: (message: SignalingMessage) => void) => void;
  /** Optional: Called when channel is closed */
  onClose?: (handler: () => void) => void;
}

/**
 * WebRTC client options
 */
export interface WebRTCClientOptions {
  /** Local peer ID */
  peerId?: string;
  /** Signaling channel */
  signaling: SignalingChannelOptions;
  /** ICE servers for NAT traversal */
  iceServers?: IceServer[];
  /** Data channel options */
  dataChannelOptions?: RTCDataChannelInit;
  /** Connection timeout in ms */
  connectionTimeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Connection state
 */
export type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

/**
 * Peer connection info
 */
export interface PeerInfo {
  peerId: string;
  state: ConnectionState;
  dataChannelState: RTCDataChannelState | 'none';
  localCandidates: number;
  remoteCandidates: number;
  connectedAt?: Date;
}

// ============================================================================
// Signaling Channel
// ============================================================================

/**
 * Signaling channel wrapper
 *
 * Provides a clean interface for WebRTC signaling.
 * You need to provide the actual transport (WebSocket, HTTP, etc.)
 *
 * @example
 * ```typescript
 * const ws = new WebSocket('wss://signaling.example.com');
 *
 * const signaling = new SignalingChannel({
 *   send: (msg) => ws.send(JSON.stringify(msg)),
 *   onMessage: (handler) => {
 *     ws.on('message', (data) => handler(JSON.parse(data.toString())));
 *   }
 * });
 * ```
 */
export class SignalingChannel extends EventEmitter {
  private options: SignalingChannelOptions;

  constructor(options: SignalingChannelOptions) {
    super();
    this.options = options;

    // Register message handler
    this.options.onMessage((message) => {
      this.emit('message', message);
      this.emit(message.type, message);
    });

    // Register close handler
    if (this.options.onClose) {
      this.options.onClose(() => {
        this.emit('close');
      });
    }
  }

  /**
   * Send a signaling message
   */
  async send(message: SignalingMessage): Promise<void> {
    await this.options.send(message);
  }

  /**
   * Send an offer
   */
  async sendOffer(to: string, from: string, offer: RTCSessionDescriptionInit): Promise<void> {
    await this.send({ type: 'offer', from, to, payload: offer });
  }

  /**
   * Send an answer
   */
  async sendAnswer(to: string, from: string, answer: RTCSessionDescriptionInit): Promise<void> {
    await this.send({ type: 'answer', from, to, payload: answer });
  }

  /**
   * Send an ICE candidate
   */
  async sendIceCandidate(to: string, from: string, candidate: RTCIceCandidateInit): Promise<void> {
    await this.send({ type: 'ice-candidate', from, to, payload: candidate });
  }

  /**
   * Send bye (disconnect)
   */
  async sendBye(to: string, from: string): Promise<void> {
    await this.send({ type: 'bye', from, to, payload: null });
  }
}

// ============================================================================
// WebRTC Client
// ============================================================================

/**
 * WebRTC Client for peer-to-peer data communication
 *
 * Handles connection establishment, ICE negotiation, and data channel management.
 *
 * @example
 * ```typescript
 * const client = new WebRTCClient({
 *   peerId: 'my-peer-id',
 *   signaling: signalingChannel,
 *   iceServers: [
 *     { urls: 'stun:stun.l.google.com:19302' },
 *     { urls: 'turn:turn.example.com', username: 'user', credential: 'pass' }
 *   ]
 * });
 *
 * // Connect to another peer
 * await client.connect('remote-peer-id');
 *
 * // Send data
 * client.send({ type: 'message', content: 'Hello!' });
 *
 * // Listen for data
 * client.on('data', (data, peerId) => {
 *   console.log(`Received from ${peerId}:`, data);
 * });
 *
 * // Listen for connection events
 * client.on('connected', (peerId) => console.log(`Connected to ${peerId}`));
 * client.on('disconnected', (peerId) => console.log(`Disconnected from ${peerId}`));
 * ```
 */
export class WebRTCClient extends EventEmitter {
  private peerId: string;
  private signaling: SignalingChannel;
  private iceServers: IceServer[];
  private dataChannelOptions: RTCDataChannelInit;
  private connectionTimeout: number;
  private debug: boolean;

  private connections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();

  constructor(options: WebRTCClientOptions) {
    super();

    this.peerId = options.peerId || this.generatePeerId();
    this.signaling = new SignalingChannel(options.signaling);
    this.iceServers = options.iceServers || [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];
    this.dataChannelOptions = options.dataChannelOptions || {
      ordered: true,
    };
    this.connectionTimeout = options.connectionTimeout || 30000;
    this.debug = options.debug || false;

    this.setupSignalingHandlers();
  }

  /**
   * Get local peer ID
   */
  getPeerId(): string {
    return this.peerId;
  }

  /**
   * Get info about a peer connection
   */
  getPeerInfo(peerId: string): PeerInfo | null {
    const pc = this.connections.get(peerId);
    const dc = this.dataChannels.get(peerId);

    if (!pc) return null;

    return {
      peerId,
      state: pc.connectionState as ConnectionState,
      dataChannelState: dc?.readyState || 'none',
      localCandidates: 0, // Would need to track these
      remoteCandidates: 0,
    };
  }

  /**
   * Get all connected peers
   */
  getConnectedPeers(): string[] {
    return Array.from(this.connections.keys()).filter((peerId) => {
      const pc = this.connections.get(peerId);
      return pc?.connectionState === 'connected';
    });
  }

  /**
   * Connect to a peer
   */
  async connect(remotePeerId: string): Promise<void> {
    if (this.connections.has(remotePeerId)) {
      throw new StateError(`Already connected to peer: ${remotePeerId}`, {
        expectedState: 'disconnected',
        actualState: 'connected',
      });
    }

    this.log(`Connecting to peer: ${remotePeerId}`);

    const pc = this.createPeerConnection(remotePeerId);
    const dc = pc.createDataChannel('data', this.dataChannelOptions);
    this.setupDataChannel(remotePeerId, dc);

    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await this.signaling.sendOffer(remotePeerId, this.peerId, offer);

    // Wait for connection with timeout
    await this.waitForConnection(remotePeerId);
  }

  /**
   * Disconnect from a peer
   */
  disconnect(remotePeerId: string): void {
    this.log(`Disconnecting from peer: ${remotePeerId}`);

    const dc = this.dataChannels.get(remotePeerId);
    if (dc) {
      dc.close();
      this.dataChannels.delete(remotePeerId);
    }

    const pc = this.connections.get(remotePeerId);
    if (pc) {
      pc.close();
      this.connections.delete(remotePeerId);
    }

    this.pendingCandidates.delete(remotePeerId);

    // Notify remote peer
    this.signaling.sendBye(remotePeerId, this.peerId).catch(() => {});

    this.emit('disconnected', remotePeerId);
  }

  /**
   * Disconnect from all peers
   */
  disconnectAll(): void {
    for (const peerId of this.connections.keys()) {
      this.disconnect(peerId);
    }
  }

  /**
   * Send data to a peer
   */
  send(data: unknown, remotePeerId?: string): void {
    const message = typeof data === 'string' ? data : JSON.stringify(data);

    if (remotePeerId) {
      const dc = this.dataChannels.get(remotePeerId);
      if (!dc || dc.readyState !== 'open') {
        throw new StateError(`No open data channel to peer: ${remotePeerId}`, {
          expectedState: 'open',
          actualState: dc?.readyState ?? 'no-channel',
        });
      }
      dc.send(message);
    } else {
      // Broadcast to all connected peers
      for (const [peerId, dc] of this.dataChannels) {
        if (dc.readyState === 'open') {
          dc.send(message);
        }
      }
    }
  }

  /**
   * Send binary data to a peer
   */
  sendBinary(data: ArrayBuffer | Uint8Array, remotePeerId?: string): void {
    if (remotePeerId) {
      const dc = this.dataChannels.get(remotePeerId);
      if (!dc || dc.readyState !== 'open') {
        throw new StateError(`No open data channel to peer: ${remotePeerId}`, {
          expectedState: 'open',
          actualState: dc?.readyState ?? 'no-channel',
        });
      }
      // Use any to bypass strict type checking for cross-platform compatibility
      (dc as any).send(data);
    } else {
      for (const [, dc] of this.dataChannels) {
        if (dc.readyState === 'open') {
          (dc as any).send(data);
        }
      }
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private generatePeerId(): string {
    return `peer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private log(message: string, ...args: unknown[]): void {
    if (this.debug) {
      console.log(`[WebRTC:${this.peerId}] ${message}`, ...args);
    }
  }

  private createPeerConnection(remotePeerId: string): RTCPeerConnection {
    // Note: RTCPeerConnection is not available in Node.js by default
    // Users need to provide a polyfill like 'wrtc' or use this in a browser
    if (typeof RTCPeerConnection === 'undefined') {
      throw new UnsupportedError(
        'RTCPeerConnection is not available. In Node.js, install the "wrtc" package and ensure it\'s loaded before using WebRTC.',
        { feature: 'RTCPeerConnection' }
      );
    }

    const pc = new RTCPeerConnection({
      iceServers: this.iceServers as RTCIceServer[],
    });

    this.connections.set(remotePeerId, pc);
    this.pendingCandidates.set(remotePeerId, []);

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signaling.sendIceCandidate(remotePeerId, this.peerId, event.candidate.toJSON());
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      this.log(`Connection state with ${remotePeerId}: ${pc.connectionState}`);
      this.emit('connectionStateChange', remotePeerId, pc.connectionState);

      if (pc.connectionState === 'connected') {
        this.emit('connected', remotePeerId);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.emit('disconnected', remotePeerId);
      }
    };

    // Handle incoming data channels (for answerer)
    pc.ondatachannel = (event) => {
      this.log(`Received data channel from ${remotePeerId}`);
      this.setupDataChannel(remotePeerId, event.channel);
    };

    return pc;
  }

  private setupDataChannel(remotePeerId: string, dc: RTCDataChannel): void {
    this.dataChannels.set(remotePeerId, dc);

    dc.onopen = () => {
      this.log(`Data channel opened with ${remotePeerId}`);
      this.emit('dataChannelOpen', remotePeerId);
    };

    dc.onclose = () => {
      this.log(`Data channel closed with ${remotePeerId}`);
      this.emit('dataChannelClose', remotePeerId);
    };

    dc.onerror = (error) => {
      this.log(`Data channel error with ${remotePeerId}:`, error);
      this.emit('error', error, remotePeerId);
    };

    dc.onmessage = (event) => {
      let data = event.data;

      // Try to parse JSON
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          // Keep as string
        }
      }

      this.emit('data', data, remotePeerId);
    };
  }

  private setupSignalingHandlers(): void {
    // Handle incoming offers
    this.signaling.on('offer', async (message: SignalingMessage) => {
      if (message.to !== this.peerId) return;

      this.log(`Received offer from ${message.from}`);

      const pc = this.createPeerConnection(message.from);

      await pc.setRemoteDescription(message.payload as RTCSessionDescriptionInit);

      // Add any pending candidates
      await this.addPendingCandidates(message.from);

      // Create and send answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await this.signaling.sendAnswer(message.from, this.peerId, answer);
    });

    // Handle incoming answers
    this.signaling.on('answer', async (message: SignalingMessage) => {
      if (message.to !== this.peerId) return;

      this.log(`Received answer from ${message.from}`);

      const pc = this.connections.get(message.from);
      if (!pc) {
        this.log(`No connection found for ${message.from}`);
        return;
      }

      await pc.setRemoteDescription(message.payload as RTCSessionDescriptionInit);

      // Add any pending candidates
      await this.addPendingCandidates(message.from);
    });

    // Handle incoming ICE candidates
    this.signaling.on('ice-candidate', async (message: SignalingMessage) => {
      if (message.to !== this.peerId) return;

      const pc = this.connections.get(message.from);

      if (pc?.remoteDescription) {
        await pc.addIceCandidate(message.payload as RTCIceCandidateInit);
      } else {
        // Store for later
        const pending = this.pendingCandidates.get(message.from) || [];
        pending.push(message.payload as RTCIceCandidateInit);
        this.pendingCandidates.set(message.from, pending);
      }
    });

    // Handle bye
    this.signaling.on('bye', (message: SignalingMessage) => {
      if (message.to !== this.peerId) return;

      this.log(`Received bye from ${message.from}`);
      this.disconnect(message.from);
    });
  }

  private async addPendingCandidates(remotePeerId: string): Promise<void> {
    const pc = this.connections.get(remotePeerId);
    const candidates = this.pendingCandidates.get(remotePeerId) || [];

    for (const candidate of candidates) {
      await pc?.addIceCandidate(candidate);
    }

    this.pendingCandidates.set(remotePeerId, []);
  }

  private waitForConnection(remotePeerId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new TimeoutError(undefined, {
          phase: 'webrtc-connect',
          timeout: this.connectionTimeout,
        }));
      }, this.connectionTimeout);

      const checkConnection = () => {
        const dc = this.dataChannels.get(remotePeerId);
        if (dc?.readyState === 'open') {
          clearTimeout(timeout);
          resolve();
        }
      };

      this.on('dataChannelOpen', (peerId) => {
        if (peerId === remotePeerId) {
          clearTimeout(timeout);
          resolve();
        }
      });

      this.on('disconnected', (peerId) => {
        if (peerId === remotePeerId) {
          clearTimeout(timeout);
          reject(new ConnectionError(`Connection failed to peer: ${remotePeerId}`, {
            host: remotePeerId,
          }));
        }
      });

      // Check immediately in case already connected
      checkConnection();
    });
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Default STUN/TURN servers
 */
export const DEFAULT_ICE_SERVERS: IceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

/**
 * Check if WebRTC is available in the current environment
 */
export function isWebRTCAvailable(): boolean {
  return typeof RTCPeerConnection !== 'undefined';
}

/**
 * Get WebRTC support info
 */
export function getWebRTCSupport(): {
  available: boolean;
  dataChannels: boolean;
  media: boolean;
  environment: 'browser' | 'node' | 'unknown';
} {
  const isBrowser = typeof window !== 'undefined';
  const isNode = typeof process !== 'undefined' && process.versions?.node;

  return {
    available: typeof RTCPeerConnection !== 'undefined',
    dataChannels: typeof RTCPeerConnection !== 'undefined',
    media: typeof navigator !== 'undefined' && !!navigator.mediaDevices,
    environment: isBrowser ? 'browser' : isNode ? 'node' : 'unknown',
  };
}
