// Streaming & SSE Examples for Recker HTTP Client

import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.openai.com'
});

// ======================
// Server-Sent Events (SSE)
// ======================

// Stream OpenAI chat completions
for await (const event of client.post('/v1/chat/completions', {
  model: 'gpt-5',
  messages: [{ role: 'user', content: 'Hello!' }],
  stream: true
}).sse()) {
  console.log('Event:', event.data);
}

// ======================
// Streaming Downloads
// ======================

// Stream large file download (memory-efficient)
const fileStream = client.get('https://example.com/large-file.zip');

for await (const chunk of fileStream) {
  process.stdout.write(Buffer.from(chunk));
}

// ======================
// Progress Tracking
// ======================

const response = await client.get('https://example.com/large-file.zip', {
  onDownloadProgress: (progress) => {
    console.log(`Downloaded: ${progress.loaded}/${progress.total} bytes`);
    console.log(`Progress: ${(progress.loaded / progress.total * 100).toFixed(2)}%`);
    console.log(`ETA: ${progress.eta}ms`);
  }
});

// Upload with progress
await client.post('/upload', fileBuffer, {
  onUploadProgress: (progress) => {
    console.log(`Uploaded: ${progress.loaded}/${progress.total} bytes`);
  }
});
