import he from 'he';
import NodeType from './type.js';
import type HTMLElement from './html.js';

/**
 * Node Class as base class for TextNode and HTMLElement.
 */
export default abstract class Node {
  abstract rawTagName: string;
  abstract nodeType: NodeType;
  public childNodes = [] as Node[];
  public range: readonly [number, number] = [-1, -1]; // Fixed: Initialized
  abstract text: string;
  abstract rawText: string;
  // abstract get rawText(): string;
  abstract toString(): string;
  abstract clone(): Node;
  public constructor(
    public parentNode = null as HTMLElement | null,
    range?: [number, number]
  ) {
    if (range) {
        this.range = range;
    }
  }
  /**
   * Remove current node
   */
  public remove() {
    if (this.parentNode) {
      if (typeof this.parentNode.invalidateSelectorCacheRecursively === 'function') {
        this.parentNode.invalidateSelectorCacheRecursively();
      }
      const children = this.parentNode.childNodes;
      this.parentNode.childNodes = children.filter((child) => {
        return this !== child;
      });
      this.parentNode = null;
    }
    return this;
  }

  public invalidateSelectorCacheRecursively(): void {
    // Default no-op for non-HTMLElement nodes.
  }
  public get innerText() {
    return this.rawText;
  }
  public get textContent() {
    return he.decode(this.rawText);
  }
  public set textContent(val: string) {
    this.rawText = he.encode(val);
  }
}
