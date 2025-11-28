/**
 * Body processing utilities for handling different content types
 */

export type BodyInput =
  | string
  | Blob
  | ArrayBuffer
  | FormData
  | URLSearchParams
  | ReadableStream
  | Record<string, any>
  | null
  | undefined;

export interface ProcessedBody {
  body: any;
  contentType?: string;
}

/**
 * Detect if a value is a plain object (not FormData, Blob, etc.)
 */
export function isPlainObject(value: any): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  // Exclude special types
  if (
    value instanceof Blob ||
    value instanceof FormData ||
    value instanceof URLSearchParams ||
    value instanceof ArrayBuffer ||
    value instanceof ReadableStream
  ) {
    return false;
  }

  // Check File separately to avoid TypeScript error
  if (typeof File !== 'undefined') {
    try {
      if (value instanceof File) {
        return false;
      }
    } catch {
      // Ignore instanceof errors in edge environments
    }
  }

  return true;
}

/**
 * Process request body and determine appropriate Content-Type
 */
export function processBody(body: BodyInput): ProcessedBody {
  // Null/undefined - no body
  if (body === null || body === undefined) {
    return { body: undefined };
  }

  // String - send as-is
  if (typeof body === 'string') {
    return {
      body,
      contentType: 'text/plain; charset=utf-8'
    };
  }

  // FormData - browser/Node.js will set multipart boundary
  if (body instanceof FormData) {
    return {
      body,
      // Don't set Content-Type - let browser/undici set multipart boundary
      contentType: undefined
    };
  }

  // URLSearchParams - application/x-www-form-urlencoded
  if (body instanceof URLSearchParams) {
    return {
      body,
      contentType: 'application/x-www-form-urlencoded'
    };
  }

  // Blob/File - application/octet-stream
  if (body instanceof Blob || isFile(body)) {
    return {
      body,
      contentType: (body as Blob).type || 'application/octet-stream'
    };
  }

  // ArrayBuffer - binary data
  if (body instanceof ArrayBuffer) {
    return {
      body,
      contentType: 'application/octet-stream'
    };
  }

  // ReadableStream - streaming data
  if (body instanceof ReadableStream) {
    return {
      body,
      contentType: 'application/octet-stream'
    };
  }

  // Plain object or array - JSON
  if (isPlainObject(body) || Array.isArray(body)) {
    return {
      body: JSON.stringify(body),
      contentType: 'application/json'
    };
  }

  // Fallback - convert to string
  return {
    body: String(body),
    contentType: 'text/plain; charset=utf-8'
  };
}

/**
 * Create FormData from an object
 * Useful for file uploads and multipart requests
 */
export function createFormData(data: Record<string, any>): FormData {
  const formData = new FormData();

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      continue;
    }

    // Array - append multiple values
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item instanceof Blob || isFile(item)) {
          formData.append(key, item);
        } else {
          formData.append(key, String(item));
        }
      });
      continue;
    }

    // Blob/File - append as-is
    if (value instanceof Blob || isFile(value)) {
      formData.append(key, value);
      continue;
    }

    // Object - JSON stringify
    if (typeof value === 'object') {
      formData.append(key, JSON.stringify(value));
      continue;
    }

    // Primitive - convert to string
    formData.append(key, String(value));
  }

  return formData;
}

/**
 * Create multipart form data with files
 *
 * @example
 * const formData = createMultipart({
 *   name: 'John Doe',
 *   avatar: fileBlob,
 *   documents: [file1, file2]
 * });
 */
export function createMultipart(data: Record<string, any>): FormData {
  return createFormData(data);
}

/**
 * Check if value is a File (safe check for environments without File)
 */
function isFile(value: any): boolean {
  if (typeof File === 'undefined') {
    return false;
  }
  return value instanceof File;
}

/**
 * Check if body is a file upload
 */
export function isFileUpload(body: any): boolean {
  if (!body) return false;

  // Direct file/blob
  if (body instanceof Blob || isFile(body)) {
    return true;
  }

  // FormData with files
  if (body instanceof FormData) {
    for (const value of body.values()) {
      if (value instanceof Blob || isFile(value)) {
        return true;
      }
    }
  }

  // Object with file properties
  if (isPlainObject(body)) {
    for (const value of Object.values(body)) {
      if (value instanceof Blob || isFile(value)) {
        return true;
      }
      if (Array.isArray(value) && value.some(v => v instanceof Blob || isFile(v))) {
        return true;
      }
    }
  }

  return false;
}
