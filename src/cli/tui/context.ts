import type { Client } from '../../core/client.js';
import type { Interface } from 'node:readline';

export interface ShellContext {
  client: Client;
  rl: Interface;
  variables: Record<string, any>;
  baseUrl: string;
  currentDocUrl: string;
  lastResponse: any;
  printResponse: (res: any) => void;
  printError: (err: any) => void;
}
