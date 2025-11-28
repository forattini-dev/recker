export interface SSEEvent {
  id?: string;
  event?: string;
  data: string;
  retry?: number;
}

export async function* parseSSE(response: Response): AsyncGenerator<SSEEvent> {
  if (!response.body) throw new Error('Response body is null');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  let buffer = '';
  let currentEvent: SSEEvent = { data: '' };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      
      const lines = buffer.split(/\r\n|\r|\n/);
      // Keep the last partial line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim() === '') {
          // Empty line: dispatch event if we have data
          if (currentEvent.data || currentEvent.event || currentEvent.id) {
            // Remove trailing newline from data if present (SSE spec)
            if (currentEvent.data.endsWith('\n')) {
              currentEvent.data = currentEvent.data.slice(0, -1);
            }
            yield currentEvent;
            currentEvent = { data: '' };
          }
          continue;
        }

        const colonIndex = line.indexOf(':');
        let field = line;
        let value = '';

        if (colonIndex !== -1) {
          field = line.slice(0, colonIndex);
          value = line.slice(colonIndex + 1);
          
          // Optional space after colon
          if (value.startsWith(' ')) {
            value = value.slice(1);
          }
        }

        switch (field) {
          case 'data':
            currentEvent.data += value + '\n';
            break;
          case 'event':
            currentEvent.event = value;
            break;
          case 'id':
            currentEvent.id = value;
            break;
          case 'retry':
            const retry = parseInt(value, 10);
            if (!isNaN(retry)) {
              currentEvent.retry = retry;
            }
            break;
        }
      }
    }
    
    // Process remaining buffer if any (though SSE usually ends with newline)
    if (buffer.trim() !== '') {
       // This is a partial line at the end of stream, strictly strictly speaking might be ignored,
       // but best effort to process it.
    }
  } finally {
    reader.releaseLock();
  }
}
