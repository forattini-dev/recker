/**
 * Micro-benchmark comparing different wrapper approaches
 */

import { createServer } from 'node:http';

// Setup server
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
});

await new Promise<void>((resolve) => server.listen(0, resolve));
const port = (server.address() as any).port;
const url = `http://localhost:${port}`;

const iterations = 5000;
const warmup = 500;

// Approach 1: Current MiniRequestPromise (wrapper class with async/await)
class MiniRequestPromise1 implements Promise<Response> {
  private readonly p: Promise<Response>;
  constructor(promise: Promise<Response>) { this.p = promise; }
  get [Symbol.toStringTag]() { return 'MiniRequestPromise'; }
  then<T1 = Response, T2 = never>(
    onf?: ((v: Response) => T1 | PromiseLike<T1>) | null,
    onr?: ((r: any) => T2 | PromiseLike<T2>) | null
  ): Promise<T1 | T2> { return this.p.then(onf, onr); }
  catch<T = never>(onr?: ((r: any) => T | PromiseLike<T>) | null): Promise<Response | T> { return this.p.catch(onr); }
  finally(onf?: (() => void) | null): Promise<Response> { return this.p.finally(onf); }

  async json<R>(): Promise<R> {
    const response = await this.p;
    return response.json();
  }
}

// Approach 2: Just return the promise directly, no wrapper
// User calls: await client.get('/'); then res.json()

// Approach 3: Object.assign methods directly on promise
function createPromiseWithMethods(fetchPromise: Promise<Response>): Promise<Response> & { json<R>(): Promise<R> } {
  const p = fetchPromise as Promise<Response> & { json<R>(): Promise<R> };
  p.json = async function<R>(): Promise<R> {
    const response = await this;
    return response.json();
  };
  return p;
}

// Approach 4: Prototype-based (no per-request allocation)
const JsonPromiseProto = {
  async json<R>(this: Promise<Response>): Promise<R> {
    const response = await this;
    return response.json();
  }
};
function createPrototypePromise(fetchPromise: Promise<Response>): Promise<Response> & { json<R>(): Promise<R> } {
  return Object.setPrototypeOf(fetchPromise, Object.assign(Object.create(Promise.prototype), JsonPromiseProto));
}

// Approach 5: Pure function chaining (like the full client's RequestPromise)
class ChainablePromise<T> implements Promise<T> {
  constructor(private readonly p: Promise<T>) {}
  get [Symbol.toStringTag]() { return 'ChainablePromise'; }
  then<T1 = T, T2 = never>(
    onf?: ((v: T) => T1 | PromiseLike<T1>) | null,
    onr?: ((r: any) => T2 | PromiseLike<T2>) | null
  ): Promise<T1 | T2> { return this.p.then(onf, onr); }
  catch<TR = never>(onr?: ((r: any) => TR | PromiseLike<TR>) | null): Promise<T | TR> { return this.p.catch(onr); }
  finally(onf?: (() => void) | null): Promise<T> { return this.p.finally(onf); }
}

// Minimal - just the promise, json on demand
function minimalGet(url: string): ChainablePromise<Response> & { json<R>(): Promise<R> } {
  const fetchP = fetch(url);
  const wrapper = new ChainablePromise(fetchP) as ChainablePromise<Response> & { json<R>(): Promise<R> };
  // Use property instead of method to avoid closure per call
  Object.defineProperty(wrapper, 'json', {
    value: async function<R>(): Promise<R> {
      const res = await fetchP;
      return res.json();
    }
  });
  return wrapper;
}

// Approach 6: Single function, no class at all
async function directJson(url: string): Promise<any> {
  const res = await fetch(url);
  return res.json();
}

// Run warmup
console.log('Warming up...');
for (let i = 0; i < warmup; i++) {
  await new MiniRequestPromise1(fetch(url)).json();
  const r2 = await fetch(url); await r2.json();
  await createPromiseWithMethods(fetch(url)).json();
  await createPrototypePromise(fetch(url)).json();
  await minimalGet(url).json();
  await directJson(url);
}

// Test functions
async function testWrapper() {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await new MiniRequestPromise1(fetch(url)).json();
  }
  return performance.now() - start;
}

async function testRawFetch() {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const res = await fetch(url);
    await res.json();
  }
  return performance.now() - start;
}

async function testObjectAssign() {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await createPromiseWithMethods(fetch(url)).json();
  }
  return performance.now() - start;
}

async function testPrototype() {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await createPrototypePromise(fetch(url)).json();
  }
  return performance.now() - start;
}

async function testMinimal() {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await minimalGet(url).json();
  }
  return performance.now() - start;
}

async function testDirect() {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await directJson(url);
  }
  return performance.now() - start;
}

// Run tests 3 times and average
const results = { wrapper: 0, raw: 0, assign: 0, proto: 0, minimal: 0, direct: 0 };
const runs = 3;

for (let run = 0; run < runs; run++) {
  console.log(`\nRun ${run + 1}/${runs}...`);
  results.wrapper += await testWrapper();
  results.raw += await testRawFetch();
  results.assign += await testObjectAssign();
  results.proto += await testPrototype();
  results.minimal += await testMinimal();
  results.direct += await testDirect();
}

// Calculate averages
const avg = {
  wrapper: results.wrapper / runs / iterations,
  raw: results.raw / runs / iterations,
  assign: results.assign / runs / iterations,
  proto: results.proto / runs / iterations,
  minimal: results.minimal / runs / iterations,
  direct: results.direct / runs / iterations,
};

console.log(`\n📊 Results (${iterations} iterations x ${runs} runs):`);
console.log(`  Raw fetch (2 awaits):      ${avg.raw.toFixed(4)} ms/req (baseline)`);
console.log(`  Direct function:           ${avg.direct.toFixed(4)} ms/req (${((avg.direct / avg.raw - 1) * 100).toFixed(1)}%)`);
console.log(`  Wrapper class (current):   ${avg.wrapper.toFixed(4)} ms/req (${((avg.wrapper / avg.raw - 1) * 100).toFixed(1)}%)`);
console.log(`  Object.assign:             ${avg.assign.toFixed(4)} ms/req (${((avg.assign / avg.raw - 1) * 100).toFixed(1)}%)`);
console.log(`  Prototype patching:        ${avg.proto.toFixed(4)} ms/req (${((avg.proto / avg.raw - 1) * 100).toFixed(1)}%)`);
console.log(`  Minimal + defineProperty:  ${avg.minimal.toFixed(4)} ms/req (${((avg.minimal / avg.raw - 1) * 100).toFixed(1)}%)`);

server.close();
