/**
 * Pure JavaScript overhead test - no network I/O
 * Tests only the wrapper/promise overhead
 */

const iterations = 100000;
const warmup = 10000;

// Mock response that resolves immediately
const mockResponse = {
  json: () => Promise.resolve({ ok: true }),
  text: () => Promise.resolve('{"ok":true}'),
};

// Mock fetch that resolves immediately
const mockFetch = () => Promise.resolve(mockResponse as unknown as Response);

// Approach 1: Current wrapper class with async/await
class WrapperClass implements Promise<Response> {
  constructor(private readonly p: Promise<Response>) {}
  get [Symbol.toStringTag]() { return 'WrapperClass'; }
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

// Approach 2: Raw two-await pattern
async function rawTwoAwait(): Promise<any> {
  const res = await mockFetch();
  return res.json();
}

// Approach 3: Single await direct function
async function directSingle(): Promise<any> {
  return (await mockFetch()).json();
}

// Approach 4: Promise chain (no async/await)
function promiseChain(): Promise<any> {
  return mockFetch().then(res => res.json());
}

// Approach 5: Wrapper with .then() instead of async/await
class WrapperThen implements Promise<Response> {
  constructor(private readonly p: Promise<Response>) {}
  get [Symbol.toStringTag]() { return 'WrapperThen'; }
  then<T1 = Response, T2 = never>(
    onf?: ((v: Response) => T1 | PromiseLike<T1>) | null,
    onr?: ((r: any) => T2 | PromiseLike<T2>) | null
  ): Promise<T1 | T2> { return this.p.then(onf, onr); }
  catch<T = never>(onr?: ((r: any) => T | PromiseLike<T>) | null): Promise<Response | T> { return this.p.catch(onr); }
  finally(onf?: (() => void) | null): Promise<Response> { return this.p.finally(onf); }

  json<R>(): Promise<R> {
    return this.p.then(res => res.json()) as Promise<R>;
  }
}

// Approach 6: Wrapper with cached static closure
const jsonExtractor = (res: Response) => res.json();
class WrapperCached implements Promise<Response> {
  constructor(private readonly p: Promise<Response>) {}
  get [Symbol.toStringTag]() { return 'WrapperCached'; }
  then<T1 = Response, T2 = never>(
    onf?: ((v: Response) => T1 | PromiseLike<T1>) | null,
    onr?: ((r: any) => T2 | PromiseLike<T2>) | null
  ): Promise<T1 | T2> { return this.p.then(onf, onr); }
  catch<T = never>(onr?: ((r: any) => T | PromiseLike<T>) | null): Promise<Response | T> { return this.p.catch(onr); }
  finally(onf?: (() => void) | null): Promise<Response> { return this.p.finally(onf); }

  json<R>(): Promise<R> {
    return this.p.then(jsonExtractor) as Promise<R>;
  }
}

// Approach 7: Direct single await inline (optimal)
class WrapperDirect implements Promise<Response> {
  constructor(private readonly p: Promise<Response>) {}
  get [Symbol.toStringTag]() { return 'WrapperDirect'; }
  then<T1 = Response, T2 = never>(
    onf?: ((v: Response) => T1 | PromiseLike<T1>) | null,
    onr?: ((r: any) => T2 | PromiseLike<T2>) | null
  ): Promise<T1 | T2> { return this.p.then(onf, onr); }
  catch<T = never>(onr?: ((r: any) => T | PromiseLike<T>) | null): Promise<Response | T> { return this.p.catch(onr); }
  finally(onf?: (() => void) | null): Promise<Response> { return this.p.finally(onf); }

  async json<R>(): Promise<R> {
    return (await this.p).json();
  }
}

// Warmup
console.log('Warming up...');
for (let i = 0; i < warmup; i++) {
  await new WrapperClass(mockFetch()).json();
  await rawTwoAwait();
  await directSingle();
  await promiseChain();
  await new WrapperThen(mockFetch()).json();
  await new WrapperCached(mockFetch()).json();
  await new WrapperDirect(mockFetch()).json();
}

// Run tests
const runs = 5;
const results: Record<string, number[]> = {
  wrapperAsync: [],
  wrapperThen: [],
  wrapperCached: [],
  wrapperDirect: [],
  rawTwoAwait: [],
  directSingle: [],
  promiseChain: [],
};

for (let run = 0; run < runs; run++) {
  console.log(`Run ${run + 1}/${runs}...`);

  // Randomize order each run to avoid ordering bias
  const tests = [
    async () => {
      const start = performance.now();
      for (let i = 0; i < iterations; i++) await new WrapperClass(mockFetch()).json();
      results.wrapperAsync.push(performance.now() - start);
    },
    async () => {
      const start = performance.now();
      for (let i = 0; i < iterations; i++) await new WrapperThen(mockFetch()).json();
      results.wrapperThen.push(performance.now() - start);
    },
    async () => {
      const start = performance.now();
      for (let i = 0; i < iterations; i++) await new WrapperCached(mockFetch()).json();
      results.wrapperCached.push(performance.now() - start);
    },
    async () => {
      const start = performance.now();
      for (let i = 0; i < iterations; i++) await new WrapperDirect(mockFetch()).json();
      results.wrapperDirect.push(performance.now() - start);
    },
    async () => {
      const start = performance.now();
      for (let i = 0; i < iterations; i++) await rawTwoAwait();
      results.rawTwoAwait.push(performance.now() - start);
    },
    async () => {
      const start = performance.now();
      for (let i = 0; i < iterations; i++) await directSingle();
      results.directSingle.push(performance.now() - start);
    },
    async () => {
      const start = performance.now();
      for (let i = 0; i < iterations; i++) await promiseChain();
      results.promiseChain.push(performance.now() - start);
    },
  ];

  // Shuffle tests
  for (let i = tests.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tests[i], tests[j]] = [tests[j], tests[i]];
  }

  for (const test of tests) await test();
}

// Calculate stats
function stats(arr: number[]) {
  const sorted = [...arr].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  const min = sorted[0];
  return { median, avg, min };
}

const baseline = stats(results.promiseChain).median;

console.log(`\n📊 Pure JS Overhead (${iterations.toLocaleString()} iterations x ${runs} runs):`);
console.log(`   Using MEDIAN to reduce variance\n`);

const order = [
  ['promiseChain', 'Promise chain (baseline)'],
  ['directSingle', 'Direct single await'],
  ['rawTwoAwait', 'Raw two awaits'],
  ['wrapperThen', 'Wrapper + .then()'],
  ['wrapperCached', 'Wrapper + cached closure'],
  ['wrapperDirect', 'Wrapper + return(await).json()'],
  ['wrapperAsync', 'Wrapper + async/await (current)'],
] as const;

for (const [key, name] of order) {
  const s = stats(results[key]);
  const perOp = s.median / iterations * 1000; // microseconds
  const diff = ((s.median / baseline - 1) * 100).toFixed(1);
  console.log(`  ${name.padEnd(28)} ${perOp.toFixed(3)} µs/op  (${diff.startsWith('-') ? diff : '+' + diff}%)`);
}
