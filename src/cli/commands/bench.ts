/**
 * Bench CLI Commands
 *
 * Load testing and benchmarking.
 * Delegates to unified handlers via the adapter.
 */

import { RekCommand as Command } from '../router.js';
import { createCliActionWithOptions } from '../cli-adapter.js';
import { loadTestHandler } from '../handlers/bench.js';

// Standalone load command (top-level)
export function registerLoadCommand(program: Command) {
  program
    .command('load')
    .description('Run a load test with real-time dashboard')
    .argument('<url>', {
      type: 'url',
      description: 'Target URL to load test',
      example: 'httpbin.org/get',
    })
    .option('users', {
      type: 'number',
      short: 'u',
      default: 50,
      description: 'Number of concurrent users',
      example: '100',
    })
    .option('duration', {
      type: 'number',
      short: 'd',
      default: 300,
      description: 'Test duration in seconds',
      example: '60',
    })
    .option('ramp', {
      type: 'number',
      short: 'r',
      default: 5,
      description: 'Ramp-up time in seconds',
      example: '10',
    })
    .option('mode', {
      type: 'string',
      short: 'm',
      default: 'throughput',
      enum: ['throughput', 'stress', 'realistic'],
      description: 'Test mode',
    })
    .option('http2', {
      description: 'Force HTTP/2 protocol',
    })
    .option('insecure', {
      short: 'k',
      description: 'Allow insecure SSL/TLS (self-signed certs)',
    })
    .example('rek load httpbin.org/get -u 100 -d 60', '100 users for 60 seconds')
    .example('rek load api.com/heavy --mode stress', 'Run stress test')
    .example('rek load api.com --http2', 'Force HTTP/2')
    .example('rek load api.com -k', 'Allow self-signed certificates')
    .action(createCliActionWithOptions(loadTestHandler, {
      positional: ['url'],
      options: ['users', 'duration', 'ramp', 'mode', 'http2', 'insecure']
    }));
}

export function registerBenchCommand(program: Command) {
  const bench = program.command('bench').description('Performance benchmarking tools');

  bench
    .command('load')
    .description('Run a load test with real-time dashboard')
    .argument('<url>', {
      type: 'url',
      description: 'Target URL to load test',
      example: 'httpbin.org/get',
    })
    .option('users', {
      type: 'number',
      short: 'u',
      default: 50,
      description: 'Number of concurrent users',
      example: '100',
    })
    .option('duration', {
      type: 'number',
      short: 'd',
      default: 300,
      description: 'Test duration in seconds',
      example: '60',
    })
    .option('ramp', {
      type: 'number',
      short: 'r',
      default: 5,
      description: 'Ramp-up time in seconds',
      example: '10',
    })
    .option('mode', {
      type: 'string',
      short: 'm',
      default: 'throughput',
      enum: ['throughput', 'stress', 'realistic'],
      description: 'Test mode',
    })
    .option('http2', {
      description: 'Force HTTP/2 protocol',
    })
    .option('insecure', {
      short: 'k',
      description: 'Allow insecure SSL/TLS (self-signed certs)',
    })
    .example('rek bench load httpbin.org/get -u 100 -d 60', '100 users for 60 seconds')
    .example('rek bench load api.com/heavy --mode stress', 'Run stress test')
    .example('rek bench load api.com --http2', 'Force HTTP/2')
    .example('rek bench load api.com -k', 'Allow self-signed certificates')
    .action(createCliActionWithOptions(loadTestHandler, {
      positional: ['url'],
      options: ['users', 'duration', 'ramp', 'mode', 'http2', 'insecure']
    }));
}
