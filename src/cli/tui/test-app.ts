#!/usr/bin/env npx tsx
/**
 * Test script for the new tuiuiu-based shell UI
 *
 * Run: pnpm exec tsx src/cli/tui/test-app.ts
 */

import { startShellUI, addHistoryItem, setIsLoading } from './app.js';

async function handleCommand(command: string): Promise<void> {
  console.log(`Executing: ${command}`);

  // Simulate loading
  setIsLoading(true);
  await new Promise(r => setTimeout(r, 500));
  setIsLoading(false);

  // Handle some test commands
  if (command === 'help') {
    addHistoryItem({
      type: 'info',
      content: 'Available commands: help, test, clear',
    });
  } else if (command === 'test') {
    addHistoryItem({
      type: 'response',
      content: { message: 'Hello from tuiuiu!', timestamp: new Date().toISOString() },
      meta: { status: 200, statusText: 'OK', time: 123 },
    });
  } else if (command.startsWith('http')) {
    addHistoryItem({
      type: 'response',
      content: { url: command, method: 'GET', simulated: true },
      meta: { status: 200, statusText: 'OK', time: 250 },
    });
  } else {
    addHistoryItem({
      type: 'error',
      content: `Unknown command: ${command}`,
    });
  }
}

// Start the UI
console.log('Starting tuiuiu shell test...');
startShellUI({ onCommand: handleCommand }).catch(console.error);
