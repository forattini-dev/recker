import { describe, it, expect } from 'vitest';
import { rewriteUrl } from '../../src/scrape/rewrite-url.js';

describe('rewriteUrl', () => {
  describe('Google Docs', () => {
    it('rewrites editor URL to export endpoint', () => {
      const r = rewriteUrl('https://docs.google.com/document/d/abc123XYZ/edit');
      expect(r.rewritten).toBe(true);
      expect(r.url).toBe('https://docs.google.com/document/d/abc123XYZ/export?format=html');
      expect(r.reason).toBe('google-docs-export');
    });

    it('handles trailing slug after /edit', () => {
      const r = rewriteUrl('https://docs.google.com/document/d/foo-bar_baz/edit?usp=sharing');
      expect(r.rewritten).toBe(true);
      expect(r.url).toContain('/document/d/foo-bar_baz/export?format=html');
    });

    it('skips published documents (/d/e/)', () => {
      const r = rewriteUrl('https://docs.google.com/document/d/e/2PACX-1vR/pub');
      expect(r.rewritten).toBe(false);
      expect(r.url).toBe('https://docs.google.com/document/d/e/2PACX-1vR/pub');
    });
  });

  describe('Google Sheets', () => {
    it('rewrites spreadsheet to gviz HTML export', () => {
      const r = rewriteUrl('https://docs.google.com/spreadsheets/d/sheetId123/edit');
      expect(r.rewritten).toBe(true);
      expect(r.url).toBe('https://docs.google.com/spreadsheets/d/sheetId123/gviz/tq?tqx=out:html');
      expect(r.reason).toBe('google-sheets-export');
    });

    it('preserves gid parameter from query', () => {
      const r = rewriteUrl('https://docs.google.com/spreadsheets/d/sheetId/edit?gid=42');
      expect(r.rewritten).toBe(true);
      expect(r.url).toBe('https://docs.google.com/spreadsheets/d/sheetId/gviz/tq?tqx=out:html&gid=42');
    });

    it('preserves gid parameter from hash fragment', () => {
      const r = rewriteUrl('https://docs.google.com/spreadsheets/d/sheetId/edit#gid=99');
      expect(r.rewritten).toBe(true);
      expect(r.url).toContain('&gid=99');
    });
  });

  describe('Google Slides', () => {
    it('rewrites presentation to export', () => {
      const r = rewriteUrl('https://docs.google.com/presentation/d/slideId/edit');
      expect(r.rewritten).toBe(true);
      expect(r.url).toBe('https://docs.google.com/presentation/d/slideId/export?format=html');
      expect(r.reason).toBe('google-slides-export');
    });
  });

  describe('Google Drive files', () => {
    it('rewrites Drive file viewer to direct download', () => {
      const r = rewriteUrl('https://drive.google.com/file/d/fileId123/view');
      expect(r.rewritten).toBe(true);
      expect(r.url).toBe('https://drive.google.com/uc?export=download&id=fileId123');
      expect(r.reason).toBe('google-drive-download');
    });
  });

  describe('non-matching URLs', () => {
    it('leaves regular URLs alone', () => {
      const r = rewriteUrl('https://example.com/page');
      expect(r.rewritten).toBe(false);
      expect(r.url).toBe('https://example.com/page');
      expect(r.reason).toBeUndefined();
    });

    it('leaves Google search URLs alone', () => {
      const r = rewriteUrl('https://www.google.com/search?q=test');
      expect(r.rewritten).toBe(false);
    });
  });
});
