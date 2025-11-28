// WebSocket Examples for Recker HTTP Client

import { ReckerWebSocket, websocket } from 'recker';

// ======================
// Basic WebSocket Connection
// ======================

const ws1 = new ReckerWebSocket('ws://localhost:8080');

// Wait for connection
await ws1.connect();

console.log('Connected!', ws1.isConnected);

// Send text message
ws1.send('Hello, WebSocket!');

// Send binary data
const buffer = Buffer.from('Binary message');
ws1.send(buffer);

// Send JSON
ws1.sendJSON({ type: 'greeting', message: 'Hello' });

// Listen for messages
ws1.on('message', (msg) => {
  console.log('Received:', msg.data);
  console.log('Is binary:', msg.isBinary);
});

// Listen for close
ws1.on('close', (code, reason) => {
  console.log('Connection closed:', code, reason);
});

// Close connection
ws1.close();

// ======================
// Auto-Connect Helper
// ======================

// Creates and auto-connects
const ws2 = websocket('ws://localhost:8080');

// Connection opens asynchronously
ws2.on('open', () => {
  console.log('WebSocket opened!');
  ws2.send('Hello from auto-connect!');
});

// ======================
// Auto-Reconnect
// ======================

const ws3 = new ReckerWebSocket('ws://localhost:8080', {
  reconnect: true,
  reconnectDelay: 1000,         // Initial delay: 1 second
  maxReconnectAttempts: 5       // Try 5 times before giving up
});

await ws3.connect();

ws3.on('reconnecting', (attempt, delay) => {
  console.log(`Reconnecting... attempt ${attempt}, delay ${delay}ms`);
});

ws3.on('max-reconnect-attempts', () => {
  console.log('Failed to reconnect after max attempts');
});

// ======================
// Heartbeat / Keep-Alive
// ======================

const ws4 = new ReckerWebSocket('ws://localhost:8080', {
  heartbeatInterval: 30000  // Send ping every 30 seconds
});

await ws4.connect();

// Heartbeat runs automatically
// Server should respond to pings to keep connection alive

// Manual ping
ws4.ping();

// ======================
// Custom Protocols & Headers
// ======================

const ws5 = new ReckerWebSocket('ws://localhost:8080', {
  protocols: ['chat', 'superchat'],  // WebSocket subprotocols
  headers: {
    'Authorization': 'Bearer token123',
    'X-Custom-Header': 'value'
  }
});

await ws5.connect();

// ======================
// Async Iteration
// ======================

const ws6 = websocket('ws://localhost:8080');

// Wait for connection
await new Promise(resolve => ws6.on('open', resolve));

// Iterate over messages
for await (const msg of ws6) {
  console.log('Message:', msg.data);

  // Process message
  if (msg.data === 'STOP') {
    break;
  }
}

// ======================
// Real-time Chat Example
// ======================

async function chatClient(username: string) {
  const ws = new ReckerWebSocket('ws://chat.example.com', {
    reconnect: true,
    heartbeatInterval: 30000
  });

  await ws.connect();

  // Send join message
  ws.sendJSON({ type: 'join', username });

  // Listen for chat messages
  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.data as string);

      switch (data.type) {
        case 'chat':
          console.log(`${data.username}: ${data.message}`);
          break;
        case 'join':
          console.log(`${data.username} joined the chat`);
          break;
        case 'leave':
          console.log(`${data.username} left the chat`);
          break;
      }
    } catch (err) {
      console.error('Failed to parse message:', err);
    }
  });

  // Send chat message
  const sendMessage = (message: string) => {
    ws.sendJSON({ type: 'chat', username, message });
  };

  return { ws, sendMessage };
}

// Usage
const { ws, sendMessage } = await chatClient('Alice');
sendMessage('Hello everyone!');

// ======================
// Live Stock Ticker
// ======================

async function stockTicker(symbols: string[]) {
  const ws = new ReckerWebSocket('wss://api.stocks.example.com', {
    reconnect: true,
    maxReconnectAttempts: 10,
    heartbeatInterval: 15000
  });

  await ws.connect();

  // Subscribe to symbols
  ws.sendJSON({ type: 'subscribe', symbols });

  const prices = new Map<string, number>();

  ws.on('message', (msg) => {
    const update = JSON.parse(msg.data as string);

    if (update.type === 'price') {
      prices.set(update.symbol, update.price);
      console.log(`${update.symbol}: $${update.price}`);
    }
  });

  ws.on('reconnecting', () => {
    console.log('Connection lost, reconnecting...');
  });

  ws.on('open', () => {
    // Resubscribe after reconnection
    ws.sendJSON({ type: 'subscribe', symbols });
  });

  return { ws, prices };
}

// Usage
const { ws: stockWs, prices } = await stockTicker(['AAPL', 'GOOGL', 'MSFT']);

// ======================
// Live Notifications
// ======================

async function notificationStream() {
  const ws = new ReckerWebSocket('wss://api.example.com/notifications', {
    headers: {
      'Authorization': 'Bearer your-token'
    },
    reconnect: true,
    heartbeatInterval: 20000
  });

  await ws.connect();

  ws.on('message', (msg) => {
    const notification = JSON.parse(msg.data as string);

    // Show browser notification
    if ('Notification' in globalThis) {
      new Notification(notification.title, {
        body: notification.body,
        icon: notification.icon
      });
    }
  });

  return ws;
}

// ======================
// Game State Sync
// ======================

async function gameClient() {
  const ws = new ReckerWebSocket('wss://game.example.com/sync', {
    reconnect: true,
    reconnectDelay: 500,
    maxReconnectAttempts: 20,
    heartbeatInterval: 5000  // Fast heartbeat for real-time gaming
  });

  await ws.connect();

  const sendAction = (action: string, data: any) => {
    ws.sendJSON({
      type: 'action',
      action,
      data,
      timestamp: Date.now()
    });
  };

  ws.on('message', (msg) => {
    const gameState = JSON.parse(msg.data as string);

    // Update local game state
    if (gameState.type === 'state_update') {
      console.log('Game state updated:', gameState);
    }
  });

  return { ws, sendAction };
}

// Usage
const { ws: gameWs, sendAction } = await gameClient();
sendAction('move', { x: 100, y: 200 });

// ======================
// Binary Data Streaming
// ======================

async function binaryStream() {
  const ws = new ReckerWebSocket('wss://api.example.com/stream');

  await ws.connect();

  ws.on('message', (msg) => {
    if (msg.isBinary) {
      const buffer = msg.data as Buffer;
      console.log('Received binary data:', buffer.length, 'bytes');

      // Process binary data (e.g., audio, video, images)
      // ...
    } else {
      // Handle text metadata
      const metadata = JSON.parse(msg.data as string);
      console.log('Metadata:', metadata);
    }
  });

  // Send binary data
  const audioData = new Uint8Array(1024);
  ws.send(audioData.buffer);

  return ws;
}

// ======================
// Error Handling
// ======================

const ws7 = new ReckerWebSocket('ws://localhost:8080', {
  reconnect: true
});

ws7.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws7.on('close', (code, reason) => {
  console.log('Closed:', code, reason);

  if (code === 1006) {
    console.log('Abnormal closure - connection lost');
  } else if (code === 1000) {
    console.log('Normal closure');
  }
});

try {
  await ws7.connect();
} catch (error) {
  console.error('Connection failed:', error);
}

// ======================
// Connection State
// ======================

const ws8 = websocket('ws://localhost:8080');

// Check connection state
console.log('Ready state:', ws8.readyState);
// 0 = CONNECTING
// 1 = OPEN
// 2 = CLOSING
// 3 = CLOSED

console.log('Is connected:', ws8.isConnected);

// ======================
// Cleanup
// ======================

// Close with custom code and reason
ws8.close(1000, 'Client shutting down');

// Or use default (code 1000, no reason)
ws8.close();
