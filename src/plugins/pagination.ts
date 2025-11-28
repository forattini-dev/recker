import { ReckerRequest, ReckerResponse, ClientOptions, PageResult } from '../types/index.js';

// Avoid importing Client class to prevent circular dependency
interface IClient {
    request(url: string, options?: any): Promise<ReckerResponse>;
}

export interface PaginationOptions<T = any> {
  getItems?: (data: any) => T[];
  getNextUrl?: (response: ReckerResponse, data: any, currentUrl: string) => string | null;
  maxPages?: number;
  
  pageParam?: string;
  limitParam?: string;
  resultsPath?: string;
  nextCursorPath?: string;
}

/**
 * Iterates over API pages, yielding the full response and data for each page.
 */
export async function* streamPages<T = any>(
  client: IClient,
  url: string,
  requestOptions: any = {},
  paginationOptions: PaginationOptions = {}
): AsyncGenerator<PageResult<T>> {
  let currentUrl: string | null = url;
  let pageCount = 1;
  const maxPages = paginationOptions.maxPages || Infinity;

  while (currentUrl && pageCount <= maxPages) {
    const response: ReckerResponse = await client.request(currentUrl, { ...requestOptions, method: 'GET' });
    const data: any = await response.json<T>();

    yield {
        data,
        response,
        pageNumber: pageCount
    };

    pageCount++;

    // Strategy 1: Custom Function
    if (paginationOptions.getNextUrl) {
      currentUrl = paginationOptions.getNextUrl(response, data, currentUrl);
      continue;
    } 
    
    // Strategy 2: Cursor Path
    if (paginationOptions.nextCursorPath) {
        const parts = paginationOptions.nextCursorPath.split('.');
        let cursor: any = data;
        
        for (const part of parts) {
            if (cursor && typeof cursor === 'object') {
                cursor = cursor[part];
            } else {
                cursor = undefined;
                break;
            }
        }

        if (cursor) {
            const cursorParamName = paginationOptions.pageParam || 'cursor';
            
            // Robust URL construction using URL object to handle existing params
            // We use a dummy base if the URL is relative, then extract path+search back
            const isAbsolute = currentUrl.startsWith('http');
            const urlObj = new URL(isAbsolute ? currentUrl : `http://dummy-base${currentUrl.startsWith('/') ? '' : '/'}${currentUrl}`);
            
            urlObj.searchParams.set(cursorParamName, String(cursor));
            
            if (isAbsolute) {
                currentUrl = urlObj.toString();
            } else {
                // Extract relative part. verify if we need to keep query params.
                currentUrl = urlObj.pathname + urlObj.search;
            }
        } else {
            currentUrl = null;
        }
        continue;
    }

    // Strategy 3: Page Number
    if (paginationOptions.pageParam) {
        // Same logic for Page Number
        const isAbsolute = currentUrl.startsWith('http');
        const urlObj = new URL(isAbsolute ? currentUrl : `http://dummy-base${currentUrl.startsWith('/') ? '' : '/'}${currentUrl}`);
        
        const paramName = paginationOptions.pageParam;
        const currentVal = parseInt(urlObj.searchParams.get(paramName) || String(pageCount - 1), 10);
        
        let isEmpty = false;
        if (Array.isArray(data) && data.length === 0) isEmpty = true;
        // @ts-ignore
        if (data && Array.isArray(data.data) && data.data.length === 0) isEmpty = true;
        // @ts-ignore
        if (data && Array.isArray(data.items) && data.items.length === 0) isEmpty = true;

        if (isEmpty) {
            currentUrl = null;
        } else {
            const nextPage = (isNaN(currentVal) ? 1 : currentVal) + 1;
            urlObj.searchParams.set(paramName, String(nextPage));
            currentUrl = isAbsolute ? urlObj.toString() : (urlObj.pathname + urlObj.search);
        }
        continue;
    }

    // Strategy 4: Link Header
    const linkHeader: string | null = response.headers.get('link');
    if (linkHeader) {
      const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      currentUrl = match ? match[1] : null;
    } else {
      currentUrl = null;
    }
  }
}

export async function* paginate<T>(
  client: IClient,
  url: string,
  requestOptions: any = {},
  paginationOptions: PaginationOptions<T> = {}
): AsyncGenerator<T> {
    for await (const page of streamPages<any>(client, url, requestOptions, paginationOptions)) {
        const data = page.data;
        let items: T[] = [];

        if (paginationOptions.getItems) {
            items = paginationOptions.getItems(data);
        } else if (paginationOptions.resultsPath) {
            items = paginationOptions.resultsPath.split('.').reduce((o, i) => o?.[i], data) || [];
        } else if (Array.isArray(data)) {
            items = data;
        } else if (data && Array.isArray(data.data)) {
            items = data.data;
        } else if (data && Array.isArray(data.items)) {
            items = data.items;
        } else {
            items = [data]; 
        }

        for (const item of items) {
            yield item;
        }
    }
}