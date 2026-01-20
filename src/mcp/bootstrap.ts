#!/usr/bin/env node

// This file MUST be the entry point for the MCP CLI.
// It suppresses warnings BEFORE any modules are loaded.
// ESM hoists imports, so we need this separate file with only dynamic imports.

// Now dynamically import the actual MCP CLI (separate file keeps ESM hoisting away)
import('./cli.js');
