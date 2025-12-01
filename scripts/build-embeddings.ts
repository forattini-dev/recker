#!/usr/bin/env tsx
/**
 * Build Embeddings Script
 *
 * Generates pre-computed embeddings for MCP documentation.
 * This runs at build time (CI/CD) and produces a JSON file
 * that ships with the npm package.
 *
 * Requirements:
 * - fastembed (devDependency)
 * - Node.js 18+
 *
 * Usage:
 *   pnpm build:embeddings
 *   pnpm build:embeddings --docs-path ./custom-docs
 *   pnpm build:embeddings --output ./dist/mcp/data/embeddings.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative, extname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Parse command line arguments
function parseArgs(): {
  docsPath: string;
  outputPath: string;
  model: string;
  debug: boolean;
} {
  const args = process.argv.slice(2);
  let docsPath = join(projectRoot, 'docs');
  let outputPath = join(projectRoot, 'src/mcp/data/embeddings.json');
  let model = 'BGESmallENV15';
  let debug = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--docs-path' && args[i + 1]) {
      docsPath = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[++i];
    } else if (args[i] === '--model' && args[i + 1]) {
      model = args[++i];
    } else if (args[i] === '--debug') {
      debug = true;
    }
  }

  return { docsPath, outputPath, model, debug };
}

// Recursively walk directory for markdown files
function walkDir(dir: string): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) {
    return files;
  }

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip node_modules and hidden directories
      if (!entry.startsWith('.') && entry !== 'node_modules') {
        files.push(...walkDir(fullPath));
      }
    } else if (extname(entry) === '.md') {
      files.push(fullPath);
    }
  }

  return files;
}

// Extract title from markdown content
function extractTitle(content: string): string {
  // Try H1 header first
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  // Try frontmatter title
  const frontmatterMatch = content.match(/^---[\s\S]*?title:\s*["']?([^"'\n]+)["']?[\s\S]*?---/);
  if (frontmatterMatch) {
    return frontmatterMatch[1].trim();
  }

  return '';
}

// Extract keywords from markdown content
function extractKeywords(content: string): string[] {
  const keywords = new Set<string>();

  // Code block language identifiers
  const codeBlockMatches = content.matchAll(/```(\w+)/g);
  for (const match of codeBlockMatches) {
    if (match[1] && match[1].length > 2) {
      keywords.add(match[1].toLowerCase());
    }
  }

  // Headers (H2-H4)
  const headerMatches = content.matchAll(/^#{2,4}\s+(.+)$/gm);
  for (const match of headerMatches) {
    const words = match[1].toLowerCase().split(/\s+/);
    for (const word of words) {
      const cleaned = word.replace(/[^a-z0-9]/g, '');
      if (cleaned.length > 3) {
        keywords.add(cleaned);
      }
    }
  }

  // Inline code
  const inlineCodeMatches = content.matchAll(/`([^`]+)`/g);
  for (const match of inlineCodeMatches) {
    const code = match[1].toLowerCase();
    // Skip long code snippets
    if (code.length > 3 && code.length < 30 && !code.includes(' ')) {
      keywords.add(code.replace(/[()[\]{}]/g, ''));
    }
  }

  // Function/method names
  const functionMatches = content.matchAll(/\b(create\w+|get\w+|set\w+|use\w+|on\w+)\b/gi);
  for (const match of functionMatches) {
    keywords.add(match[1].toLowerCase());
  }

  return Array.from(keywords).slice(0, 20); // Limit to 20 keywords
}

// Remove code blocks and excessive whitespace for better embeddings
function cleanContentForEmbedding(content: string): string {
  // Remove frontmatter
  let cleaned = content.replace(/^---[\s\S]*?---\n?/, '');

  // Remove code blocks (keep just a marker)
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '[code example]');

  // Remove inline code backticks
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

  // Remove markdown links, keep text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove images
  cleaned = cleaned.replace(/!\[[^\]]*\]\([^)]+\)/g, '');

  // Remove HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, '');

  // Normalize whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/\s+/g, ' ');

  return cleaned.trim();
}

interface IndexedDoc {
  id: string;
  path: string;
  title: string;
  category: string;
  keywords: string[];
  content: string;
}

// Index documents from markdown files
function indexDocs(docsPath: string): IndexedDoc[] {
  const files = walkDir(docsPath);
  const docs: IndexedDoc[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const content = readFileSync(file, 'utf-8');
    const relativePath = relative(docsPath, file);
    const title = extractTitle(content) || basename(file, '.md');

    // Category is the first directory in the path, or 'root'
    const pathParts = relativePath.split('/');
    const category = pathParts.length > 1 ? pathParts[0] : 'root';

    docs.push({
      id: `doc-${i}`,
      path: relativePath,
      title,
      category,
      keywords: extractKeywords(content),
      content: cleanContentForEmbedding(content),
    });
  }

  return docs;
}

// Main function
async function main() {
  const { docsPath, outputPath, model, debug } = parseArgs();

  console.log('[build-embeddings] Starting...');
  console.log(`  Docs path: ${docsPath}`);
  console.log(`  Output: ${outputPath}`);
  console.log(`  Model: ${model}`);

  // Check if docs directory exists
  if (!existsSync(docsPath)) {
    console.error(`[build-embeddings] Error: Docs directory not found: ${docsPath}`);
    console.log('[build-embeddings] Creating empty embeddings file...');

    // Create empty embeddings file
    const emptyData = {
      version: '1.0',
      model: 'none',
      dimensions: 0,
      generatedAt: new Date().toISOString(),
      documents: [],
    };

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(emptyData, null, 2));
    console.log('[build-embeddings] Empty embeddings file created.');
    return;
  }

  // Index documents
  console.log('[build-embeddings] Indexing documents...');
  const docs = indexDocs(docsPath);
  console.log(`[build-embeddings] Found ${docs.length} documents`);

  if (docs.length === 0) {
    console.log('[build-embeddings] No documents found. Creating empty embeddings file...');
    const emptyData = {
      version: '1.0',
      model: 'none',
      dimensions: 0,
      generatedAt: new Date().toISOString(),
      documents: [],
    };

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(emptyData, null, 2));
    return;
  }

  // Try to load fastembed
  let FlagEmbedding: any;
  let EmbeddingModel: any;

  try {
    const fastembed = await import('fastembed');
    FlagEmbedding = fastembed.FlagEmbedding;
    EmbeddingModel = fastembed.EmbeddingModel;
  } catch (error) {
    console.log('[build-embeddings] fastembed not installed. Creating embeddings without vectors...');
    console.log('[build-embeddings] To enable semantic search, install fastembed:');
    console.log('  pnpm add -D fastembed');

    // Create embeddings file without vectors
    const data = {
      version: '1.0',
      model: 'none',
      dimensions: 0,
      generatedAt: new Date().toISOString(),
      documents: docs.map((doc) => ({
        id: doc.id,
        path: doc.path,
        title: doc.title,
        category: doc.category,
        keywords: doc.keywords,
        vector: [], // Empty vector - fuzzy search only
      })),
    };

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`[build-embeddings] Created embeddings file (fuzzy-only mode)`);
    return;
  }

  // Initialize embedding model
  console.log('[build-embeddings] Loading embedding model...');
  const modelEnum =
    EmbeddingModel[model as keyof typeof EmbeddingModel] || EmbeddingModel.BGESmallENV15;

  const embedding = await FlagEmbedding.init({
    model: modelEnum,
    showDownloadProgress: true,
  });

  // Generate embeddings
  console.log('[build-embeddings] Generating embeddings...');
  const texts = docs.map((doc) => {
    // Prefix with "passage:" for BGE models
    const text = `${doc.title}. ${doc.content}`;
    return `passage: ${text.slice(0, 1000)}`; // Limit to 1000 chars
  });

  const vectors: number[][] = [];
  const batchSize = 32;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    console.log(
      `[build-embeddings] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)}`
    );

    for await (const batchVectors of embedding.embed(batch, batchSize)) {
      vectors.push(...batchVectors);
    }
  }

  // Build output data
  const dimensions = vectors[0]?.length || 0;
  const data = {
    version: '1.0',
    model,
    dimensions,
    generatedAt: new Date().toISOString(),
    documents: docs.map((doc, i) => ({
      id: doc.id,
      path: doc.path,
      title: doc.title,
      category: doc.category,
      keywords: doc.keywords,
      // Round vectors to 4 decimal places to reduce file size
      vector: vectors[i]?.map((v) => Math.round(v * 10000) / 10000) || [],
    })),
  };

  // Write output file
  mkdirSync(dirname(outputPath), { recursive: true });
  const jsonOutput = JSON.stringify(data);
  writeFileSync(outputPath, jsonOutput);

  const sizeKB = (jsonOutput.length / 1024).toFixed(1);
  console.log(`[build-embeddings] Done!`);
  console.log(`  Documents: ${docs.length}`);
  console.log(`  Dimensions: ${dimensions}`);
  console.log(`  Output size: ${sizeKB}KB`);
  console.log(`  File: ${outputPath}`);

  if (debug) {
    console.log('\n[debug] Sample documents:');
    for (const doc of docs.slice(0, 3)) {
      console.log(`  - ${doc.title} (${doc.path})`);
      console.log(`    Keywords: ${doc.keywords.slice(0, 5).join(', ')}`);
    }
  }
}

main().catch((error) => {
  console.error('[build-embeddings] Error:', error);
  process.exit(1);
});
