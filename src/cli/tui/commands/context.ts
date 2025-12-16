import { Client } from '../../../core/client.js';

export interface ShellContext {
  client: Client;
  baseUrl?: string;
  currentDocUrl?: string;
  lastResponse?: any;
  getBaseDomain(): string | undefined | null;
  getRootDomain(): string | undefined | null;
}