import readline from 'node:readline';
import { createClient } from '../../core/client.js';
import { ReckerWebSocket } from '../../websocket/client.js';
import colors from '../../utils/colors.js';

export async function startInteractiveWebSocket(url: string, headers: Record<string, string>) {

  console.log(colors.gray('--------------------------------------------------'));
  console.log(colors.cyan(`Connecting to ${colors.bold(url)}...`));
  console.log(colors.gray('Commands: /quit to exit, /ping to send heartbeat'));
  console.log(colors.gray('--------------------------------------------------\n'));

  const client = createClient();
  let ws: ReckerWebSocket;

  try {
    ws = client.websocket(url, { headers });
  } catch (error: any) {
    console.error(colors.red(`Error creating WebSocket: ${error.message}`));
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: colors.green('>> '),
  });

  // UI Helper to print incoming messages without breaking the prompt line
  const printIncoming = (text: string) => {
    readline.cursorTo(process.stdout, 0); // Move to start of line
    readline.clearLine(process.stdout, 0); // Clear current line
    console.log(text);
    rl.prompt(true); // Redraw prompt
  };

  ws.on('open', () => {
    printIncoming(colors.green('✔ Connected!'));
    rl.prompt();
  });

  ws.on('close', (code, reason) => {
    printIncoming(colors.red(`✖ Disconnected (Code: ${code}${reason ? `, Reason: ${reason}` : ''})`));
    rl.close();
    process.exit(0);
  });

  ws.on('error', (err) => {
    printIncoming(colors.red(`⚠ Error: ${err.message}`));
  });

  ws.on('message', (msg) => {
    const content = msg.isBinary
      ? colors.yellow(`<Binary ${msg.data.length} bytes>`)
      : msg.data.toString();

    printIncoming(`${colors.cyan('<<')} ${content}`);
  });

  // Handle User Input
  rl.on('line', (line) => {
    const input = line.trim();

    // Move cursor up one line (to overwrite the input line user just hit enter on)
    // allowing us to format ">> message" beautifully
    readline.moveCursor(process.stdout, 0, -1);
    readline.clearLine(process.stdout, 0);
    console.log(`${colors.green('>>')} ${input}`);

    if (input === '/quit' || input === '/exit') {
      console.log(colors.gray('Closing connection...'));
      ws.close();
      rl.close();
      return;
    }

    if (input === '/ping') {
      ws.ping();
      console.log(colors.gray('(ping sent)'));
      rl.prompt();
      return;
    }

    if (input && ws.isConnected) {
      try {
        ws.send(input);
      } catch (err: any) {
        console.error(colors.red(`Failed to send: ${err.message}`));
      }
    } else if (input && !ws.isConnected) {
      console.log(colors.yellow('Not connected.'));
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
