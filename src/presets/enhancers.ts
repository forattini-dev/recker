import type { ClientOptions } from '../types/index.js';

// --- Identity (User Agents) ---
// Note: android and ios are already defined in separate files

export const mobile = (): ClientOptions => ({
  headers: {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  }
});

export const desktop = (): ClientOptions => ({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
});
export const chrome = desktop; // Alias

export const bot = (): ClientOptions => ({
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
  }
});
export const google = bot; // Alias

export const curl = (): ClientOptions => ({
  headers: {
    'User-Agent': 'curl/8.5.0',
    'Accept': '*/*'
  }
});

// --- Behavior & Network ---

export const retry = (): ClientOptions => ({
  retry: {
    maxAttempts: 3,
    delay: 1000,
    backoff: 'exponential',
    statusCodes: [408, 429, 500, 502, 503, 504]
  }
});

export const insecure = (): ClientOptions => ({
  tls: {
    rejectUnauthorized: false
  }
});

export const failfast = (): ClientOptions => ({
  timeout: 2000,
  retry: { maxAttempts: 0 }
});

export const nocache = (): ClientOptions => ({
  headers: {
    'Cache-Control': 'no-cache, no-store',
    'Pragma': 'no-cache'
    }
  });
  
  // --- Response Formats (Accept) ---
  
  export const json = (): ClientOptions => ({
    headers: {
      'Accept': 'application/json'
    }
  });
  
  export const xml = (): ClientOptions => ({
    headers: {
      'Accept': 'application/xml, text/xml'
    }
  });
  
  export const csv = (): ClientOptions => ({
    headers: {
      'Accept': 'text/csv'
    }
  });
  
  export const text = (): ClientOptions => ({
    headers: {
      'Accept': 'text/plain'
    }
  });
  
  export const html = (): ClientOptions => ({
    headers: {
      'Accept': 'text/html'
    }
  });
  
  export const image = (): ClientOptions => ({
    headers: {
      'Accept': 'image/*'
    }
  });
  
  // --- Environments ---

export const local = (): ClientOptions => ({
  baseUrl: 'http://localhost:3000'
});

export const local8000 = (): ClientOptions => ({
  baseUrl: 'http://localhost:8000'
});

export const local8080 = (): ClientOptions => ({
  baseUrl: 'http://localhost:8080'
});