import { describe, it, expect } from 'vitest';
import { processBody, createFormData, createMultipart, isFileUpload } from '../../src/utils/body.js';

describe('Body Processing', () => {
  describe('processBody', () => {
    it('should handle null/undefined', () => {
      expect(processBody(null)).toEqual({ body: undefined });
      expect(processBody(undefined)).toEqual({ body: undefined });
    });

    it('should handle plain strings', () => {
      const result = processBody('hello world');
      expect(result.body).toBe('hello world');
      expect(result.contentType).toBe('text/plain; charset=utf-8');
    });

    it('should handle plain objects as JSON', () => {
      const obj = { name: 'John', age: 30 };
      const result = processBody(obj);
      expect(result.body).toBe(JSON.stringify(obj));
      expect(result.contentType).toBe('application/json');
    });

    it('should handle arrays as JSON', () => {
      const arr = [1, 2, 3];
      const result = processBody(arr);
      expect(result.body).toBe(JSON.stringify(arr));
      expect(result.contentType).toBe('application/json');
    });

    it('should handle URLSearchParams', () => {
      const params = new URLSearchParams({ foo: 'bar', baz: 'qux' });
      const result = processBody(params);
      expect(result.body).toBe(params.toString());
      expect(result.contentType).toBe('application/x-www-form-urlencoded');
    });

    it('should handle FormData without setting content-type', () => {
      const formData = new FormData();
      formData.append('key', 'value');
      const result = processBody(formData);
      expect(result.body).toBe(formData);
      expect(result.contentType).toBeUndefined(); // Let browser/undici set boundary
    });

    it('should handle Blob with type', () => {
      const blob = new Blob(['test'], { type: 'text/plain' });
      const result = processBody(blob);
      expect(result.body).toBe(blob);
      expect(result.contentType).toBe('text/plain');
    });

    it('should handle Blob without type', () => {
      const blob = new Blob(['test']);
      const result = processBody(blob);
      expect(result.body).toBe(blob);
      expect(result.contentType).toBe('application/octet-stream');
    });

    it('should handle ArrayBuffer', () => {
      const buffer = new ArrayBuffer(8);
      const result = processBody(buffer);
      expect(result.body).toBe(buffer);
      expect(result.contentType).toBe('application/octet-stream');
    });
  });

  describe('createFormData', () => {
    it('should create FormData from object', () => {
      const formData = createFormData({
        name: 'John',
        age: 30,
        active: true
      });

      expect(formData).toBeInstanceOf(FormData);
      expect(formData.get('name')).toBe('John');
      expect(formData.get('age')).toBe('30');
      expect(formData.get('active')).toBe('true');
    });

    it('should handle arrays', () => {
      const formData = createFormData({
        tags: ['javascript', 'typescript', 'node']
      });

      expect(formData.getAll('tags')).toEqual(['javascript', 'typescript', 'node']);
    });

    it('should skip null/undefined values', () => {
      const formData = createFormData({
        name: 'John',
        age: null,
        email: undefined
      });

      expect(formData.get('name')).toBe('John');
      expect(formData.get('age')).toBeNull();
      expect(formData.get('email')).toBeNull();
    });

    it('should handle Blob values', () => {
      const blob = new Blob(['test'], { type: 'text/plain' });
      const formData = createFormData({
        file: blob
      });

      const file = formData.get('file');
      expect(file).toBeInstanceOf(Blob); // FormData may wrap as File
      expect((file as Blob).type).toBe('text/plain');
    });

    it('should stringify objects', () => {
      const formData = createFormData({
        metadata: { key: 'value', nested: { deep: true } }
      });

      expect(formData.get('metadata')).toBe(JSON.stringify({ key: 'value', nested: { deep: true } }));
    });
  });

  describe('createMultipart', () => {
    it('should be alias for createFormData', () => {
      const data = { name: 'test' };
      const formData1 = createFormData(data);
      const formData2 = createMultipart(data);

      expect(formData1.get('name')).toBe(formData2.get('name'));
    });
  });

  describe('isFileUpload', () => {
    it('should detect Blob', () => {
      const blob = new Blob(['test']);
      expect(isFileUpload(blob)).toBe(true);
    });

    it('should detect FormData with files', () => {
      const formData = new FormData();
      formData.append('file', new Blob(['test']));
      expect(isFileUpload(formData)).toBe(true);
    });

    it('should detect FormData without files', () => {
      const formData = new FormData();
      formData.append('text', 'hello');
      expect(isFileUpload(formData)).toBe(false);
    });

    it('should detect object with Blob', () => {
      const obj = { file: new Blob(['test']), name: 'test.txt' };
      expect(isFileUpload(obj)).toBe(true);
    });

    it('should detect array with Blob', () => {
      const obj = { files: [new Blob(['test1']), new Blob(['test2'])] };
      expect(isFileUpload(obj)).toBe(true);
    });

    it('should return false for plain objects', () => {
      expect(isFileUpload({ name: 'test' })).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isFileUpload(null)).toBe(false);
      expect(isFileUpload(undefined)).toBe(false);
    });
  });

  describe('Auto-detection of files in objects', () => {
    it('should auto-convert object with Blob to FormData', () => {
      const blob = new Blob(['test'], { type: 'text/plain' });
      const obj = { name: 'John', file: blob };

      const result = processBody(obj);

      expect(result.body).toBeInstanceOf(FormData);
      expect(result.contentType).toBeUndefined(); // Let FormData set boundary
      expect((result.body as FormData).get('name')).toBe('John');
      expect((result.body as FormData).get('file')).toBeInstanceOf(Blob);
    });

    it('should auto-convert object with array of Blobs to FormData', () => {
      const blob1 = new Blob(['file1']);
      const blob2 = new Blob(['file2']);
      const obj = { name: 'John', files: [blob1, blob2] };

      const result = processBody(obj);

      expect(result.body).toBeInstanceOf(FormData);
      expect(result.contentType).toBeUndefined();
      const files = (result.body as FormData).getAll('files');
      expect(files).toHaveLength(2);
    });

    it('should keep plain objects as JSON when no files present', () => {
      const obj = { name: 'John', age: 30 };

      const result = processBody(obj);

      expect(result.body).toBe(JSON.stringify(obj));
      expect(result.contentType).toBe('application/json');
    });
  });

  describe('Edge cases', () => {
    it('should handle ReadableStream', () => {
      const stream = new ReadableStream();
      const result = processBody(stream);

      expect(result.body).toBe(stream);
      expect(result.contentType).toBe('application/octet-stream');
    });

    it('should handle object without prototype', () => {
      // Object.create(null) creates an object without prototype
      const obj = Object.create(null);
      obj.name = 'test';

      const result = processBody(obj);

      expect(result.body).toBe(JSON.stringify(obj));
      expect(result.contentType).toBe('application/json');
    });

    it('should fallback to string for non-standard types', () => {
      // Number type should be converted to string
      const num = 42;
      // @ts-ignore - testing fallback behavior
      const result = processBody(num);

      expect(result.body).toBe('42');
      expect(result.contentType).toBe('text/plain; charset=utf-8');
    });

    it('should handle array with blob values in createFormData', () => {
      const blob = new Blob(['test']);
      const formData = createFormData({
        files: [blob, 'string-value']
      });

      const files = formData.getAll('files');
      expect(files).toHaveLength(2);
      expect(files[0]).toBeInstanceOf(Blob);
      expect(files[1]).toBe('string-value');
    });
  });
});
