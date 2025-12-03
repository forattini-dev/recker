/**
 * SearchPanel - Fullscreen documentation search with split view.
 *
 * Features:
 * - Left panel: Navigable list of search results
 * - Right panel: Preview of selected document
 * - Keyboard navigation (arrows, enter, escape)
 * - Real-time search updates
 */

import { createInterface, Interface } from 'readline';
import { getShellSearch } from './shell-search.js';
import type { SearchResult } from '../../mcp/search/types.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import colors from '../../utils/colors.js';

// ANSI escape codes for cursor and screen control
const ESC = '\x1b';
const CLEAR_SCREEN = `${ESC}[2J`;
const CURSOR_HOME = `${ESC}[H`;
const CURSOR_HIDE = `${ESC}[?25l`;
const CURSOR_SHOW = `${ESC}[?25h`;
const CLEAR_LINE = `${ESC}[2K`;

// Box drawing characters
const BOX = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  verticalRight: '├',
  verticalLeft: '┤',
  horizontalDown: '┬',
  horizontalUp: '┴',
  cross: '┼',
};

interface SearchPanelOptions {
  initialQuery?: string;
  docsPath?: string;
}

interface PanelState {
  query: string;
  results: SearchResult[];
  selectedIndex: number;
  scrollOffset: number;
  previewScrollOffset: number;
  isSearching: boolean;
  error: string | null;
}

/**
 * Fullscreen search panel with split view.
 */
export class SearchPanel {
  private rl: Interface | null = null;
  private state: PanelState;
  private docsPath: string;
  private running = false;
  private termWidth = 80;
  private termHeight = 24;
  private leftPanelWidth = 0;
  private rightPanelWidth = 0;
  private contentHeight = 0;
  private previewContent: string[] = [];

  constructor(options: SearchPanelOptions = {}) {
    this.state = {
      query: options.initialQuery || '',
      results: [],
      selectedIndex: 0,
      scrollOffset: 0,
      previewScrollOffset: 0,
      isSearching: false,
      error: null,
    };
    this.docsPath = options.docsPath || this.findDocsPath();
  }

  private findDocsPath(): string {
    const candidates = [
      join(process.cwd(), 'docs'),
      join(dirname(fileURLToPath(import.meta.url)), '../../../docs'),
      join(dirname(fileURLToPath(import.meta.url)), '../../../../docs'),
    ];
    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
    return candidates[0];
  }

  /**
   * Open the search panel in fullscreen mode.
   */
  async open(): Promise<void> {
    this.running = true;

    // Get terminal dimensions
    this.updateDimensions();

    // Setup readline for key input
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // Enable raw mode for key detection
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    // Handle resize
    process.stdout.on('resize', () => {
      this.updateDimensions();
      this.render();
    });

    // Handle key input
    process.stdin.on('data', this.handleKeyInput.bind(this));

    // Initial search if query provided
    if (this.state.query) {
      await this.performSearch();
    }

    // Initial render
    this.render();

    // Wait until closed
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.running) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Close the search panel and restore terminal.
   */
  close(): void {
    this.running = false;

    // Restore terminal state
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    process.stdout.write(CURSOR_SHOW);
    process.stdout.write(CLEAR_SCREEN);
    process.stdout.write(CURSOR_HOME);

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    // Remove listeners
    process.stdin.removeAllListeners('data');
    process.stdout.removeAllListeners('resize');
  }

  private updateDimensions(): void {
    this.termWidth = process.stdout.columns || 80;
    this.termHeight = process.stdout.rows || 24;

    // Split: 40% left (results), 60% right (preview)
    this.leftPanelWidth = Math.max(30, Math.floor(this.termWidth * 0.4));
    this.rightPanelWidth = this.termWidth - this.leftPanelWidth - 1; // -1 for divider

    // Content height (minus header, footer, borders)
    this.contentHeight = this.termHeight - 6; // header(3) + footer(2) + border(1)
  }

  private async handleKeyInput(data: Buffer): Promise<void> {
    const key = data.toString();

    // Escape or Ctrl+C - close panel
    if (key === '\x1b' || key === '\x03') {
      this.close();
      return;
    }

    // Arrow keys (escape sequences)
    if (key === '\x1b[A') {
      // Up arrow
      this.navigateUp();
    } else if (key === '\x1b[B') {
      // Down arrow
      this.navigateDown();
    } else if (key === '\x1b[C') {
      // Right arrow - scroll preview down
      this.scrollPreview(5);
    } else if (key === '\x1b[D') {
      // Left arrow - scroll preview up
      this.scrollPreview(-5);
    } else if (key === '\x1b[5~') {
      // Page Up
      this.scrollPreview(-this.contentHeight);
    } else if (key === '\x1b[6~') {
      // Page Down
      this.scrollPreview(this.contentHeight);
    } else if (key === '\r' || key === '\n') {
      // Enter - could open full doc or copy path
      // For now, just show info
    } else if (key === '\x7f' || key === '\b') {
      // Backspace
      if (this.state.query.length > 0) {
        this.state.query = this.state.query.slice(0, -1);
        await this.performSearch();
      }
    } else if (key.length === 1 && key >= ' ') {
      // Regular character - add to query
      this.state.query += key;
      await this.performSearch();
    }

    this.render();
  }

  private navigateUp(): void {
    if (this.state.selectedIndex > 0) {
      this.state.selectedIndex--;
      this.state.previewScrollOffset = 0;

      // Adjust scroll if needed
      if (this.state.selectedIndex < this.state.scrollOffset) {
        this.state.scrollOffset = this.state.selectedIndex;
      }

      this.loadPreview();
    }
  }

  private navigateDown(): void {
    if (this.state.selectedIndex < this.state.results.length - 1) {
      this.state.selectedIndex++;
      this.state.previewScrollOffset = 0;

      // Adjust scroll if needed
      const visibleItems = this.contentHeight - 2;
      if (this.state.selectedIndex >= this.state.scrollOffset + visibleItems) {
        this.state.scrollOffset = this.state.selectedIndex - visibleItems + 1;
      }

      this.loadPreview();
    }
  }

  private scrollPreview(delta: number): void {
    const maxScroll = Math.max(0, this.previewContent.length - this.contentHeight + 2);
    this.state.previewScrollOffset = Math.max(0, Math.min(maxScroll, this.state.previewScrollOffset + delta));
  }

  private async performSearch(): Promise<void> {
    if (!this.state.query.trim()) {
      this.state.results = [];
      this.state.selectedIndex = 0;
      this.state.scrollOffset = 0;
      this.previewContent = [];
      return;
    }

    this.state.isSearching = true;
    this.state.error = null;

    try {
      const search = getShellSearch();
      this.state.results = await search.search(this.state.query, { limit: 20 });
      this.state.selectedIndex = 0;
      this.state.scrollOffset = 0;
      this.state.previewScrollOffset = 0;

      if (this.state.results.length > 0) {
        this.loadPreview();
      } else {
        this.previewContent = [];
      }
    } catch (error: any) {
      this.state.error = error.message;
      this.state.results = [];
    } finally {
      this.state.isSearching = false;
    }
  }

  private loadPreview(): void {
    const result = this.state.results[this.state.selectedIndex];
    if (!result) {
      this.previewContent = [];
      return;
    }

    // Try to load full content
    const fullPath = join(this.docsPath, result.path);
    if (existsSync(fullPath)) {
      try {
        const content = readFileSync(fullPath, 'utf-8');
        this.previewContent = this.formatMarkdown(content);
      } catch {
        this.previewContent = this.formatMarkdown(result.content || result.snippet || 'No preview available');
      }
    } else if (result.content) {
      this.previewContent = this.formatMarkdown(result.content);
    } else if (result.snippet) {
      this.previewContent = this.formatMarkdown(result.snippet);
    } else {
      this.previewContent = ['No preview available'];
    }
  }

  private formatMarkdown(text: string): string[] {
    const lines: string[] = [];
    const width = this.rightPanelWidth - 4; // Padding

    for (const rawLine of text.split('\n')) {
      let line = rawLine;

      // Format headers
      if (line.startsWith('# ')) {
        line = colors.bold(colors.cyan(line.substring(2)));
      } else if (line.startsWith('## ')) {
        line = colors.bold(colors.blue(line.substring(3)));
      } else if (line.startsWith('### ')) {
        line = colors.bold(colors.green(line.substring(4)));
      } else if (line.startsWith('#### ')) {
        line = colors.bold(line.substring(5));
      }

      // Format code blocks
      else if (line.startsWith('```')) {
        line = colors.gray(line);
      }

      // Format inline code
      else if (line.includes('`')) {
        line = line.replace(/`([^`]+)`/g, (_, code) => colors.cyan(code));
      }

      // Format bold
      if (line.includes('**')) {
        line = line.replace(/\*\*([^*]+)\*\*/g, (_, text) => colors.bold(text));
      }

      // Word wrap
      const wrapped = this.wordWrap(line, width);
      lines.push(...wrapped);
    }

    return lines;
  }

  private wordWrap(text: string, width: number): string[] {
    if (this.stripAnsi(text).length <= width) {
      return [text];
    }

    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (this.stripAnsi(testLine).length <= width) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) lines.push(currentLine);
    return lines;
  }

  private stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }

  private render(): void {
    const output: string[] = [];

    // Hide cursor, clear screen, and move to home
    output.push(CURSOR_HIDE);
    output.push(CLEAR_SCREEN);
    output.push(CURSOR_HOME);

    // Header
    output.push(this.renderHeader());

    // Search input
    output.push(this.renderSearchInput());

    // Divider
    output.push(this.renderDivider());

    // Content (split panels)
    output.push(...this.renderContent());

    // Footer
    output.push(this.renderFooter());

    // Write to stdout
    process.stdout.write(output.join(''));
  }

  private renderHeader(): string {
    const title = ' Documentation Search ';
    const padding = Math.max(0, Math.floor((this.termWidth - title.length) / 2));
    const line = BOX.horizontal.repeat(this.termWidth);

    return (
      colors.cyan(BOX.topLeft + line.slice(0, padding - 1)) +
      colors.bold(colors.cyan(title)) +
      colors.cyan(line.slice(padding + title.length - 1) + BOX.topRight) +
      '\n'
    );
  }

  private renderSearchInput(): string {
    const prefix = colors.cyan(BOX.vertical) + ' ' + colors.yellow('Search: ');
    const query = this.state.query;
    const cursor = colors.cyan('_');
    const status = this.state.isSearching
      ? colors.gray(' (searching...)')
      : this.state.results.length > 0
        ? colors.gray(` (${this.state.results.length} results)`)
        : '';

    const contentWidth = this.termWidth - 4;
    const inputLine = query + cursor + status;
    const padding = Math.max(0, contentWidth - this.stripAnsi(inputLine).length);

    return prefix + inputLine + ' '.repeat(padding) + colors.cyan(BOX.vertical) + '\n';
  }

  private renderDivider(): string {
    const leftPart = BOX.horizontal.repeat(this.leftPanelWidth - 1);
    const rightPart = BOX.horizontal.repeat(this.rightPanelWidth);

    return (
      colors.cyan(BOX.verticalRight) +
      colors.cyan(leftPart) +
      colors.cyan(BOX.horizontalDown) +
      colors.cyan(rightPart) +
      colors.cyan(BOX.verticalLeft) +
      '\n'
    );
  }

  private renderContent(): string[] {
    const lines: string[] = [];

    for (let i = 0; i < this.contentHeight; i++) {
      const leftContent = this.renderLeftPanelLine(i);
      const rightContent = this.renderRightPanelLine(i);

      lines.push(
        colors.cyan(BOX.vertical) +
          leftContent +
          colors.cyan(BOX.vertical) +
          rightContent +
          colors.cyan(BOX.vertical) +
          '\n'
      );
    }

    return lines;
  }

  private renderLeftPanelLine(lineIndex: number): string {
    const width = this.leftPanelWidth - 2;
    const resultIndex = this.state.scrollOffset + lineIndex;

    if (resultIndex >= this.state.results.length) {
      return ' '.repeat(width);
    }

    const result = this.state.results[resultIndex];
    const isSelected = resultIndex === this.state.selectedIndex;
    const score = Math.round(result.score * 100);

    // Format: [idx] Title (score%)
    const indexStr = ` ${resultIndex + 1}. `;
    const scoreStr = ` (${score}%)`;
    const maxTitleLen = width - indexStr.length - scoreStr.length - 1;
    let title = result.title;

    if (title.length > maxTitleLen) {
      title = title.slice(0, maxTitleLen - 1) + '…';
    }

    let line = indexStr + title + scoreStr;
    const padding = width - this.stripAnsi(line).length;
    line += ' '.repeat(Math.max(0, padding));

    if (isSelected) {
      return colors.bgBlue(colors.white(colors.bold(line)));
    }

    return colors.white(indexStr) + colors.white(title) + colors.gray(scoreStr) + ' '.repeat(Math.max(0, padding));
  }

  private renderRightPanelLine(lineIndex: number): string {
    const width = this.rightPanelWidth - 1;
    const contentIndex = this.state.previewScrollOffset + lineIndex;

    if (this.state.results.length === 0) {
      if (lineIndex === Math.floor(this.contentHeight / 2) - 1) {
        const msg = this.state.query ? 'No results found' : 'Type to search documentation';
        const padding = Math.floor((width - msg.length) / 2);
        return ' '.repeat(padding) + colors.gray(msg) + ' '.repeat(width - padding - msg.length);
      }
      return ' '.repeat(width);
    }

    if (contentIndex >= this.previewContent.length) {
      return ' '.repeat(width);
    }

    let line = ' ' + this.previewContent[contentIndex];
    const visibleLen = this.stripAnsi(line).length;

    if (visibleLen > width) {
      // Truncate (simple approach - may break ANSI codes)
      line = line.slice(0, width - 1) + '…';
    } else {
      line += ' '.repeat(width - visibleLen);
    }

    return line;
  }

  private renderFooter(): string {
    const bottomLine = BOX.horizontal.repeat(this.termWidth - 2);
    const helpText = ' ↑↓ Navigate  ←→ Scroll preview  ESC Close ';
    const pathText = this.state.results[this.state.selectedIndex]
      ? ` ${this.state.results[this.state.selectedIndex].path} `
      : '';

    const footerLine =
      colors.cyan(BOX.bottomLeft) +
      colors.cyan(bottomLine) +
      colors.cyan(BOX.bottomRight) +
      '\n' +
      colors.gray(helpText) +
      ' '.repeat(Math.max(0, this.termWidth - helpText.length - pathText.length)) +
      colors.cyan(pathText);

    return (
      colors.cyan(BOX.verticalRight) +
      colors.cyan(BOX.horizontal.repeat(this.leftPanelWidth - 1)) +
      colors.cyan(BOX.horizontalUp) +
      colors.cyan(BOX.horizontal.repeat(this.rightPanelWidth)) +
      colors.cyan(BOX.verticalLeft) +
      '\n' +
      footerLine
    );
  }
}

/**
 * Open the search panel with an optional initial query.
 */
export async function openSearchPanel(query?: string): Promise<void> {
  const panel = new SearchPanel({ initialQuery: query });
  await panel.open();
}
