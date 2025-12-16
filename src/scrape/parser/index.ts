import CommentNode from './nodes/comment.js';
import HTMLElement, { Options } from './nodes/html.js';
import Node from './nodes/node.js';
import TextNode from './nodes/text.js';
import NodeType from './nodes/type.js';
import baseParse from './parse.js';
import valid from './valid.js';

export type { Options } from './nodes/html.js';
export { HTMLElement, CommentNode, valid, Node, TextNode, NodeType };

export function parse(data: string, options = {} as Partial<Options>) {
  return baseParse(data, options);
}

export default parse;

parse.parse = baseParse;
parse.HTMLElement = HTMLElement;
parse.CommentNode = CommentNode;
parse.valid = valid;
parse.Node = Node;
parse.TextNode = TextNode;
parse.NodeType = NodeType;
