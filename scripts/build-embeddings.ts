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
 *   pnpm build:embeddings --min-doc-size 3000 --max-section-size 2000
 *
 * Chunking Strategy:
 *   Smart chunking that keeps documents coherent:
 *   1. Small documents (< minDocSize) stay intact - no chunking
 *   2. Larger documents are split by H2 sections (## headings)
 *   3. Very large H2 sections (> maxSectionSize) are split further
 *
 *   This ensures search results are complete and useful, not fragmented.
 *
 * Options:
 *   --docs-path <path>        Path to docs directory (default: ./docs)
 *   --output <path>           Output file path (default: ./src/mcp/data/embeddings.json)
 *   --model <name>            Embedding model (default: BGESmallENV15)
 *   --min-doc-size <n>        Min size to trigger chunking (default: 3000)
 *   --max-section-size <n>    Max H2 section size before splitting (default: 2000)
 *   --debug                   Show debug output
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
  minDocSize: number;
  maxSectionSize: number;
} {
  const args = process.argv.slice(2);
  let docsPath = join(projectRoot, 'docs');
  let outputPath = join(projectRoot, 'src/mcp/data/embeddings.json');
  let model = 'BGESmallENV15';
  let debug = false;
  let minDocSize = 3000; // Documents smaller than this stay intact
  let maxSectionSize = 2000; // H2 sections larger than this get split

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--docs-path' && args[i + 1]) {
      docsPath = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[++i];
    } else if (args[i] === '--model' && args[i + 1]) {
      model = args[++i];
    } else if (args[i] === '--debug') {
      debug = true;
    } else if (args[i] === '--min-doc-size' && args[i + 1]) {
      minDocSize = parseInt(args[++i], 10);
    } else if (args[i] === '--max-section-size' && args[i + 1]) {
      maxSectionSize = parseInt(args[++i], 10);
    }
  }

  return { docsPath, outputPath, model, debug, minDocSize, maxSectionSize };
}

// Files to skip (navigation, internal docs, etc.)
const SKIP_FILES = [
  '_sidebar.md',
  '_navbar.md',
  '_coverpage.md',
  'README.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'LICENSE.md',
];

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
      // Skip blocklisted files
      if (!SKIP_FILES.includes(entry)) {
        files.push(fullPath);
      }
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

// Important domain terms to always capture
const DOMAIN_TERMS = [
  'retry', 'cache', 'timeout', 'backoff', 'jitter', 'exponential', 'linear',
  'stream', 'streaming', 'sse', 'websocket', 'ws',
  'middleware', 'plugin', 'hook', 'interceptor',
  'batch', 'parallel', 'concurrent', 'rate', 'limit', 'throttle',
  'pagination', 'cursor', 'offset', 'page',
  'auth', 'authentication', 'bearer', 'token', 'oauth', 'jwt',
  'proxy', 'cors', 'header', 'headers',
  'error', 'exception', 'circuit', 'breaker',
  'request', 'response', 'http', 'https', 'api',
  'json', 'xml', 'soap', 'grpc', 'graphql',
  'upload', 'download', 'progress', 'file',
  'dns', 'tls', 'ssl', 'certificate',
  'scrape', 'scraping', 'html', 'selector',
  'mcp', 'ai', 'llm', 'openai', 'anthropic',
  'configuration', 'configure', 'config', 'options', 'settings',
];

// Extract keywords from markdown content
function extractKeywords(content: string, title?: string): string[] {
  const keywords = new Set<string>();
  const textLower = content.toLowerCase();

  // Add domain terms that appear in content
  for (const term of DOMAIN_TERMS) {
    if (textLower.includes(term)) {
      keywords.add(term);
    }
  }

  // Extract keywords from title
  if (title) {
    const titleWords = title.toLowerCase().split(/[\s\-_]+/);
    for (const word of titleWords) {
      const cleaned = word.replace(/[^a-z0-9]/g, '');
      if (cleaned.length > 2) {
        keywords.add(cleaned);
      }
    }
  }

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

  // Inline code (important API names)
  const inlineCodeMatches = content.matchAll(/`([^`]+)`/g);
  for (const match of inlineCodeMatches) {
    const code = match[1].toLowerCase();
    // Skip long code snippets
    if (code.length > 2 && code.length < 30 && !code.includes(' ')) {
      keywords.add(code.replace(/[()[\]{}]/g, ''));
    }
  }

  // Function/method names
  const functionMatches = content.matchAll(/\b(create\w+|get\w+|set\w+|use\w+|on\w+)\b/gi);
  for (const match of functionMatches) {
    keywords.add(match[1].toLowerCase());
  }

  return Array.from(keywords).slice(0, 30); // Limit to 30 keywords
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

// Prepare content for display (keep code blocks and formatting)
function prepareDisplayContent(content: string): string {
  // Remove frontmatter
  let cleaned = content.replace(/^---[\s\S]*?---\n?/, '');

  // Remove images
  cleaned = cleaned.replace(/!\[[^\]]*\]\([^)]+\)/g, '');

  return cleaned.trim();
}

interface IndexedDoc {
  id: string;
  path: string;
  title: string;
  category: string;
  keywords: string[];
  content: string;
  /** Content optimized for display (preserves code blocks) */
  displayContent?: string;
  /** Section heading if this is a chunk */
  section?: string;
  /** Parent document path if this is a chunk */
  parentPath?: string;
}

interface DocumentSection {
  heading: string;
  level: number;
  content: string;
  startLine: number;
}

/**
 * Extract all heading-based sections from content.
 * Treats all heading levels (h1-h4) as equal hierarchy.
 */
function extractSections(content: string): DocumentSection[] {
  const lines = content.split('\n');
  const sections: DocumentSection[] = [];
  let currentSection: DocumentSection | null = null;
  let currentContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match h1-h4 headers (#{1,4})
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);

    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.content = currentContent.join('\n').trim();
        sections.push(currentSection);
      }

      // Start new section
      currentSection = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        content: '',
        startLine: i,
      };
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    } else {
      // Content before first heading - create intro section
      if (line.trim()) {
        if (!currentSection) {
          currentSection = {
            heading: 'Introduction',
            level: 1,
            content: '',
            startLine: 0,
          };
          currentContent = [];
        }
        currentContent.push(line);
      }
    }
  }

  // Save last section
  if (currentSection) {
    currentSection.content = currentContent.join('\n').trim();
    sections.push(currentSection);
  }

  return sections;
}

interface AccumulatedChunk {
  headings: string[];
  content: string;
}

/**
 * Accumulate sections into chunks based on character limit.
 *
 * Strategy:
 * 1. Accumulate sections one-by-one until hitting the limit
 * 2. If adding next section would exceed limit, close current chunk
 * 3. If a single section is > limit, create a chunk with just that section
 *
 * @param sections - Array of document sections
 * @param chunkSize - Max chars per chunk (default 200)
 */
function accumulateSections(
  sections: DocumentSection[],
  chunkSize: number
): AccumulatedChunk[] {
  const chunks: AccumulatedChunk[] = [];
  let currentHeadings: string[] = [];
  let currentContent = '';

  for (const section of sections) {
    const sectionText = `## ${section.heading}\n${section.content}`;
    const sectionLength = sectionText.length;

    // Case 1: Single section exceeds limit - make it its own chunk
    if (sectionLength > chunkSize && currentContent.length === 0) {
      chunks.push({
        headings: [section.heading],
        content: sectionText,
      });
      continue;
    }

    // Case 2: Adding this section would exceed limit - close current chunk first
    if (currentContent.length + sectionLength > chunkSize && currentContent.length > 0) {
      chunks.push({
        headings: [...currentHeadings],
        content: currentContent.trim(),
      });
      currentHeadings = [];
      currentContent = '';
    }

    // Case 3: Section alone exceeds limit (after closing previous)
    if (sectionLength > chunkSize) {
      chunks.push({
        headings: [section.heading],
        content: sectionText,
      });
      continue;
    }

    // Accumulate section
    currentHeadings.push(section.heading);
    currentContent += (currentContent ? '\n\n' : '') + sectionText;
  }

  // Don't forget the last chunk
  if (currentContent.length > 0) {
    chunks.push({
      headings: currentHeadings,
      content: currentContent.trim(),
    });
  }

  return chunks;
}

/**
 * Extract H2 sections from content (keeps H3/H4 within their parent H2).
 * This creates larger, more coherent chunks.
 */
function extractH2Sections(content: string): { heading: string; content: string }[] {
  const lines = content.split('\n');
  const sections: { heading: string; content: string }[] = [];
  let currentHeading = '';
  let currentContent: string[] = [];
  let inIntro = true;

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+)$/);

    if (h2Match) {
      // Save previous section
      if (currentContent.length > 0) {
        sections.push({
          heading: currentHeading || 'Introduction',
          content: currentContent.join('\n').trim(),
        });
      }
      currentHeading = h2Match[1].trim();
      currentContent = [];
      inIntro = false;
    } else if (line.match(/^#\s+/)) {
      // Skip H1 (usually the title)
      continue;
    } else {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentContent.length > 0) {
    sections.push({
      heading: currentHeading || 'Introduction',
      content: currentContent.join('\n').trim(),
    });
  }

  return sections.filter(s => s.content.length > 50); // Skip empty/tiny sections
}

/**
 * Index documents with smart chunking strategy.
 *
 * Strategy:
 * 1. Small documents (< minDocSize): Keep intact, no chunking
 * 2. Medium documents: Split by H2 sections
 * 3. Large H2 sections (> maxSectionSize): Split further using accumulation
 *
 * @param docsPath - Path to docs directory
 * @param minDocSize - Min size to trigger chunking (default 3000)
 * @param maxSectionSize - Max H2 section size before splitting (default 2000)
 */
function indexDocs(
  docsPath: string,
  minDocSize: number = 3000,
  maxSectionSize: number = 2000
): IndexedDoc[] {
  const files = walkDir(docsPath);
  const docs: IndexedDoc[] = [];
  let docIndex = 0;

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const relativePath = relative(docsPath, file);
    const docTitle = extractTitle(content) || basename(file, '.md');

    // Category is the first directory in the path, or 'root'
    const pathParts = relativePath.split('/');
    const category = pathParts.length > 1 ? pathParts[0] : 'root';

    const cleanContent = cleanContentForEmbedding(content);
    const displayContent = prepareDisplayContent(content);

    // Strategy 1: Small documents - keep intact
    if (cleanContent.length < minDocSize) {
      docs.push({
        id: `doc-${docIndex++}`,
        path: relativePath,
        title: docTitle,
        category,
        keywords: extractKeywords(content, docTitle),
        content: cleanContent,
        displayContent,
      });
      continue;
    }

    // Strategy 2: Larger documents - split by H2 sections
    const h2Sections = extractH2Sections(content);

    // If no H2 sections, keep document intact
    if (h2Sections.length <= 1) {
      docs.push({
        id: `doc-${docIndex++}`,
        path: relativePath,
        title: docTitle,
        category,
        keywords: extractKeywords(content, docTitle),
        content: cleanContent,
        displayContent,
      });
      continue;
    }

    // Create a document for each H2 section
    for (const section of h2Sections) {
      const sectionClean = cleanContentForEmbedding(section.content);
      const sectionDisplay = prepareDisplayContent(section.content);

      // Strategy 3: Very large H2 sections - split further
      if (sectionClean.length > maxSectionSize) {
        const subSections = extractSections(section.content);
        const chunks = accumulateSections(subSections, maxSectionSize);

        for (const chunk of chunks) {
          const chunkTitle = chunk.headings.length > 0
            ? `${docTitle} - ${section.heading} - ${chunk.headings[0]}`
            : `${docTitle} - ${section.heading}`;

          docs.push({
            id: `doc-${docIndex++}`,
            path: relativePath,
            title: chunkTitle,
            category,
            keywords: extractKeywords(chunk.content, chunkTitle),
            content: cleanContentForEmbedding(chunk.content),
            displayContent: prepareDisplayContent(chunk.content),
            section: section.heading,
            parentPath: relativePath,
          });
        }
      } else {
        // Normal H2 section - keep intact
        docs.push({
          id: `doc-${docIndex++}`,
          path: relativePath,
          title: `${docTitle} - ${section.heading}`,
          category,
          keywords: extractKeywords(section.content, `${docTitle} - ${section.heading}`),
          content: sectionClean,
          displayContent: sectionDisplay,
          section: section.heading,
          parentPath: relativePath,
        });
      }
    }
  }

  return docs;
}

// Main function
async function main() {
  const { docsPath, outputPath, model, debug, minDocSize, maxSectionSize } = parseArgs();

  console.log('[build-embeddings] Starting...');
  console.log(`  Docs path: ${docsPath}`);
  console.log(`  Output: ${outputPath}`);
  console.log(`  Model: ${model}`);
  console.log(`  Min doc size: ${minDocSize} chars (smaller docs stay intact)`);
  console.log(`  Max section size: ${maxSectionSize} chars (larger H2s get split)`);

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
  const docs = indexDocs(docsPath, minDocSize, maxSectionSize);
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
        section: doc.section,
        parentPath: doc.parentPath,
        content: doc.displayContent || doc.content,
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
      section: doc.section,
      parentPath: doc.parentPath,
      content: doc.displayContent || doc.content,
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
