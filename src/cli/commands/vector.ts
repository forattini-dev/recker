import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';
import { MemoryVectorStore, VectorDocument } from '../../ai/vector/store.js';
import { promises as fs } from 'node:fs';

export interface VectorOptions {
  file: string;
  provider?: string;
  model?: string;
  json?: boolean;
}

// Helper to load/save store
async function loadStore(filePath: string): Promise<VectorDocument[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function saveStore(filePath: string, docs: VectorDocument[]) {
  await fs.writeFile(filePath, JSON.stringify(docs, null, 2), 'utf-8');
}

// Initialize AI client for embedding operations
async function initAI(provider?: string, model?: string) {
  const { createAI } = await import('../../ai/index.js');

  try {
    const aiClient = createAI({
      defaultProvider: provider as any,
    });

    return new MemoryVectorStore({
      client: aiClient,
      model: model
    });
  } catch (e: any) {
    console.error(colors.red(`AI Initialization Failed: ${e.message}`));
    console.log(colors.gray('Ensure you have OPENAI_API_KEY or other provider keys set.'));
    process.exit(1);
  }
}

export function registerVectorCommand(program: Command) {
  const vector = program.command('vector')
    .description('Manage a local vector store for RAG (Retrieval-Augmented Generation)')
    .example('rek vector add "Recker is a network tool" -f data.json', 'Add document')
    .example('rek vector search "network tool" -f data.json -l 3', 'Search')
    .example('rek vector info -f data.json', 'Show stats');

  vector.command('add')
    .description('Add a document to the store')
    .argument('<content>', {
      type: 'string',
      description: 'Text content to add',
      example: 'Recker is a network tool',
    })
    .option('file', {
      type: 'string',
      short: 'f',
      default: 'vectors.json',
      description: 'Vector store file path',
      example: 'data.json',
    })
    .option('metadata', {
      type: 'string',
      short: 'm',
      description: 'Metadata JSON for the document',
      example: '{"source":"docs"}',
    })
    .option('provider', {
      type: 'string',
      short: 'p',
      description: 'AI Provider (openai, google, ollama)',
      example: 'openai',
    })
    .option('model', {
      type: 'string',
      description: 'Embedding model',
      example: 'text-embedding-3-small',
    })
    .example('rek vector add "Recker is a network SDK"', 'Add simple document')
    .example('rek vector add "API docs" -f docs.json -m \'{"type":"docs"}\'', 'Add with metadata')
    .action(async (content: string, args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const filePath = options.file || 'vectors.json';

      // Load existing data and initialize store
      const existingDocs = await loadStore(filePath);
      const store = await initAI(options.provider, options.model);

      if (existingDocs.length > 0) {
        await store.add(existingDocs as any);
      }

      let metadata = {};
      if (options.metadata) {
        try {
          metadata = JSON.parse(options.metadata);
        } catch {
          console.error(colors.red('Invalid metadata JSON'));
          process.exit(1);
        }
      }

      console.log(colors.gray(`Generating embedding for: "${content.slice(0, 50)}${content.length > 50 ? '...' : ''}"...`));

      await store.add([{ content, metadata }]);

      const allDocs = Array.from((store as any).documents.values()) as VectorDocument[];
      await saveStore(filePath, allDocs);
      console.log(colors.green(`✔ Added document. Total: ${store.count}`));
    });

  vector.command('search')
    .description('Search the vector store')
    .argument('<query>', {
      type: 'string',
      description: 'Search query',
      example: 'network tool',
    })
    .option('file', {
      type: 'string',
      short: 'f',
      default: 'vectors.json',
      description: 'Vector store file path',
      example: 'data.json',
    })
    .option('limit', {
      type: 'number',
      short: 'l',
      default: 3,
      description: 'Maximum results to return',
      example: '5',
    })
    .option('threshold', {
      type: 'number',
      short: 't',
      default: 0.0,
      description: 'Similarity threshold (0-1)',
      example: '0.5',
    })
    .option('provider', {
      type: 'string',
      short: 'p',
      description: 'AI Provider (openai, google, ollama)',
      example: 'openai',
    })
    .option('model', {
      type: 'string',
      description: 'Embedding model',
      example: 'text-embedding-3-small',
    })
    .option('json', {
      short: 'j',
      description: 'Output as JSON',
    })
    .example('rek vector search "how to make requests"', 'Basic search')
    .example('rek vector search "api" -f docs.json -l 5 -t 0.5', 'Search with options')
    .action(async (query: string, args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const filePath = options.file || 'vectors.json';
      const limit = options.limit || 3;
      const threshold = options.threshold || 0.0;
      const jsonOutput = !!options.json;

      // Load existing data and initialize store
      const existingDocs = await loadStore(filePath);
      const store = await initAI(options.provider, options.model);

      if (existingDocs.length > 0) {
        await store.add(existingDocs as any);
      }

      console.log(colors.gray(`Searching for: "${query}"...`));

      const results = await store.search(query, limit, threshold);

      if (jsonOutput) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      console.log(`\n${colors.bold(colors.cyan('Search Results'))} (${results.length})\n`);

      results.forEach((res, i) => {
        const score = (res.score * 100).toFixed(1) + '%';
        const color = res.score > 0.8 ? colors.green : res.score > 0.5 ? colors.yellow : colors.gray;

        console.log(`${i + 1}. ${color(score)} - ${res.id}`);
        console.log(`   ${res.content.slice(0, 100).replace(/\n/g, ' ')}${res.content.length > 100 ? '...' : ''}`);
        if (res.metadata && Object.keys(res.metadata).length > 0) {
          console.log(`   ${colors.gray(JSON.stringify(res.metadata))}`);
        }
        console.log('');
      });
    });

  vector.command('info')
    .description('Show store statistics')
    .option('file', {
      type: 'string',
      short: 'f',
      default: 'vectors.json',
      description: 'Vector store file path',
      example: 'data.json',
    })
    .option('json', {
      short: 'j',
      description: 'Output as JSON',
    })
    .example('rek vector info', 'Show default store info')
    .example('rek vector info -f docs.json -j', 'Show as JSON')
    .action(async (args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const filePath = options.file || 'vectors.json';
      const jsonOutput = !!options.json;

      const existingDocs = await loadStore(filePath);

      if (jsonOutput) {
        console.log(JSON.stringify({ file: filePath, count: existingDocs.length, documents: existingDocs }, null, 2));
        return;
      }

      console.log(colors.cyan(`Vector Store: ${filePath}`));
      console.log(`Documents: ${existingDocs.length}`);
    });

  vector.command('clear')
    .description('Clear the vector store')
    .option('file', {
      type: 'string',
      short: 'f',
      default: 'vectors.json',
      description: 'Vector store file path',
      example: 'data.json',
    })
    .example('rek vector clear', 'Clear default store')
    .example('rek vector clear -f docs.json', 'Clear specific store')
    .action(async (args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const filePath = options.file || 'vectors.json';

      await saveStore(filePath, []);
      console.log(colors.green(`✔ Cleared vector store at ${filePath}`));
    });
}
