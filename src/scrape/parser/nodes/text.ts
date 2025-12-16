import he from 'he';
import Node from './node.js';
import NodeType from './type.js';

/**
 * TextNode to contain a text element in DOM tree.
 * @param {string} value [description]
 */
export default class TextNode extends Node {
  public nodeType = NodeType.TEXT_NODE;
  public rawTagName = '#text';

  constructor(public rawText: string, parentNode = null as any, range?: [number, number]) {
    super(parentNode, range);
  }

  public clone(): Node {
      return new TextNode(this.rawText, null, this.range ? [...this.range] : undefined);
  }

  /**
   * Node Type declaration.
   * @type {Number}
   */

  /**
   * Get unescaped text value of current node and its children.
   * @return {string} text content
   */
  public get text() {
    return he.decode(this.rawText);
  }

  public get trimmedText() {
    return this.text.trim();
  }

  public get trimmedRawText() {
    return this.rawText.trim();
  }

  /**
   * Detect if the node contains only white space.
   * @return {boolean}
   */
  public get isWhitespace() {
    return /^(\s|&nbsp;)*$/.test(this.rawText);
  }

  public toString() {
    return this.rawText;
  }
}