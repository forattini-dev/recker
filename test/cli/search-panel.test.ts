/**
 * Tests for the SearchPanel fullscreen documentation viewer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchPanel } from '../../src/cli/tui/search-panel.js';

// Mock readline
vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    pause: vi.fn(),
    resume: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
  })),
}));

// Mock fs operations
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn((path: string) => {
      // Mock docs path exists
      if (path.includes('docs')) return true;
      if (path.includes('embeddings.json')) return true;
      return false;
    }),
    readFileSync: vi.fn((path: string) => {
      if (path.includes('embeddings.json')) {
        return JSON.stringify({
          version: '1.0',
          model: 'BGESmallENV15',
          dimensions: 384,
          documents: [
            {
              id: 'doc-1',
              path: 'getting-started.md',
              title: 'Getting Started',
              category: 'guides',
              keywords: ['start', 'begin', 'introduction'],
            },
            {
              id: 'doc-2',
              path: 'retry.md',
              title: 'Retry Configuration',
              category: 'features',
              keywords: ['retry', 'error', 'backoff'],
            },
          ],
        });
      }
      if (path.includes('.md')) {
        return '# Test Document\n\nThis is test content.\n\n## Section\n\nMore content here.';
      }
      return '';
    }),
  };
});

describe('SearchPanel', () => {
  let originalStdout: typeof process.stdout;
  let originalStdin: typeof process.stdin;
  let writeOutput: string[];

  beforeEach(() => {
    writeOutput = [];

    // Mock stdout
    originalStdout = process.stdout;
    Object.defineProperty(process, 'stdout', {
      value: {
        ...originalStdout,
        columns: 120,
        rows: 30,
        isTTY: true,
        write: vi.fn((data: string) => {
          writeOutput.push(data);
          return true;
        }),
        on: vi.fn(),
        removeAllListeners: vi.fn(),
      },
      writable: true,
    });

    // Mock stdin
    originalStdin = process.stdin;
    Object.defineProperty(process, 'stdin', {
      value: {
        ...originalStdin,
        isTTY: true,
        setRawMode: vi.fn(),
        on: vi.fn(),
        removeAllListeners: vi.fn(),
      },
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(process, 'stdout', { value: originalStdout, writable: true });
    Object.defineProperty(process, 'stdin', { value: originalStdin, writable: true });
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create panel with default options', () => {
      const panel = new SearchPanel();
      expect(panel).toBeDefined();
    });

    it('should accept initial query', () => {
      const panel = new SearchPanel({ initialQuery: 'retry' });
      expect(panel).toBeDefined();
    });

    it('should accept custom docs path', () => {
      const panel = new SearchPanel({ docsPath: '/custom/docs' });
      expect(panel).toBeDefined();
    });
  });

  describe('render methods', () => {
    it('should calculate dimensions correctly', () => {
      const panel = new SearchPanel();

      // Access private method via any
      (panel as any).updateDimensions();

      // Should have calculated widths
      expect((panel as any).termWidth).toBe(120);
      expect((panel as any).termHeight).toBe(30);
      expect((panel as any).leftPanelWidth).toBeGreaterThan(0);
      expect((panel as any).rightPanelWidth).toBeGreaterThan(0);
    });

    it('should format markdown correctly', () => {
      const panel = new SearchPanel();
      (panel as any).updateDimensions();

      const formatted = (panel as any).formatMarkdown('# Header\n\nParagraph text');

      expect(formatted.length).toBeGreaterThan(0);
      expect(formatted.some((l: string) => l.includes('Header'))).toBe(true);
    });

    it('should word wrap long lines', () => {
      const panel = new SearchPanel();
      (panel as any).updateDimensions();

      const longText = 'This is a very long line that should be wrapped because it exceeds the panel width significantly';
      const wrapped = (panel as any).wordWrap(longText, 40);

      expect(wrapped.length).toBeGreaterThan(1);
    });

    it('should strip ANSI codes correctly', () => {
      const panel = new SearchPanel();

      const ansiText = '\x1b[1m\x1b[31mRed Bold\x1b[0m';
      const stripped = (panel as any).stripAnsi(ansiText);

      expect(stripped).toBe('Red Bold');
    });
  });

  describe('navigation', () => {
    it('should navigate down through results', () => {
      const panel = new SearchPanel();
      (panel as any).state.results = [
        { title: 'Result 1', score: 0.9, path: 'a.md', content: '', snippet: '' },
        { title: 'Result 2', score: 0.8, path: 'b.md', content: '', snippet: '' },
        { title: 'Result 3', score: 0.7, path: 'c.md', content: '', snippet: '' },
      ];
      (panel as any).state.selectedIndex = 0;

      (panel as any).navigateDown();

      expect((panel as any).state.selectedIndex).toBe(1);
    });

    it('should navigate up through results', () => {
      const panel = new SearchPanel();
      (panel as any).state.results = [
        { title: 'Result 1', score: 0.9, path: 'a.md', content: '', snippet: '' },
        { title: 'Result 2', score: 0.8, path: 'b.md', content: '', snippet: '' },
      ];
      (panel as any).state.selectedIndex = 1;

      (panel as any).navigateUp();

      expect((panel as any).state.selectedIndex).toBe(0);
    });

    it('should not go below 0', () => {
      const panel = new SearchPanel();
      (panel as any).state.results = [{ title: 'Result 1', score: 0.9, path: 'a.md', content: '', snippet: '' }];
      (panel as any).state.selectedIndex = 0;

      (panel as any).navigateUp();

      expect((panel as any).state.selectedIndex).toBe(0);
    });

    it('should not exceed results length', () => {
      const panel = new SearchPanel();
      (panel as any).state.results = [{ title: 'Result 1', score: 0.9, path: 'a.md', content: '', snippet: '' }];
      (panel as any).state.selectedIndex = 0;

      (panel as any).navigateDown();

      expect((panel as any).state.selectedIndex).toBe(0);
    });
  });

  describe('preview scrolling', () => {
    it('should scroll preview down', () => {
      const panel = new SearchPanel();
      (panel as any).contentHeight = 20;
      (panel as any).previewContent = Array(50).fill('Line');
      (panel as any).state.previewScrollOffset = 0;

      (panel as any).scrollPreview(5);

      expect((panel as any).state.previewScrollOffset).toBe(5);
    });

    it('should scroll preview up', () => {
      const panel = new SearchPanel();
      (panel as any).contentHeight = 20;
      (panel as any).previewContent = Array(50).fill('Line');
      (panel as any).state.previewScrollOffset = 10;

      (panel as any).scrollPreview(-5);

      expect((panel as any).state.previewScrollOffset).toBe(5);
    });

    it('should not scroll above 0', () => {
      const panel = new SearchPanel();
      (panel as any).contentHeight = 20;
      (panel as any).previewContent = Array(50).fill('Line');
      (panel as any).state.previewScrollOffset = 2;

      (panel as any).scrollPreview(-10);

      expect((panel as any).state.previewScrollOffset).toBe(0);
    });

    it('should not scroll past content', () => {
      const panel = new SearchPanel();
      (panel as any).contentHeight = 20;
      (panel as any).previewContent = Array(25).fill('Line');
      (panel as any).state.previewScrollOffset = 0;

      (panel as any).scrollPreview(100);

      // Max scroll = 25 - 20 + 2 = 7
      expect((panel as any).state.previewScrollOffset).toBeLessThanOrEqual(25);
    });
  });

  describe('close', () => {
    it('should set running to false', () => {
      const panel = new SearchPanel();
      (panel as any).running = true;

      panel.close();

      expect((panel as any).running).toBe(false);
    });

    it('should restore terminal state', () => {
      const panel = new SearchPanel();
      (panel as any).running = true;
      (panel as any).rl = {
        close: vi.fn(),
      };

      panel.close();

      expect((panel as any).rl).toBeNull();
    });
  });
});
