import { EventEmitter } from 'events';

export class MockWebSocket extends EventEmitter {
  readyState = 0; // CONNECTING
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  private _sentMessages: any[] = [];

  constructor(public url: string, public protocols?: string | string[]) {
    super();
    // Simulate async connection
    setTimeout(() => {
      this.readyState = 1; // OPEN
      this.emit('open');
    }, 10);
  }

  addEventListener(event: string, listener: (...args: any[]) => void) {
      this.on(event, listener);
  }

  removeEventListener(event: string, listener: (...args: any[]) => void) {
      this.off(event, listener);
  }

  send(data: any) {
    if (this.readyState !== 1) {
        throw new Error('WebSocket is not connected');
    }
    this._sentMessages.push(data);
  }

  close(code?: number, reason?: string) {
    this.readyState = 3; // CLOSED
    // Emit CloseEvent-like object to match real WebSocket behavior
    const closeEvent = { code: code || 1000, reason: reason || '', wasClean: true };
    this.emit('close', closeEvent);
  }

  ping() {
      this.send('__heartbeat__');
  }

  // Test helpers
  receive(data: any) {
    this.emit('message', { data, isBinary: Buffer.isBuffer(data) });
  }

  simulateUnexpectedClose() {
      this.readyState = 3; // CLOSED
      const closeEvent = { code: 1006, reason: 'Abnormal Closure', wasClean: false };
      this.emit('close', closeEvent);
  }

  getSentMessages() {
      return this._sentMessages;
  }
}