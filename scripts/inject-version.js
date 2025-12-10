#!/usr/bin/env node
/**
 * Inject version into dist/version.js
 *
 * This script is run during prepublishOnly to replace the placeholder
 * '__INJECT_VERSION__' with the actual version from package.json.
 *
 * This ensures that the published package has the version hardcoded,
 * eliminating the need to include package.json in the published files.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Read version from package.json
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));
const version = packageJson.version;

console.log(`Injecting version ${version} into dist/version.js...`);

// Path to the compiled version.js
const versionJsPath = join(rootDir, 'dist', 'version.js');

try {
  let content = readFileSync(versionJsPath, 'utf-8');

  // Replace the placeholder with actual version
  const placeholder = "__INJECT_VERSION__";
  if (!content.includes(placeholder)) {
    console.log('Warning: Placeholder not found in dist/version.js');
    console.log('The version may already be injected or the file structure changed.');
    process.exit(0);
  }

  // Only replace the first occurrence (the const declaration)
  // The comparison strings should remain as the placeholder
  content = content.replace(
    `const VERSION = '${placeholder}'`,
    `const VERSION = '${version}'`
  );

  // Also update the comparison strings to use the actual version
  // This makes the check VERSION !== 'placeholder' become VERSION !== 'version'
  // which will be false, so we need to invert the logic
  // Actually, let's just replace ALL placeholders - the logic should work:
  // - VERSION = '1.0.38'
  // - if (VERSION !== '1.0.38') -> false, skip
  // Wait, that's wrong. We need the check to be TRUE when version is injected.

  // New approach: change the check to look for a sentinel value
  // If VERSION starts with a digit, it was injected
  // For now, let's just replace ALL occurrences - in production:
  // - VERSION = '1.0.38'
  // - VERSION !== '1.0.38' -> false -> goes to fallback (WRONG!)

  // Correct approach:
  // In source: VERSION !== '__INJECT_VERSION__'
  // After injection: VERSION !== '__INJECT_VERSION__' (unchanged)
  // Now: '1.0.38' !== '__INJECT_VERSION__' -> true -> uses VERSION!

  // So we should ONLY replace the const declaration, NOT the comparison strings

  writeFileSync(versionJsPath, content, 'utf-8');

  // Verify
  const newContent = readFileSync(versionJsPath, 'utf-8');
  const hasInjectedVersion = newContent.includes(`const VERSION = '${version}'`);
  const hasPlaceholderInComparison = newContent.includes(`!== '${placeholder}'`);

  if (hasInjectedVersion && hasPlaceholderInComparison) {
    console.log(`✅ Successfully injected version ${version}`);
    console.log(`   VERSION constant: '${version}'`);
    console.log(`   Comparison still checks against placeholder`);
  } else if (hasInjectedVersion) {
    console.log(`✅ Injected version ${version}`);
  } else {
    console.log(`⚠️ Injection may have had issues`);
  }
} catch (error) {
  console.error('Error injecting version:', error.message);
  process.exit(1);
}
