import { describe, it, expect } from 'vitest';
import { HttpResponse } from '../../src/core/response.js';

describe('Debug Response', () => {
  it('should preserve 504 status', () => {
    const nativeRes = new Response(null, { status: 504, statusText: 'Gateway Timeout' });
    expect(nativeRes.status).toBe(504);
    
    const httpRes = new HttpResponse(nativeRes);
    expect(httpRes.status).toBe(504);
  });
});
