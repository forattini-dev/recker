/**
 * Custom terminal spinner - zero dependencies
 *
 * Replaces `ora` with a simple, lightweight implementation.
 */

import colors from '../../utils/colors.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const FRAME_INTERVAL = 80;

export interface SpinnerOptions {
  text?: string;
  color?: 'cyan' | 'green' | 'yellow' | 'red' | 'blue' | 'magenta' | 'white' | 'gray';
}

export interface Spinner {
  text: string;
  start(): Spinner;
  stop(): Spinner;
  succeed(text?: string): Spinner;
  fail(text?: string): Spinner;
  info(text?: string): Spinner;
  warn(text?: string): Spinner;
  isSpinning: boolean;
}

class TerminalSpinner implements Spinner {
  private _text: string;
  private color: (str: string) => string;
  private frameIndex = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private stream = process.stderr;
  isSpinning = false;

  constructor(options: SpinnerOptions = {}) {
    this._text = options.text || '';
    this.color = this.getColorFn(options.color || 'cyan');
  }

  private getColorFn(color: string): (str: string) => string {
    switch (color) {
      case 'green': return colors.green;
      case 'yellow': return colors.yellow;
      case 'red': return colors.red;
      case 'blue': return colors.blue;
      case 'magenta': return colors.magenta;
      case 'gray': return colors.gray;
      case 'white': return (s: string) => s;
      case 'cyan':
      default: return colors.cyan;
    }
  }

  get text(): string {
    return this._text;
  }

  set text(value: string) {
    this._text = value;
  }

  start(): Spinner {
    if (this.isSpinning) return this;

    this.isSpinning = true;
    this.frameIndex = 0;

    // Hide cursor
    this.stream.write('\x1b[?25l');

    this.intervalId = setInterval(() => {
      this.render();
      this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length;
    }, FRAME_INTERVAL);

    return this;
  }

  private render(): void {
    const frame = SPINNER_FRAMES[this.frameIndex];
    const line = `${this.color(frame)} ${this._text}`;

    // Clear line and write
    this.stream.write(`\r\x1b[K${line}`);
  }

  private clearLine(): void {
    this.stream.write('\r\x1b[K');
  }

  stop(): Spinner {
    if (!this.isSpinning) return this;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isSpinning = false;
    this.clearLine();

    // Show cursor
    this.stream.write('\x1b[?25h');

    return this;
  }

  succeed(text?: string): Spinner {
    this.stop();
    const finalText = text ?? this._text;
    console.log(`${colors.green('✔')} ${finalText}`);
    return this;
  }

  fail(text?: string): Spinner {
    this.stop();
    const finalText = text ?? this._text;
    console.log(`${colors.red('✖')} ${finalText}`);
    return this;
  }

  info(text?: string): Spinner {
    this.stop();
    const finalText = text ?? this._text;
    console.log(`${colors.blue('ℹ')} ${finalText}`);
    return this;
  }

  warn(text?: string): Spinner {
    this.stop();
    const finalText = text ?? this._text;
    console.log(`${colors.yellow('⚠')} ${finalText}`);
    return this;
  }
}

/**
 * Create a new spinner instance
 */
export function createSpinner(options?: SpinnerOptions | string): Spinner {
  if (typeof options === 'string') {
    return new TerminalSpinner({ text: options });
  }
  return new TerminalSpinner(options);
}

export default createSpinner;
