import readline from 'node:readline';
import colors from '../../utils/colors.js';
import { createAI } from '../../ai/client.js';
import { ChatMessage } from '../../types/ai.js';

export async function startAIChat(rl: readline.Interface, provider: string = 'openai', apiKey?: string, model?: string) {
  console.clear();
  console.log(colors.bold(colors.magenta(`🤖 Rek AI Chat (${provider})`)));
  console.log(colors.gray('Type your message. Ctrl+C to exit.'));

  // Resolve API Key
  const envKey = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
  const key = apiKey || process.env[envKey];

  if (!key) {
    console.log(colors.yellow(`
Warning: No API Key found for ${provider}.`));
    console.log(`Please set it via environment variable ${colors.bold(envKey)} or passing it to the command.`);
    console.log(`Example: set ${envKey}=sk-... inside the shell.`);
    return;
  }

  // Initialize Client
  const client = createAI({
    defaultProvider: provider as any,
    providers: {
      [provider]: { apiKey: key }
    },
    observability: false 
  });

  // Conversation History
  const history: ChatMessage[] = [
    { role: 'system', content: 'You are Recker AI, a helpful and concise assistant in a terminal environment.' }
  ];

  rl.setPrompt(colors.magenta('You › '));
  rl.prompt();

  return new Promise<void>((resolve) => {
    const onLine = async (line: string) => {
      const input = line.trim();
      
      if (!input) {
        rl.prompt();
        return;
      }

      if (input.toLowerCase() === '/clear') {
        history.length = 1;
        console.clear();
        console.log(colors.gray('Context cleared.'));
        rl.prompt();
        return;
      }

      if (input.toLowerCase() === '/exit') {
        cleanup();
        resolve();
        return;
      }

      // Add user message
      history.push({ role: 'user', content: input });

      // Pause RL while generating to prevent input mess
      rl.pause();
      process.stdout.write(colors.cyan('AI  › '));

      let fullResponse = '';
      
      try {
        const stream = await client.stream({
          provider: provider as any,
          model: model,
          messages: history
        });

        for await (const chunk of stream) {
          const content = typeof chunk === 'string' ? chunk : (chunk as any).content || (chunk as any).delta?.content || '';
          if (content) {
              process.stdout.write(content);
              fullResponse += content;
          }
        }
        
        process.stdout.write('\n');
        history.push({ role: 'assistant', content: fullResponse });

      } catch (error: any) {
        console.log(colors.red(`
Error: ${error.message}`));
        if (error.cause) console.log(colors.gray(error.cause));
      } finally {
        rl.resume();
        rl.prompt();
      }
    };

    const cleanup = () => {
        rl.off('line', onLine);
        rl.off('SIGINT', onSigInt);
        process.stdin.off('keypress', onKeypress);
    };

    // Handle ESC to exit
    if (process.stdin.isTTY) readline.emitKeypressEvents(process.stdin);
    
    const onKeypress = (_str: string, key: { name: string }) => {
        if (key && key.name === 'escape') {
            cleanup();
            resolve();
        }
    };
    process.stdin.on('keypress', onKeypress);

    rl.on('line', onLine);
    
    // Handle Ctrl+C inside chat mode to exit chat but keep shell
    const onSigInt = () => {
        cleanup();
        resolve();
    };
    rl.once('SIGINT', onSigInt);
  });
}
