// Authentication & Interceptors Examples for Recker HTTP Client

import { createClient } from 'recker';

// ======================
// Basic Authentication
// ======================

const client1 = createClient({
  baseUrl: 'https://api.example.com',
  headers: {
    'Authorization': 'Bearer your-token-here',
    'X-API-Key': 'your-api-key'
  }
});

// ======================
// Request Interceptor
// ======================

const client2 = createClient({
  baseUrl: 'https://api.example.com',
  hooks: {
    beforeRequest: async (req) => {
      // Add auth token dynamically
      const token = await getAuthToken();
      req.headers.set('Authorization', `Bearer ${token}`);

      // Log request
      console.log(`[${req.method}] ${req.url}`);

      return req;
    }
  }
});

// ======================
// Response Interceptor
// ======================

const client3 = createClient({
  baseUrl: 'https://api.example.com',
  hooks: {
    afterResponse: async (res) => {
      // Log response
      console.log(`[${res.status}] ${res.url}`);

      // Auto-refresh token on 401
      if (res.status === 401) {
        const newToken = await refreshAuthToken();
        // Retry request with new token
        const retryReq = res.request.clone();
        retryReq.headers.set('Authorization', `Bearer ${newToken}`);
        return client3.request(retryReq);
      }

      return res;
    }
  }
});

// ======================
// Error Interceptor
// ======================

const client4 = createClient({
  baseUrl: 'https://api.example.com',
  hooks: {
    onError: async (error) => {
      console.error('Request failed:', error.message);

      // Log to error tracking service
      await logErrorToSentry(error);

      throw error;
    }
  }
});

// ======================
// OAuth 2.0 Flow
// ======================

class OAuth2Client {
  private accessToken: string | null = null;
  private client = createClient({
    baseUrl: 'https://api.example.com',
    hooks: {
      beforeRequest: async (req) => {
        if (!this.accessToken) {
          this.accessToken = await this.getAccessToken();
        }
        req.headers.set('Authorization', `Bearer ${this.accessToken}`);
        return req;
      },
      afterResponse: async (res) => {
        if (res.status === 401) {
          // Token expired, refresh and retry
          this.accessToken = await this.refreshToken();
          const retryReq = res.request.clone();
          retryReq.headers.set('Authorization', `Bearer ${this.accessToken}`);
          return this.client.request(retryReq);
        }
        return res;
      }
    }
  });

  async getAccessToken() {
    const res = await fetch('https://oauth.example.com/token', {
      method: 'POST',
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: 'your-client-id',
        client_secret: 'your-client-secret'
      })
    });
    const data = await res.json();
    return data.access_token;
  }

  async refreshToken() {
    // Implement token refresh logic
    return this.getAccessToken();
  }

  async get(path: string) {
    return this.client.get(path);
  }
}

// ======================
// XSRF Protection
// ======================

const client5 = createClient({
  baseUrl: 'https://api.example.com',
  xsrf: {
    cookieName: 'XSRF-TOKEN',
    headerName: 'X-XSRF-TOKEN'
  }
});

// Automatically includes XSRF token from cookie in request header
await client5.post('/api/action', { data: 'value' });

// Helper functions (mock implementations)
async function getAuthToken(): Promise<string> {
  return 'mock-token';
}

async function refreshAuthToken(): Promise<string> {
  return 'new-mock-token';
}

async function logErrorToSentry(error: any): Promise<void> {
  console.log('Logging to Sentry:', error);
}
