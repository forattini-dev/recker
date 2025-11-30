import readline from 'node:readline';
import { createClient } from '../../core/client.js';
import { ReckerWebSocket } from '../../websocket/client.js';
import pc from '../../utils/colors.js';

export async function startInteractiveWebSocket(url: string, headers: Record<string, string>) {

  console.log(pc.gray('--------------------------------------------------'));
  console.log(pc.cyan(`Connecting to ${pc.bold(url)}...`));
  console.log(pc.gray('Commands: /quit to exit, /ping to send heartbeat'));
  console.log(pc.gray('--------------------------------------------------\n'));

  const client = createClient();
  let ws: ReckerWebSocket;

  try {
    ws = client.websocket(url, { headers });
  } catch (error: any) {
    console.error(pc.red(`Error creating WebSocket: ${error.message}`));
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: pc.green('>> '),
  });

  // UI Helper to print incoming messages without breaking the prompt line
  const printIncoming = (text: string) => {
    readline.cursorTo(process.stdout, 0); // Move to start of line
    readline.clearLine(process.stdout, 0); // Clear current line
    console.log(text);
    rl.prompt(true); // Redraw prompt
  };

  ws.on('open', () => {
    printIncoming(pc.green('✔ Connected!'));
    rl.prompt();
  });

  ws.on('close', (code, reason) => {
    printIncoming(pc.red(`✖ Disconnected (Code: ${code}${reason ? `, Reason: ${reason}` : ''})`));
    rl.close();
    process.exit(0);
  });

  ws.on('error', (err) => {
    printIncoming(pc.red(`⚠ Error: ${err.message}`));
  });

  ws.on('message', (msg) => {
    const content = msg.isBinary
      ? pc.yellow(`<Binary ${msg.data.length} bytes>`)
      : msg.data.toString();

    printIncoming(`${pc.cyan('<<')} ${content}`);
  });

  // Handle User Input
  rl.on('line', (line) => {
    const input = line.trim();

    // Move cursor up one line (to overwrite the input line user just hit enter on)
    // allowing us to format ">> message" beautifully
    readline.moveCursor(process.stdout, 0, -1);
    readline.clearLine(process.stdout, 0);
    console.log(`${pc.green('>>')} ${input}`);

    if (input === '/quit' || input === '/exit') {
      console.log(pc.gray('Closing connection...'));
      ws.close();
      rl.close();
      return;
    }

    if (input === '/ping') {
      ws.ping();
      console.log(pc.gray('(ping sent)'));
      rl.prompt();
      return;
    }

    if (input && ws.isConnected) {
      try {
        ws.send(input);
      } catch (err: any) {
        console.error(pc.red(`Failed to send: ${err.message}`));
      }
    } else if (input && !ws.isConnected) {
      console.log(pc.yellow('Not connected.'));
    }

    rl.prompt();
  });

  rl.on('close', () => {
    if (ws.isConnected) {
        ws.close();
    }
  });

  // Start connection
  try {
    await ws.connect();
  } catch (error) {
    // Error event handled above
  }
}
