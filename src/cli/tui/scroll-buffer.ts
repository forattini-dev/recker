/**
 * Scrollable output buffer for the shell.
 * Captures all output and allows Page Up/Down and mouse scroll navigation.
 */

import { EventEmitter } from 'node:events';

export interface ScrollBufferOptions {
  maxLines?: number;       // Maximum lines to keep in buffer
  viewportHeight?: number; // Height of visible viewport
}

export class ScrollBuffer extends EventEmitter {
  private lines: string[] = [];
  private scrollOffset: number = 0;  // Lines scrolled from bottom
  private maxLines: number;
  private viewportHeight: number;
  private isScrollMode: boolean = false;
  private originalWrite: typeof process.stdout.write | null = null;
  private pendingOutput: string = '';

  constructor(options: ScrollBufferOptions = {}) {
    super();
    this.maxLines = options.maxLines || 10000;
    this.viewportHeight = options.viewportHeight || (process.stdout.rows || 24) - 2;
  }

  /**
   * Add content to the buffer
   */
  write(content: string): void {
    // Split into lines, handling partial lines
    const parts = (this.pendingOutput + content).split('\n');
    this.pendingOutput = parts.pop() || '';  // Keep incomplete line

    for (const part of parts) {
      this.lines.push(part);
    }

    // Trim buffer if too large
    if (this.lines.length > this.maxLines) {
      this.lines = this.lines.slice(-this.maxLines);
    }

    // If at bottom (not scrolled), show new content
    if (this.scrollOffset === 0 && !this.isScrollMode) {
      this.emit('output', content);
    }
  }

  /**
   * Flush any pending partial line
   */
  flush(): void {
    if (this.pendingOutput) {
      this.lines.push(this.pendingOutput);
      this.pendingOutput = '';
    }
  }

  /**
   * Get total line count
   */
  get lineCount(): number {
    return this.lines.length;
  }

  /**
   * Get current scroll position (lines from bottom)
   */
  get position(): number {
    return this.scrollOffset;
  }

  /**
   * Check if scrolled up (not at bottom)
   */
  get isScrolledUp(): boolean {
    return this.scrollOffset > 0;
  }

  /**
   * Scroll up by N lines
   */
  scrollUp(lines: number = 1): boolean {
    const maxScroll = Math.max(0, this.lines.length - this.viewportHeight);
    const newOffset = Math.min(this.scrollOffset + lines, maxScroll);

    if (newOffset !== this.scrollOffset) {
      this.scrollOffset = newOffset;
      return true;
    }
    return false;
  }

  /**
   * Scroll down by N lines
   */
  scrollDown(lines: number = 1): boolean {
    const newOffset = Math.max(0, this.scrollOffset - lines);

    if (newOffset !== this.scrollOffset) {
      this.scrollOffset = newOffset;
      return true;
    }
    return false;
  }

  /**
   * Scroll up by one page
   */
  pageUp(): boolean {
    return this.scrollUp(this.viewportHeight - 1);
  }

  /**
   * Scroll down by one page
   */
  pageDown(): boolean {
    return this.scrollDown(this.viewportHeight - 1);
  }

  /**
   * Scroll to top
   */
  scrollToTop(): void {
    this.scrollOffset = Math.max(0, this.lines.length - this.viewportHeight);
  }

  /**
   * Scroll to bottom (most recent)
   */
  scrollToBottom(): void {
    this.scrollOffset = 0;
  }

  /**
   * Get visible lines for current viewport
   */
  getVisibleLines(): string[] {
    const endIndex = this.lines.length - this.scrollOffset;
    const startIndex = Math.max(0, endIndex - this.viewportHeight);
    return this.lines.slice(startIndex, endIndex);
  }

  /**
   * Render the current viewport
   */
  render(): string {
    const visibleLines = this.getVisibleLines();
    let output = '';

    // Clear screen and move to top
    output += '\x1b[2J\x1b[H';

    // Render visible lines
    output += visibleLines.join('\n');

    // Add scroll indicator if not at bottom
    if (this.scrollOffset > 0) {
      const indicator = `\x1b[7m ↑ ${this.scrollOffset} lines above | Page Down to scroll ↓ \x1b[0m`;
      output += `\n${indicator}`;
    }

    return output;
  }

  /**
   * Update viewport height (on terminal resize)
   */
  updateViewport(height?: number): void {
    this.viewportHeight = height || (process.stdout.rows || 24) - 2;
  }

  /**
   * Enter scroll mode (capture stdout, enable navigation)
   */
  enterScrollMode(): void {
    if (this.isScrollMode) return;
    this.isScrollMode = true;

    // Save current scroll position
    this.flush();

    // Emit event for scroll mode start
    this.emit('scrollModeStart');
  }

  /**
   * Exit scroll mode (return to normal)
   */
  exitScrollMode(): void {
    if (!this.isScrollMode) return;
    this.isScrollMode = false;
    this.scrollToBottom();

    this.emit('scrollModeEnd');
  }

  /**
   * Check if in scroll mode
   */
  get inScrollMode(): boolean {
    return this.isScrollMode;
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.lines = [];
    this.scrollOffset = 0;
    this.pendingOutput = '';
  }

  /**
   * Get scroll position info for status bar
   */
  getScrollInfo(): { current: number; total: number; percent: number } {
    const total = this.lines.length;
    const current = total - this.scrollOffset;
    const percent = total > 0 ? Math.round((current / total) * 100) : 100;

    return { current, total, percent };
  }
}

/**
 * Key sequence detection for scroll navigation
 * Supports multiple terminal escape sequence formats for compatibility.
 */
export function parseScrollKey(data: Buffer): 'pageUp' | 'pageDown' | 'scrollUp' | 'scrollDown' | 'home' | 'end' | 'quit' | null {
  const str = data.toString();

  // Page Up: Multiple terminal formats
  // \x1b[5~  - VT/xterm standard
  // \x1bOy   - Application mode
  // \x1b[5;5~ - With modifier (Ctrl)
  // \x1b[5;2~ - With modifier (Shift)
  if (str === '\x1b[5~' || str === '\x1bOy' || str === '\x1b[5;5~' || str === '\x1b[5;2~') return 'pageUp';

  // Page Down: Multiple terminal formats
  // \x1b[6~  - VT/xterm standard
  // \x1bOs   - Application mode
  // \x1b[6;5~ - With modifier (Ctrl)
  // \x1b[6;2~ - With modifier (Shift)
  if (str === '\x1b[6~' || str === '\x1bOs' || str === '\x1b[6;5~' || str === '\x1b[6;2~') return 'pageDown';

  // Shift+Up: scroll up line by line
  // \x1b[1;2A - Standard with shift modifier
  // \x1b[A    - Basic up arrow (when in scroll mode)
  if (str === '\x1b[1;2A') return 'scrollUp';

  // Shift+Down: scroll down line by line
  // \x1b[1;2B - Standard with shift modifier
  // \x1b[B    - Basic down arrow (when in scroll mode)
  if (str === '\x1b[1;2B') return 'scrollDown';

  // Home: Multiple formats
  // \x1b[H   - VT100
  // \x1b[1~  - VT220
  // \x1bOH   - Application mode
  // \x1b[7~  - rxvt/urxvt
  if (str === '\x1b[H' || str === '\x1b[1~' || str === '\x1bOH' || str === '\x1b[7~') return 'home';

  // End: Multiple formats
  // \x1b[F   - VT100
  // \x1b[4~  - VT220
  // \x1bOF   - Application mode
  // \x1b[8~  - rxvt/urxvt
  if (str === '\x1b[F' || str === '\x1b[4~' || str === '\x1bOF' || str === '\x1b[8~') return 'end';

  // Q or q to quit scroll mode
  if (str === 'q' || str === 'Q') return 'quit';

  return null;
}

/**
 * Parse mouse wheel events (when mouse reporting is enabled)
 * Mouse wheel up: \x1b[<64;x;yM or \x1b[M`xy
 * Mouse wheel down: \x1b[<65;x;yM or \x1b[M a xy
 */
export function parseMouseScroll(data: Buffer): 'scrollUp' | 'scrollDown' | null {
  const str = data.toString();

  // SGR extended mouse mode: \x1b[<button;x;yM
  const sgrMatch = str.match(/\x1b\[<(\d+);(\d+);(\d+)[Mm]/);
  if (sgrMatch) {
    const button = parseInt(sgrMatch[1], 10);
    // Button 64 = wheel up, 65 = wheel down
    if (button === 64) return 'scrollUp';
    if (button === 65) return 'scrollDown';
  }

  // Normal mouse mode: \x1b[M followed by 3 bytes
  // Button byte: 96 (0x60) = wheel up, 97 (0x61) = wheel down
  if (data.length >= 6 && data[0] === 0x1b && data[1] === 0x5b && data[2] === 0x4d) {
    const button = data[3];
    if (button === 96 || button === 0x60) return 'scrollUp';
    if (button === 97 || button === 0x61) return 'scrollDown';
  }

  return null;
}

/**
 * Enable mouse reporting for scroll wheel detection
 */
export function enableMouseReporting(): void {
  // Enable SGR extended mouse mode (better support for large terminals)
  // \x1b[?1000h = Enable mouse tracking
  // \x1b[?1006h = Enable SGR extended mode
  process.stdout.write('\x1b[?1000h\x1b[?1006h');
}

/**
 * Disable mouse reporting
 */
export function disableMouseReporting(): void {
  process.stdout.write('\x1b[?1000l\x1b[?1006l');
}
