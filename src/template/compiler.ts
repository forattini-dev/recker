/**
 * Template Compiler
 *
 * Parses template syntax into an AST and compiles to render functions.
 * Supports:
 * - {{variable}} and {{{raw}}}
 * - {{#block}}...{{/block}} and {{#block}}...{{else}}...{{/block}}
 * - {{> partial}}
 * - {{! comment }} and {{!-- comment --}}
 * - {{helper arg1 arg2 key=value}}
 * - {{value | filter1 | filter2}}
 * - Nested paths: user.profile.name, items.[0].id
 * - Parent access: ../parent
 * - Data variables: @index, @first, @last, @key
 */

import type {
  ProgramNode,
  ASTNode,
  TextNode,
  ExpressionNode,
  RawExpressionNode,
  BlockNode,
  PartialNode,
  CommentNode,
  PathExpression,
  Expression,
  StringLiteral,
  NumberLiteral,
  BooleanLiteral,
  NullLiteral,
  SubExpression,
  HashPair,
  FilterExpression,
  SourceLocation,
  Position,
  TemplateOptions,
} from './types.js';
import {
  TemplateSyntaxError,
  UnclosedBlockError,
  MismatchedBlockError,
  UnexpectedCloseBlockError,
} from './errors.js';

// ============================================================================
// Tokenizer
// ============================================================================

type TokenType =
  | 'TEXT'
  | 'OPEN'           // {{
  | 'OPEN_RAW'       // {{{
  | 'OPEN_BLOCK'     // {{#
  | 'OPEN_END_BLOCK' // {{/
  | 'OPEN_PARTIAL'   // {{>
  | 'OPEN_COMMENT'   // {{!
  | 'CLOSE'          // }}
  | 'CLOSE_RAW'      // }}}
  | 'ID'             // identifier
  | 'STRING'         // "string" or 'string'
  | 'NUMBER'         // 123 or 123.45
  | 'BOOLEAN'        // true or false
  | 'NULL'           // null
  | 'OPEN_PAREN'     // (
  | 'CLOSE_PAREN'    // )
  | 'OPEN_BRACKET'   // [
  | 'CLOSE_BRACKET'  // ]
  | 'DOT'            // .
  | 'DOTDOT'         // ..
  | 'SLASH'          // /
  | 'EQUALS'         // =
  | 'PIPE'           // |
  | 'AT'             // @
  | 'ELSE'           // else keyword
  | 'AS'             // as keyword
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  loc: SourceLocation;
}

class Tokenizer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];
  private openDelimiter: string;
  private closeDelimiter: string;
  private rawOpenDelimiter: string;
  private rawCloseDelimiter: string;

  constructor(source: string, options?: TemplateOptions) {
    this.source = source;
    this.openDelimiter = options?.delimiters?.[0] ?? '{{';
    this.closeDelimiter = options?.delimiters?.[1] ?? '}}';
    this.rawOpenDelimiter = options?.rawDelimiters?.[0] ?? '{{{';
    this.rawCloseDelimiter = options?.rawDelimiters?.[1] ?? '}}}';
  }

  tokenize(): Token[] {
    while (this.pos < this.source.length) {
      this.scanToken();
    }
    this.tokens.push(this.createToken('EOF', ''));
    return this.tokens;
  }

  private scanToken(): void {
    // Check for raw expression first (longer delimiter)
    if (this.match(this.rawOpenDelimiter)) {
      this.scanExpression(true);
      return;
    }

    // Check for regular expression
    if (this.match(this.openDelimiter)) {
      this.scanExpression(false);
      return;
    }

    // Scan text until next expression
    this.scanText();
  }

  private scanText(): void {
    const start = this.getPosition();
    let value = '';

    while (this.pos < this.source.length) {
      if (this.match(this.rawOpenDelimiter) || this.match(this.openDelimiter)) {
        break;
      }
      value += this.advance();
    }

    if (value) {
      this.tokens.push({
        type: 'TEXT',
        value,
        loc: { start, end: this.getPosition() },
      });
    }
  }

  private scanExpression(raw: boolean): void {
    const start = this.getPosition();
    const openDelim = raw ? this.rawOpenDelimiter : this.openDelimiter;
    const closeDelim = raw ? this.rawCloseDelimiter : this.closeDelimiter;

    // Consume opening delimiter
    this.consume(openDelim);

    // Check for special expression types
    const nextChar = this.peek();

    if (!raw && nextChar === '#') {
      this.advance();
      this.tokens.push(this.createToken('OPEN_BLOCK', openDelim + '#', start));
    } else if (!raw && nextChar === '/') {
      this.advance();
      this.tokens.push(this.createToken('OPEN_END_BLOCK', openDelim + '/', start));
    } else if (!raw && nextChar === '>') {
      this.advance();
      this.tokens.push(this.createToken('OPEN_PARTIAL', openDelim + '>', start));
    } else if (!raw && nextChar === '!') {
      this.advance();
      this.scanComment(start);
      return;
    } else {
      this.tokens.push(this.createToken(raw ? 'OPEN_RAW' : 'OPEN', openDelim, start));
    }

    // Scan expression content
    this.scanExpressionContent(closeDelim, raw);
  }

  private scanExpressionContent(closeDelim: string, raw: boolean): void {
    this.skipWhitespace();

    while (this.pos < this.source.length && !this.match(closeDelim)) {
      this.skipWhitespace();

      if (this.match(closeDelim)) break;

      const start = this.getPosition();
      const char = this.peek();

      // String literal
      if (char === '"' || char === "'") {
        this.scanString(char);
        continue;
      }

      // Number literal
      if (/[0-9]/.test(char) || (char === '-' && /[0-9]/.test(this.peekNext()))) {
        this.scanNumber();
        continue;
      }

      // Operators and punctuation
      if (char === '(') {
        this.advance();
        this.tokens.push(this.createToken('OPEN_PAREN', '(', start));
        continue;
      }

      if (char === ')') {
        this.advance();
        this.tokens.push(this.createToken('CLOSE_PAREN', ')', start));
        continue;
      }

      if (char === '[') {
        this.advance();
        this.tokens.push(this.createToken('OPEN_BRACKET', '[', start));
        continue;
      }

      if (char === ']') {
        this.advance();
        this.tokens.push(this.createToken('CLOSE_BRACKET', ']', start));
        continue;
      }

      if (char === '.') {
        if (this.peekNext() === '.') {
          this.advance();
          this.advance();
          this.tokens.push(this.createToken('DOTDOT', '..', start));
        } else {
          this.advance();
          this.tokens.push(this.createToken('DOT', '.', start));
        }
        continue;
      }

      if (char === '/') {
        this.advance();
        this.tokens.push(this.createToken('SLASH', '/', start));
        continue;
      }

      if (char === '=') {
        this.advance();
        this.tokens.push(this.createToken('EQUALS', '=', start));
        continue;
      }

      if (char === '|') {
        this.advance();
        this.tokens.push(this.createToken('PIPE', '|', start));
        continue;
      }

      if (char === '@') {
        this.advance();
        this.tokens.push(this.createToken('AT', '@', start));
        continue;
      }

      // Identifier
      if (/[a-zA-Z_$]/.test(char)) {
        this.scanIdentifier();
        continue;
      }

      // Unknown character
      throw new TemplateSyntaxError(`Unexpected character: ${char}`, {
        location: { start, end: this.getPosition() },
        source: this.source,
      });
    }

    // Consume closing delimiter
    if (this.match(closeDelim)) {
      const start = this.getPosition();
      this.consume(closeDelim);
      this.tokens.push(this.createToken(raw ? 'CLOSE_RAW' : 'CLOSE', closeDelim, start));
    } else {
      throw new TemplateSyntaxError(`Unclosed template expression`, {
        location: { start: this.getPosition(), end: this.getPosition() },
        source: this.source,
      });
    }
  }

  private scanComment(start: Position): void {
    // Check for long comment {{!-- ... --}}
    const isLongComment = this.match('--');
    if (isLongComment) {
      this.consume('--');
    }

    let value = '';
    const endPattern = isLongComment ? '--' + this.closeDelimiter : this.closeDelimiter;

    while (this.pos < this.source.length && !this.match(endPattern)) {
      value += this.advance();
    }

    if (!this.match(endPattern)) {
      throw new TemplateSyntaxError(`Unclosed comment`, {
        location: { start, end: this.getPosition() },
        source: this.source,
      });
    }

    this.consume(endPattern);
    this.tokens.push({
      type: 'OPEN_COMMENT',
      value: value.trim(),
      loc: { start, end: this.getPosition() },
    });
  }

  private scanString(quote: string): void {
    const start = this.getPosition();
    this.advance(); // consume opening quote

    let value = '';
    while (this.pos < this.source.length && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance();
        const escaped = this.advance();
        switch (escaped) {
          case 'n': value += '\n'; break;
          case 'r': value += '\r'; break;
          case 't': value += '\t'; break;
          case '\\': value += '\\'; break;
          default: value += escaped;
        }
      } else {
        value += this.advance();
      }
    }

    if (this.peek() !== quote) {
      throw new TemplateSyntaxError(`Unclosed string`, {
        location: { start, end: this.getPosition() },
        source: this.source,
      });
    }
    this.advance(); // consume closing quote

    this.tokens.push({
      type: 'STRING',
      value,
      loc: { start, end: this.getPosition() },
    });
  }

  private scanNumber(): void {
    const start = this.getPosition();
    let value = '';

    if (this.peek() === '-') {
      value += this.advance();
    }

    while (/[0-9]/.test(this.peek())) {
      value += this.advance();
    }

    if (this.peek() === '.' && /[0-9]/.test(this.peekNext())) {
      value += this.advance();
      while (/[0-9]/.test(this.peek())) {
        value += this.advance();
      }
    }

    this.tokens.push({
      type: 'NUMBER',
      value,
      loc: { start, end: this.getPosition() },
    });
  }

  private scanIdentifier(): void {
    const start = this.getPosition();
    let value = '';

    while (/[a-zA-Z0-9_$-]/.test(this.peek())) {
      value += this.advance();
    }

    // Check for keywords
    let type: TokenType = 'ID';
    if (value === 'true' || value === 'false') {
      type = 'BOOLEAN';
    } else if (value === 'null') {
      type = 'NULL';
    } else if (value === 'else') {
      type = 'ELSE';
    } else if (value === 'as') {
      type = 'AS';
    }

    this.tokens.push({
      type,
      value,
      loc: { start, end: this.getPosition() },
    });
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.peek())) {
      this.advance();
    }
  }

  private match(str: string): boolean {
    return this.source.slice(this.pos, this.pos + str.length) === str;
  }

  private consume(str: string): void {
    for (let i = 0; i < str.length; i++) {
      this.advance();
    }
  }

  private peek(): string {
    return this.source[this.pos] ?? '';
  }

  private peekNext(): string {
    return this.source[this.pos + 1] ?? '';
  }

  private advance(): string {
    const char = this.source[this.pos++];
    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return char;
  }

  private getPosition(): Position {
    return { line: this.line, column: this.column };
  }

  private createToken(type: TokenType, value: string, start?: Position): Token {
    const startPos = start ?? this.getPosition();
    return {
      type,
      value,
      loc: { start: startPos, end: this.getPosition() },
    };
  }
}

// ============================================================================
// Parser
// ============================================================================

class Parser {
  private tokens: Token[];
  private pos: number = 0;
  private source: string;

  constructor(tokens: Token[], source: string) {
    this.tokens = tokens;
    this.source = source;
  }

  parse(): ProgramNode {
    const body = this.parseProgram();
    return {
      type: 'Program',
      body,
    };
  }

  private parseProgram(endBlock?: string): ASTNode[] {
    const body: ASTNode[] = [];

    while (!this.isAtEnd()) {
      const token = this.current();

      // Check for end block
      if (token.type === 'OPEN_END_BLOCK') {
        if (endBlock) {
          break;
        }
        // Unexpected close block
        this.advance(); // consume {{/
        const name = this.expect('ID').value;
        throw new UnexpectedCloseBlockError(name, {
          location: token.loc,
          source: this.source,
        });
      }

      // Check for else
      if (token.type === 'OPEN') {
        const nextIdx = this.pos + 1;
        if (this.tokens[nextIdx]?.type === 'ELSE') {
          if (endBlock) {
            break;
          }
        }
      }

      const node = this.parseStatement();
      if (node) {
        body.push(node);
      }
    }

    return body;
  }

  private parseStatement(): ASTNode | null {
    const token = this.current();

    switch (token.type) {
      case 'TEXT':
        return this.parseText();
      case 'OPEN':
        return this.parseExpressionNode();
      case 'OPEN_RAW':
        return this.parseRawExpressionNode();
      case 'OPEN_BLOCK':
        return this.parseBlock();
      case 'OPEN_PARTIAL':
        return this.parsePartial();
      case 'OPEN_COMMENT':
        return this.parseComment();
      case 'EOF':
        return null;
      default:
        throw new TemplateSyntaxError(`Unexpected token: ${token.type}`, {
          location: token.loc,
          source: this.source,
        });
    }
  }

  private parseText(): TextNode {
    const token = this.advance();
    return {
      type: 'TextNode',
      value: token.value,
      loc: token.loc,
    };
  }

  private parseExpressionNode(): ExpressionNode {
    const start = this.advance(); // consume {{

    // Check for else
    if (this.current().type === 'ELSE') {
      this.advance();
      this.expect('CLOSE');
      // This is handled by block parser
      throw new TemplateSyntaxError(`Unexpected {{else}}`, {
        location: start.loc,
        source: this.source,
      });
    }

    const { path, params, hash, filters } = this.parseExpression();
    this.expect('CLOSE');

    return {
      type: 'ExpressionNode',
      path,
      params,
      hash,
      filters,
      loc: { start: start.loc.start, end: this.previous().loc.end },
    };
  }

  private parseRawExpressionNode(): RawExpressionNode {
    const start = this.advance(); // consume {{{
    const { path, params, hash, filters } = this.parseExpression();
    this.expect('CLOSE_RAW');

    return {
      type: 'RawExpressionNode',
      path,
      params,
      hash,
      filters,
      loc: { start: start.loc.start, end: this.previous().loc.end },
    };
  }

  private parseBlock(): BlockNode {
    const start = this.advance(); // consume {{#
    const pathToken = this.current();
    const { path, params, hash } = this.parseExpression();

    // Check for block params: {{#each items as |item index|}}
    // TODO: Implement block params

    this.expect('CLOSE');

    // Parse program
    const program: ProgramNode = {
      type: 'Program',
      body: this.parseProgram(path.original),
    };

    // Check for else
    let inverse: ProgramNode | undefined;
    if (this.current().type === 'OPEN' && this.tokens[this.pos + 1]?.type === 'ELSE') {
      this.advance(); // {{
      this.advance(); // else
      this.expect('CLOSE');

      inverse = {
        type: 'Program',
        body: this.parseProgram(path.original),
      };
    }

    // Expect close block
    if (this.current().type !== 'OPEN_END_BLOCK') {
      throw new UnclosedBlockError(path.original, {
        location: pathToken.loc,
        source: this.source,
      });
    }

    this.advance(); // {{/
    const closeId = this.expect('ID');

    if (closeId.value !== path.original) {
      throw new MismatchedBlockError(path.original, closeId.value, {
        location: closeId.loc,
        source: this.source,
      });
    }

    this.expect('CLOSE');

    return {
      type: 'BlockNode',
      path,
      params,
      hash,
      program,
      inverse,
      loc: { start: start.loc.start, end: this.previous().loc.end },
    };
  }

  private parsePartial(): PartialNode {
    const start = this.advance(); // consume {{>
    const nameToken = this.expect('ID');
    const hash = this.parseHash();
    this.expect('CLOSE');

    return {
      type: 'PartialNode',
      name: nameToken.value,
      hash,
      loc: { start: start.loc.start, end: this.previous().loc.end },
    };
  }

  private parseComment(): CommentNode {
    const token = this.advance();
    return {
      type: 'CommentNode',
      value: token.value,
      loc: token.loc,
    };
  }

  private parseExpression(): {
    path: PathExpression;
    params: Expression[];
    hash: HashPair[];
    filters: FilterExpression[];
  } {
    const path = this.parsePath();
    const params: Expression[] = [];
    const hash: HashPair[] = [];
    const filters: FilterExpression[] = [];

    // Parse params and hash
    while (!this.isCloseDelimiter() && !this.check('PIPE')) {
      if (this.check('ID') && this.tokens[this.pos + 1]?.type === 'EQUALS') {
        // Hash pair
        const key = this.advance().value;
        this.advance(); // =
        const value = this.parseParam();
        hash.push({ key, value });
      } else {
        // Positional param
        params.push(this.parseParam());
      }
    }

    // Parse filters
    while (this.check('PIPE')) {
      this.advance(); // consume |
      const filterName = this.expect('ID').value;
      const filterParams: Expression[] = [];

      while (!this.isCloseDelimiter() && !this.check('PIPE')) {
        if (this.check('ID') && this.tokens[this.pos + 1]?.type === 'EQUALS') {
          break; // Hash param, stop filter params
        }
        filterParams.push(this.parseParam());
      }

      filters.push({ name: filterName, params: filterParams });
    }

    return { path, params, hash, filters };
  }

  private parsePath(): PathExpression {
    let depth = 0;
    let data = false;
    const parts: string[] = [];
    const start = this.current().loc.start;

    // Check for @data
    if (this.check('AT')) {
      this.advance();
      data = true;
    }

    // Check for parent access ../
    while (this.check('DOTDOT')) {
      this.advance();
      if (this.check('SLASH')) {
        this.advance();
      }
      depth++;
    }

    // Parse first part
    if (this.check('ID')) {
      parts.push(this.advance().value);
    } else if (this.check('DOT')) {
      // Just "." means current context
      this.advance();
      parts.push('');
    }

    // Parse rest of path
    while (this.check('DOT') || this.check('SLASH')) {
      this.advance();

      if (this.check('ID')) {
        parts.push(this.advance().value);
      } else if (this.check('OPEN_BRACKET')) {
        // Array access: items.[0]
        this.advance();
        if (this.check('NUMBER')) {
          parts.push(this.advance().value);
        } else if (this.check('ID')) {
          parts.push(this.advance().value);
        } else if (this.check('STRING')) {
          parts.push(this.advance().value);
        }
        this.expect('CLOSE_BRACKET');
      }
    }

    const original = parts.join('.');

    return {
      type: 'PathExpression',
      original: data ? '@' + original : original,
      parts,
      depth,
      data,
    };
  }

  private parseParam(): Expression {
    const token = this.current();

    if (token.type === 'STRING') {
      this.advance();
      return {
        type: 'StringLiteral',
        value: token.value,
        original: `"${token.value}"`,
      };
    }

    if (token.type === 'NUMBER') {
      this.advance();
      return {
        type: 'NumberLiteral',
        value: parseFloat(token.value),
        original: token.value,
      };
    }

    if (token.type === 'BOOLEAN') {
      this.advance();
      return {
        type: 'BooleanLiteral',
        value: token.value === 'true',
      };
    }

    if (token.type === 'NULL') {
      this.advance();
      return {
        type: 'NullLiteral',
        value: null,
      };
    }

    if (token.type === 'OPEN_PAREN') {
      return this.parseSubExpression();
    }

    // Path expression
    return this.parsePath();
  }

  private parseSubExpression(): SubExpression {
    this.expect('OPEN_PAREN');
    const { path, params, hash, filters } = this.parseExpression();
    this.expect('CLOSE_PAREN');

    return {
      type: 'SubExpression',
      path,
      params,
      hash,
      filters: filters.length > 0 ? filters : undefined,
    };
  }

  private parseHash(): HashPair[] {
    const hash: HashPair[] = [];

    while (this.check('ID') && this.tokens[this.pos + 1]?.type === 'EQUALS') {
      const key = this.advance().value;
      this.advance(); // =
      const value = this.parseParam();
      hash.push({ key, value });
    }

    return hash;
  }

  private isCloseDelimiter(): boolean {
    const type = this.current().type;
    // Also check for CLOSE_PAREN to properly handle sub-expressions like (eq a b)
    return type === 'CLOSE' || type === 'CLOSE_RAW' || type === 'CLOSE_PAREN' || type === 'EOF';
  }

  private check(type: TokenType): boolean {
    return this.current().type === type;
  }

  private current(): Token {
    return this.tokens[this.pos];
  }

  private previous(): Token {
    return this.tokens[this.pos - 1];
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.pos++;
    }
    return this.previous();
  }

  private expect(type: TokenType): Token {
    if (this.check(type)) {
      return this.advance();
    }
    throw new TemplateSyntaxError(`Expected ${type}`, {
      location: this.current().loc,
      source: this.source,
      expected: type,
      found: this.current().type,
    });
  }

  private isAtEnd(): boolean {
    return this.current().type === 'EOF';
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Parse a template string into an AST
 */
export function parse(template: string, options?: TemplateOptions): ProgramNode {
  const tokenizer = new Tokenizer(template, options);
  const tokens = tokenizer.tokenize();
  const parser = new Parser(tokens, template);
  return parser.parse();
}

/**
 * Validate template syntax
 */
export function validate(template: string, options?: TemplateOptions): {
  valid: boolean;
  errors: Array<{ message: string; line?: number; column?: number }>;
} {
  try {
    parse(template, options);
    return { valid: true, errors: [] };
  } catch (error) {
    if (error instanceof TemplateSyntaxError) {
      return {
        valid: false,
        errors: [{
          message: error.message,
          line: error.line,
          column: error.column,
        }],
      };
    }
    return {
      valid: false,
      errors: [{ message: error instanceof Error ? error.message : String(error) }],
    };
  }
}

/**
 * Check if a string contains template expressions
 */
export function hasTemplateExpressions(
  str: string,
  options?: TemplateOptions
): boolean {
  const open = options?.delimiters?.[0] ?? '{{';
  const close = options?.delimiters?.[1] ?? '}}';
  return str.includes(open) && str.includes(close);
}

/**
 * Extract variable names used in a template
 */
export function extractVariables(
  template: string,
  options?: TemplateOptions
): string[] {
  const ast = parse(template, options);
  const variables = new Set<string>();

  function visit(node: ASTNode): void {
    if (node.type === 'ExpressionNode' || node.type === 'RawExpressionNode') {
      const expr = node as ExpressionNode;
      if (!expr.path.data && expr.path.parts.length > 0) {
        variables.add(expr.path.parts[0]);
      }
    } else if (node.type === 'BlockNode') {
      const block = node as BlockNode;
      block.program.body.forEach(visit);
      block.inverse?.body.forEach(visit);
    } else if (node.type === 'Program') {
      (node as ProgramNode).body.forEach(visit);
    }
  }

  visit(ast);
  return Array.from(variables);
}
