/**
 * tryFn - A robust error handling utility for JavaScript functions and values.
 * 
 * This utility provides a consistent way to handle errors and return values across different types:
 * - Synchronous functions
 * - Asynchronous functions (Promises)
 * - Direct values
 * - Promises
 * - null/undefined values
 *
 * @param {Function|Promise|*} fnOrPromise - The input to process, can be:
 *   - A synchronous function that returns a value
 *   - An async function that returns a Promise
 *   - A Promise directly
 *   - Any direct value (number, string, object, etc)
 * 
 * @returns {Array} A tuple containing:
 *   - [0] ok: boolean - Indicates if the operation succeeded
 *   - [1] err: Error|null - Error object if failed, null if succeeded
 *   - [2] data: any - The result data if succeeded, undefined if failed
 */
import { ReckerError } from '../core/errors.js';

export function tryFn<T>(
  fnOrPromise: (() => Promise<T>) | Promise<T> | (() => T) | T
): Promise<[boolean, Error | null, T | undefined]> | [boolean, Error | null, T | undefined] {
  if (fnOrPromise == null) {
    const err = new ReckerError(
      'fnOrPromise cannot be null or undefined',
      undefined,
      undefined,
      ['Pass a valid function or promise to tryFn.', 'Check the caller to ensure an undefined value is not passed.']
    );
    err.stack = new Error().stack;
    return [false, err as Error, undefined];
  }

  if (typeof fnOrPromise === 'function') {
    try {
      const result = (fnOrPromise as Function)();

      if (result == null) {
        return [true, null, result];
      }

      if (typeof result.then === 'function') {
        return result
          .then((data: T) => [true, null, data])
          .catch((error: any) => {
            if (
              error instanceof Error &&
              Object.isExtensible(error)
            ) {
              // Try to preserve stack trace
              const desc = Object.getOwnPropertyDescriptor(error, 'stack');
              if (
                !desc || (desc.writable && desc.configurable)
              ) {
                try {
                   // Enhance stack trace if possible
                   // error.stack = new Error().stack; 
                   // Note: Overwriting stack trace might hide the original error source. 
                   // Usually better to append or just leave it, but following the requested implementation style:
                } catch (_) {}
              }
            }
            return [false, wrapUnknownError(error, 'Function threw an error'), undefined];
          });
      }

      return [true, null, result];

    } catch (error) {
      return [false, wrapUnknownError(error, 'Function threw an error'), undefined];
    }
  }

  if (typeof (fnOrPromise as any).then === 'function') {
    return Promise.resolve(fnOrPromise)
      .then((data: T): [boolean, Error | null, T | undefined] => [true, null, data])
      .catch((error: any): [boolean, Error | null, T | undefined] => {
        return [false, wrapUnknownError(error, 'Promise rejected'), undefined];
      });
  }

  return [true, null, fnOrPromise as T];
}

export function tryFnSync<T>(fn: () => T): [boolean, Error | null, T | undefined] {
  try {
    const result = fn();
    return [true, null, result];
  } catch (err) {
    return [false, wrapUnknownError(err, 'Synchronous function threw an error'), undefined];
  }
}

export default tryFn;

function wrapUnknownError(err: any, context: string): Error {
  if (err instanceof Error) return err;
  return new ReckerError(
    `${context}: ${String(err)}`,
    undefined,
    undefined,
    ['Inspect the original value being thrown.', 'Ensure errors are instances of Error or ReckerError.', 'Add contextual information when throwing custom errors.']
  );
}
