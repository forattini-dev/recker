// Model Context Protocol (MCP) Integration Examples

import { createMCPClient, MCPClient } from 'recker';

// ======================
// Basic MCP Connection
// ======================

const mcp = createMCPClient({
  endpoint: 'http://localhost:3000/mcp',
  clientName: 'my-app',
  clientVersion: '1.0.0',
  debug: true // Enable debug logging
});

// Connect and initialize
const serverInfo = await mcp.connect();
console.log('Connected to MCP server:', serverInfo);

// ======================
// Working with Tools
// ======================

// List all available tools
const tools = await mcp.tools.list();
console.log('Available tools:', tools);

// Get a specific tool
const weatherTool = await mcp.tools.get('get_weather');
if (weatherTool) {
  console.log('Weather tool schema:', weatherTool.inputSchema);
}

// Call a tool
const weatherResult = await mcp.tools.call('get_weather', {
  location: 'San Francisco, CA',
  units: 'celsius'
});
console.log('Weather:', weatherResult.content);

// Call multiple tools in sequence
const searchResult = await mcp.tools.call('web_search', {
  query: 'TypeScript best practices'
});

const summaryResult = await mcp.tools.call('summarize_text', {
  text: searchResult.content[0].text,
  maxLength: 200
});

// ======================
// Working with Resources
// ======================

// List all resources
const resources = await mcp.resources.list();
console.log('Available resources:', resources);

// Read a resource
const fileContent = await mcp.resources.read('file:///data/config.json');
console.log('Config:', JSON.parse(fileContent[0].text!));

// Subscribe to resource updates
await mcp.resources.subscribe('file:///data/live-data.json');

mcp.on('resource:updated', (update) => {
  console.log('Resource updated:', update);
});

// ======================
// Working with Prompts
// ======================

// List all prompt templates
const prompts = await mcp.prompts.list();
console.log('Available prompts:', prompts);

// Get a prompt with arguments
const reviewPrompt = await mcp.prompts.get('code_review', {
  language: 'typescript',
  style: 'concise'
});
console.log('Code review prompt:', reviewPrompt);

// ======================
// Event Handling
// ======================

// Connection events
mcp.on('connected', (info) => {
  console.log('MCP Connected:', info);
});

mcp.on('disconnected', () => {
  console.log('MCP Disconnected');
});

// Progress updates
mcp.on('progress', (progress) => {
  console.log(`Progress: ${progress.progress}/${progress.total || '?'}`);
});

// Resource changes
mcp.on('resources:changed', async () => {
  console.log('Resources list changed, refreshing...');
  const newResources = await mcp.resources.list();
  console.log('Updated resources:', newResources);
});

// Tool changes
mcp.on('tools:changed', async () => {
  console.log('Tools list changed');
  const newTools = await mcp.tools.list();
  console.log('Updated tools:', newTools);
});

// Error handling
mcp.on('error', (error) => {
  console.error('MCP Error:', error);
});

// ======================
// Real-world Example: AI Assistant
// ======================

async function aiAssistant() {
  const mcp = createMCPClient({
    endpoint: 'http://localhost:3000/mcp'
  });

  await mcp.connect();

  // Get user query
  const userQuery = 'What\'s the weather like in Paris?';

  // 1. Search for relevant information
  const searchResults = await mcp.tools.call('web_search', {
    query: `weather Paris current`
  });

  // 2. Get actual weather data
  const weatherData = await mcp.tools.call('get_weather', {
    location: 'Paris, France',
    units: 'celsius'
  });

  // 3. Format response using a prompt template
  const responsePrompt = await mcp.prompts.get('format_weather', {
    data: weatherData.content[0].text,
    style: 'friendly'
  });

  console.log('AI Response:', responsePrompt[0].content);

  await mcp.disconnect();
}

// ======================
// Real-world Example: Data Pipeline
// ======================

async function dataPipeline() {
  const mcp = createMCPClient({
    endpoint: 'http://localhost:3000/mcp',
    timeout: 60000 // 60 seconds for long operations
  });

  await mcp.connect();

  // Subscribe to data updates
  await mcp.resources.subscribe('db://users/stream');

  // Process updates in real-time
  mcp.on('resource:updated', async (update) => {
    console.log('New data:', update);

    // Transform data using a tool
    const transformed = await mcp.tools.call('transform_data', {
      data: update.content,
      schema: 'user_analytics'
    });

    // Store results
    await mcp.tools.call('store_data', {
      collection: 'analytics',
      data: transformed.content
    });
  });

  // Keep pipeline running
  console.log('Data pipeline running...');
}

// ======================
// Real-world Example: Content Generation
// ======================

async function contentGenerator() {
  const mcp = createMCPClient({
    endpoint: 'http://localhost:3000/mcp'
  });

  await mcp.connect();

  // Get blog post outline prompt
  const outline = await mcp.prompts.get('blog_outline', {
    topic: 'TypeScript Best Practices',
    audience: 'intermediate developers',
    length: 'long'
  });

  // Generate sections using tools
  const sections = [];
  for (const section of ['introduction', 'main_points', 'conclusion']) {
    const content = await mcp.tools.call('generate_content', {
      prompt: outline[0].content,
      section,
      style: 'professional'
    });

    sections.push(content.content[0].text);
  }

  // Combine and format
  const finalPost = await mcp.tools.call('format_blog_post', {
    sections,
    metadata: {
      title: 'TypeScript Best Practices',
      author: 'Your Name',
      date: new Date().toISOString()
    }
  });

  console.log('Generated blog post:', finalPost.content);

  await mcp.disconnect();
}

// ======================
// Advanced: Custom Error Handling
// ======================

async function robustMCPClient() {
  const mcp = createMCPClient({
    endpoint: 'http://localhost:3000/mcp',
    retries: 5,
    timeout: 30000
  });

  try {
    await mcp.connect();

    // Call tool with error handling
    try {
      const result = await mcp.tools.call('risky_operation', {
        input: 'test'
      });

      if (result.isError) {
        console.error('Tool returned error:', result.content);
        // Fallback strategy
        const fallback = await mcp.tools.call('safe_operation', {
          input: 'test'
        });
        console.log('Fallback result:', fallback);
      }
    } catch (error) {
      console.error('Tool call failed:', error);
      // Retry with different parameters
    }
  } finally {
    await mcp.disconnect();
  }
}

// ======================
// Advanced: Connection Pooling
// ======================

class MCPPool {
  private clients: MCPClient[] = [];
  private currentIndex = 0;

  constructor(
    private endpoint: string,
    private poolSize: number = 5
  ) {}

  async initialize() {
    for (let i = 0; i < this.poolSize; i++) {
      const client = createMCPClient({
        endpoint: this.endpoint,
        clientName: `pool-client-${i}`
      });
      await client.connect();
      this.clients.push(client);
    }
  }

  getClient(): MCPClient {
    const client = this.clients[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.poolSize;
    return client;
  }

  async shutdown() {
    await Promise.all(
      this.clients.map(client => client.disconnect())
    );
  }
}

// Usage
const pool = new MCPPool('http://localhost:3000/mcp', 10);
await pool.initialize();

// Use different clients from pool for parallel requests
const results = await Promise.all([
  pool.getClient().tools.call('operation_1', {}),
  pool.getClient().tools.call('operation_2', {}),
  pool.getClient().tools.call('operation_3', {}),
]);

// ======================
// Cleanup
// ======================

// Always disconnect when done
await mcp.disconnect();
