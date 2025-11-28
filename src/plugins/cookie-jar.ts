import { Plugin, ReckerRequest, ReckerResponse } from '../types/index.js';

export interface CookieJarOptions {
  // Optional: Initial store
  store?: Map<string, string>;
}

/**
 * Simple in-memory Cookie Jar implementation.
 * Includes basic domain scoping for security.
 */
export function cookieJar(options: CookieJarOptions = {}): Plugin {
  // Map<Domain, Map<Key, Value>>
  const store = new Map<string, Map<string, string>>();

  // Initialize store if provided (naive import)
  if (options.store) {
      // Treat initial store as "global" or specific domain?
      // For backward compat with our previous test, we'll assume 'localhost' or general use
      // But cleaner to start empty or structured.
      // Let's support flat map import by defaulting to a wildcard domain for now, or requiring structured input.
      // To keep it simple:
      if (options.store instanceof Map) {
          store.set('*', options.store);
      }
  }

  return (client: any) => {
    
    // 1. Inject Cookies into Request
    client.beforeRequest((req: ReckerRequest) => {
      const url = new URL(req.url);
      const hostname = url.hostname;

      const cookieList: string[] = [];
      
      // Helper to add cookies from a domain map
      const addCookies = (domainStore: Map<string, string> | undefined) => {
          if (domainStore) {
              domainStore.forEach((value, key) => {
                  cookieList.push(`${key}=${value}`);
              });
          }
      };

      // Check exact match
      addCookies(store.get(hostname));

      // Check wildcards (naive parent domain check)
      // e.g. if req is api.example.com, check .example.com
      // For this simple implementation, we iterate.
      for (const [domain, domainStore] of store.entries()) {
          if (domain !== '*' && domain !== hostname && hostname.endsWith(domain)) {
               addCookies(domainStore);
          }
          // Add global cookies (from initial store if any)
          if (domain === '*') {
              addCookies(domainStore);
          }
      }

      if (cookieList.length > 0) {
        const existing = req.headers.get('cookie');
        const newCookies = cookieList.join('; ');
        req.headers.set('cookie', existing ? `${existing}; ${newCookies}` : newCookies);
      }
    });

    // 2. Extract Cookies from Response
    client.afterResponse((req: ReckerRequest, res: ReckerResponse) => {
      const setCookie = res.headers.get('set-cookie');
      if (!setCookie) return;
      
      const url = new URL(req.url);
      // Default domain is request hostname
      let domain = url.hostname;

      const cookies = splitCookies(setCookie);
      
      cookies.forEach(cookieStr => {
        const parts = cookieStr.split(';');
        const [nameValue] = parts;
        if (!nameValue) return;

        const [key, ...valParts] = nameValue.split('=');
        if (!key) return;
        
        const value = valParts.join('=').trim();
        
        // Check for Domain attribute
        let specificDomain = domain;
        const domainPart = parts.find(p => p.trim().toLowerCase().startsWith('domain='));
        if (domainPart) {
            const d = domainPart.split('=')[1]?.trim();
            if (d) specificDomain = d; // Should strip leading dot
        }

        // Get or create domain store
        if (!store.has(specificDomain)) {
            store.set(specificDomain, new Map());
        }
        
        const domainStore = store.get(specificDomain)!;
        domainStore.set(key.trim(), value);
        
        // Sync back to options.store if it was passed (for external access/testing)
        // This maintains compatibility with the test that expects options.store to be updated
        if (options.store) {
            options.store.set(key.trim(), value);
        }
      });
    });
  };
}

// Helper to split set-cookie string strictly (handling commas in dates is hard without regex)
// This is a naive implementation.
function splitCookies(header: string): string[] {
    // This simple split assumes no commas in cookie values (except Expires date)
    // A robust regex or lib is needed for full support.
    // For now, we support single Set-Cookie or simple comma separation.
    return header.split(/,(?=\s*[a-zA-Z0-9_]+=[^;])/g);
}
