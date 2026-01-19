#!/usr/bin/env node

// This file MUST be the entry point for the CLI.
// It suppresses warnings BEFORE any modules are loaded.
// ESM hoists imports, so we need this separate file with only dynamic imports.

// Suppress Node.js experimental warnings (e.g., SQLite from undici's cache store)
const originalEmit = process.emit.bind(process);
process.emit = function (event: string, ...args: unknown[]) {
  if (event === 'warning' && args[0] && typeof args[0] === 'object') {
    const warning = args[0] as { name?: string; message?: string };
    if (warning.name === 'ExperimentalWarning' && warning.message?.includes('SQLite')) {
      return false;
    }
  }
  return originalEmit(event, ...args);
} as typeof process.emit;

// Now dynamically import the actual CLI (this ensures the patch is applied first)
import('./index.js');
