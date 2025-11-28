import { describe, it, expect } from 'vitest';
import { processBody, createFormData, createMultipart, isFileUpload } from '../src/utils/body.js';

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
      expect(result.body).toBe(params);
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
});
