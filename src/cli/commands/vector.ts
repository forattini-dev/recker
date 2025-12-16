import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';
import { CommandSchema, RekArgs, generateHelp } from '../parser/index.js';
import { MemoryVectorStore, VectorDocument } from '../../ai/vector/store.js';
import { promises as fs } from 'node:fs';
import pathMod from 'node:path';

const vectorSchema: CommandSchema = {
  name: 'vector',
  description: 'Manage a local vector store for RAG (Retrieval-Augmented Generation).\nStores embeddings in a local JSON file.',
  params: {
    file: { type: 'string', default: 'vectors.json', description: 'Vector store file path' },
    content: { type: 'string', description: 'Text content to add' },
    query: { type: 'string', description: 'Search query' },
    limit: { type: 'number', default: 3, description: 'Search limit' },
    threshold: { type: 'number', default: 0.0, description: 'Similarity threshold (0-1)' },
    metadata: { type: 'json', description: 'Metadata JSON for added content' },
    model: { type: 'string', description: 'Embedding model' },
    provider: { type: 'string', description: 'AI Provider (openai, google, ollama)' }
  },
  flags: {
    json: { description: 'Output JSON', alias: 'j' },
    clear: { description: 'Clear store before operation' }
  },
  examples: [
    { cmd: 'rek vector add content="Recker is a network tool" file=data.json', desc: 'Add document' },
    { cmd: 'rek vector search query="network tool" file=data.json limit:=1', desc: 'Search' },
    { cmd: 'rek vector info file=data.json', desc: 'Show stats' }
  ]
};

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

export function registerVectorCommand(program: Command) {
  const vector = program.command('vector')
    .description(vectorSchema.description)
    .addHelpText('after', generateHelp(vectorSchema));

  // Common handler for subcommands
  const handleVector = async (command: 'add' | 'search' | 'info' | 'clear', rawArgs: string[]) => {
    const { data, options, args } = RekArgs.parse(rawArgs, vectorSchema);
    const filePath = data.file;

    // Load existing data
    const existingDocs = await loadStore(filePath);
    
    // Initialize AI Client
    const { createClient } = await import('../../core/client.js');
    const { createAI } = await import('../../ai/index.js');
    
    // Check for API keys if we need to generate embeddings
    const needsAI = command === 'add' || command === 'search';
    let aiClient;
    
    if (needsAI) {
       // We can use createAI directly or via createClient if we want unified config
       // Let's use createAI for simplicity as we just need the AI interface
       // But we need to handle potential missing keys gracefully
       try {
         // Pass explicit provider if requested
         aiClient = createAI({
            defaultProvider: data.provider,
         });
       } catch (e: any) {
         console.error(colors.red(`AI Initialization Failed: ${e.message}`));
         console.log(colors.gray('Ensure you have OPENAI_API_KEY or other provider keys set.'));
         process.exit(1);
       }
    }

    const store = new MemoryVectorStore({
        client: aiClient,
        model: data.model
    });

    // Hydrate store (hacky: MemoryVectorStore doesn't have bulk load with existing embeddings public API?)
    // Actually add() takes docs with embeddings and skips generation.
    if (existingDocs.length > 0) {
        // We cast because add expects partial docs but we have full ones
        await store.add(existingDocs as any);
    }

    if (command === 'info') {
        console.log(colors.cyan(`Vector Store: ${filePath}`));
        console.log(`Documents: ${store.count}`);
        if (options.json) {
            console.log(JSON.stringify(existingDocs, null, 2));
        }
        return;
    }

    if (command === 'clear') {
        store.clear();
        await saveStore(filePath, []);
        console.log(colors.green(`Cleared vector store at ${filePath}`));
        return;
    }

    if (command === 'add') {
        if (!data.content && args.length === 0) {
            console.error(colors.red('Error: content=... is required'));
            process.exit(1);
        }
        
        const content = data.content || args.join(' ');
        const metadata = data.metadata || {};

        console.log(colors.gray(`Generating embedding for: "${content.slice(0, 50)}"...`));
        
        await store.add([
            {
                content,
                metadata
            }
        ]);

        // Extract docs using private property access workaround or we need a getDocs method on store
        // Since store.documents is private, we can't access it easily without modifying the class.
        // BUT, since this is CLI and we control the code, let's modify the Store class to expose export/import
        // OR just use the fact that we know we just added one doc to the existing list?
        // No, embeddings are generated inside.
        
        // Proper fix: Update MemoryVectorStore to have toJSON/fromJSON or expose documents.
        // For now, I'll use "any" to access private map
        const allDocs = Array.from((store as any).documents.values()) as VectorDocument[];
        
        await saveStore(filePath, allDocs);
        console.log(colors.green(`✔ Added document. Total: ${store.count}`));
    }

    if (command === 'search') {
        if (!data.query && args.length === 0) {
            console.error(colors.red('Error: query=... is required'));
            process.exit(1);
        }

        const query = data.query || args.join(' ');
        console.log(colors.gray(`Searching for: "${query}"...`));

        const results = await store.search(query, data.limit, data.threshold);

        if (options.json) {
            console.log(JSON.stringify(results, null, 2));
            return;
        }

        console.log(`
${colors.bold(colors.cyan('Search Results'))} (${results.length})
`);
        
        results.forEach((res, i) => {
            const score = (res.score * 100).toFixed(1) + '%';
            const color = res.score > 0.8 ? colors.green : res.score > 0.5 ? colors.yellow : colors.gray;
            
            console.log(`${i+1}. ${color(score)} - ${res.id}`);
            console.log(`   ${res.content.slice(0, 100).replace(/\n/g, ' ')}...`);
            if (res.metadata && Object.keys(res.metadata).length > 0) {
                console.log(`   ${colors.gray(JSON.stringify(res.metadata))}`);
            }
            console.log('');
        });
    }
  };

  vector.command('add')
    .description('Add a document to the store')
    .argument('[content]', 'Text content')
    .argument('[args...]', 'Options: file=x metadata:=json')
    .action(async (content, rawArgs) => {
        // content might be in rawArgs if not positional, RekArgs handles it
        // We pass combined args
        const args = content ? [content, ...rawArgs] : rawArgs;
        await handleVector('add', args);
    });

  vector.command('search')
    .description('Search the vector store')
    .argument('[query]', 'Search query')
    .argument('[args...]', 'Options: file=x limit=3')
    .action(async (query, rawArgs) => {
        const args = query ? [query, ...rawArgs] : rawArgs;
        await handleVector('search', args);
    });

  vector.command('info')
    .description('Show store statistics')
    .argument('[args...]', 'Options: file=x')
    .action(async (rawArgs) => {
        await handleVector('info', rawArgs);
    });

  vector.command('clear')
    .description('Clear the vector store')
    .argument('[args...]', 'Options: file=x')
    .action(async (rawArgs) => {
        await handleVector('clear', rawArgs);
    });
}
