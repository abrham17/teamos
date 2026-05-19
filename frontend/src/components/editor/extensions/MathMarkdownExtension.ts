/* eslint-disable @typescript-eslint/no-explicit-any */
import { Extension } from "@tiptap/core";
import { InlineMathNode } from "@aarkue/tiptap-math-extension";

// Regexes for dollar and bracket delimiters
const inlineDollarRegex = /^\$(?![$\s,.])((?:[^$\\]|\\\$|\\)+?)\$/;
const inlineBracketRegex = /^\\\(([\s\S]*?)\\\)/;
const blockDollarRegex = /^\$\$(?!\s)([\s\S]*?)\$\$/;
const blockBracketRegex = /^\\\[([\s\S]*?)\\\]/;

// Extended InlineMathNode with markdown parsing/rendering support
export const ExtendedInlineMathNode = InlineMathNode.extend({
  // Tell Tiptap Markdown what tokens represent this node
  markdownTokenName: "inlineMath",

  parseMarkdown: (token: any, helpers: any) => {
    return helpers.createNode("inlineMath", {
      latex: token.text,
      display: token.display || "no",
      evaluate: "no",
    });
  },

  renderMarkdown: (node: any) => {
    const isBlock = node.attrs.display === "yes";
    const latex = node.attrs.latex || "";
    return isBlock ? `$$\n${latex}\n$$` : `$${latex}$`;
  },

  // Add the markdown tokenizer for inline math directly here
  markdownTokenizer: {
    name: "inlineMath",
    level: "inline",
    start(src: string) {
      const match = src.match(/(?:\$|\\\()/);
      return match ? match.index : -1;
    },
    tokenize(src: string) {
      // 1. Check block dollar first since $$ starts with $
      const blockDollarMatch = src.match(blockDollarRegex);
      if (blockDollarMatch) {
        return {
          type: "inlineMath",
          raw: blockDollarMatch[0],
          text: blockDollarMatch[1],
          display: "yes",
        };
      }
      // 2. Check block bracket
      const blockBracketMatch = src.match(blockBracketRegex);
      if (blockBracketMatch) {
        return {
          type: "inlineMath",
          raw: blockBracketMatch[0],
          text: blockBracketMatch[1],
          display: "yes",
        };
      }
      // 3. Check inline dollar
      const inlineDollarMatch = src.match(inlineDollarRegex);
      if (inlineDollarMatch) {
        const content = inlineDollarMatch[1];
        const lastChar = content[content.length - 1];
        if (!['\\', ' ', '\t', '\n', '\r', '(', '"'].includes(lastChar)) {
          return {
            type: "inlineMath",
            raw: inlineDollarMatch[0],
            text: content,
            display: "no",
          };
        }
      }
      // 4. Check inline bracket
      const inlineBracketMatch = src.match(inlineBracketRegex);
      if (inlineBracketMatch) {
        return {
          type: "inlineMath",
          raw: inlineBracketMatch[0],
          text: inlineBracketMatch[1],
          display: "no",
        };
      }
      return undefined;
    },
  },
} as any);

// A companion block-level markdown tokenizer extension to support blocks outside paragraphs
export const BlockMathMarkdownExtension = Extension.create({
  name: "inlineMathBlock",

  parseMarkdown: (token: any, helpers: any) => {
    return helpers.createNode("inlineMath", {
      latex: token.text,
      display: "yes",
      evaluate: "no",
    });
  },

  markdownTokenizer: {
    name: "inlineMathBlock",
    level: "block",
    start(src: string) {
      const match = src.match(/(?:\$|\\\[)/);
      return match ? match.index : -1;
    },
    tokenize(src: string) {
      const blockDollarMatch = src.match(blockDollarRegex);
      if (blockDollarMatch) {
        return {
          type: "inlineMathBlock",
          raw: blockDollarMatch[0],
          text: blockDollarMatch[1],
          display: "yes",
        };
      }
      const blockBracketMatch = src.match(blockBracketRegex);
      if (blockBracketMatch) {
        return {
          type: "inlineMathBlock",
          raw: blockBracketMatch[0],
          text: blockBracketMatch[1],
          display: "yes",
        };
      }
      return undefined;
    },
  },
} as any);

// Custom MathExtension combining both
export const CustomMathExtension = Extension.create({
  name: "customMathExtension",

  addOptions() {
    return {
      evaluation: false,
    };
  },

  addExtensions() {
    return [
      ExtendedInlineMathNode.configure(this.options),
      BlockMathMarkdownExtension,
    ];
  },
});

export default CustomMathExtension;
