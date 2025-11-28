import { describe, it, expect } from 'vitest';
import { cleanHtml } from '../src/utils/html-cleaner.js';
import { RequestPromise } from '../src/core/request-promise.js';
import { HttpResponse } from '../src/core/response.js';

describe('Utils', () => {
  describe('cleanHtml', () => {
    it('should clean scripts and styles', () => {
      const html = '<html><script>alert(1)</script><style>body{color:red}</style><body>Content</body></html>';
      expect(cleanHtml(html)).toBe('Content');
    });

    it('should preserve block structure with newlines', () => {
      const html = '<div>Line 1</div><p>Line 2</p><br/>Line 3';
      const text = cleanHtml(html);
      expect(text).toContain('Line 1\n');
      expect(text).toContain('Line 2\n');
      expect(text).toContain('Line 3');
    });

    it('should decode entities', () => {
      expect(cleanHtml('&lt;hello&gt; &amp; world')).toBe('<hello> & world');
    });
    
    it('should handle empty input', () => {
        expect(cleanHtml('')).toBe('');
    });
  });
  
  describe('RequestPromise', () => {
      it('should expose methods on promise wrapper', async () => {
          const mockResponse = new HttpResponse(new Response('{"a":1}', { status: 200 }));
          const promise = Promise.resolve(mockResponse);
          const reqPromise = new RequestPromise(promise);
          
          expect(await reqPromise.json()).toEqual({a: 1});
          
          // Re-create for stream consumption
          const reqPromise2 = new RequestPromise(Promise.resolve(new HttpResponse(new Response('text'), { status: 200 })));
          expect(await reqPromise2.text()).toBe('text');
          
          // Blob
          const reqPromise3 = new RequestPromise(Promise.resolve(new HttpResponse(new Response('blob'), { status: 200 })));
          const blob = await reqPromise3.blob();
          expect(blob).toBeInstanceOf(Blob);
      });
      
      it('should support cancellation', () => {
          const controller = new AbortController();
          const reqPromise = new RequestPromise(Promise.resolve({} as any), controller);
          
          expect(controller.signal.aborted).toBe(false);
          reqPromise.cancel();
          expect(controller.signal.aborted).toBe(true);
      });
      
      it('should handle missing controller in cancel', () => {
          const reqPromise = new RequestPromise(Promise.resolve({} as any));
          expect(() => reqPromise.cancel()).not.toThrow();
      });
  });
});
