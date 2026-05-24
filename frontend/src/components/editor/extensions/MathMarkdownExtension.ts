/* eslint-disable @typescript-eslint/no-explicit-any */
import { Extension } from "@tiptap/core";
import { InlineMathNode } from "@aarkue/tiptap-math-extension";

// Regexes for dollar and bracket delimiters
const inlineDollarRegex = /^\$(?![$\s,.])((?:[^$\\]|\\\$|\\)+?)\$/;
const blockDollarRegex = /^\$\$\s*([\s\S]*?)\s*\$\$/;

const blockBracketRegexes = [
  /^\\\\+\[([\s\S]*?)\\\\+\]/, // Double/multi-escaped
  /^\\\[([\s\S]*?)\\\]/,        // Single escaped
  /^\[\s*\n([\s\S]*?)\n\s*\]/,  // Raw brackets on newlines
];

const inlineBracketRegexes = [
  /^\\\\+\(([\s\S]*?)\\\\+\)/, // Double/multi-escaped
  /^\\\(([\s\S]*?)\\\)/,        // Single escaped
  /^\((([a-zA-Z])_([a-zA-Z0-9]+))\)/, // Parenthesized subscripts (a_i)
];

function matchRegexes(src: string, regexes: RegExp[]): { raw: string; text: string } | null {
  for (const regex of regexes) {
    const match = src.match(regex);
    if (match) {
      return {
        raw: match[0],
        text: match[1],
      };
    }
  }
  return null;
}

function cleanLatex(latex: string): string {
  if (!latex) return "";
  // Fix single backslashes at the end of lines inside the equation
  let cleaned = latex.replace(/\\(?:\s*\n)/g, "\\\\\n");
  cleaned = cleaned.replace(/\\{3,}(?:\s*\n)/g, "\\\\\n");
  return cleaned.trim();
}

// Extended InlineMathNode with markdown parsing/rendering support
export const ExtendedInlineMathNode = InlineMathNode.extend({
  // Tell Tiptap Markdown what tokens represent this node
  markdownTokenName: "inlineMath",

  parseMarkdown: (token: any, helpers: any) => {
    return helpers.createNode("inlineMath", {
      latex: cleanLatex(token.text),
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
      const match = src.match(/(?:\$|\\+\(|\\+\[|\[\s*\n|\((?:[a-zA-Z])_(?:[a-zA-Z0-9]+)\))/);
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
      const blockBracketMatch = matchRegexes(src, blockBracketRegexes);
      if (blockBracketMatch) {
        return {
          type: "inlineMath",
          raw: blockBracketMatch.raw,
          text: blockBracketMatch.text,
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
      const inlineBracketMatch = matchRegexes(src, inlineBracketRegexes);
      if (inlineBracketMatch) {
        return {
          type: "inlineMath",
          raw: inlineBracketMatch.raw,
          text: inlineBracketMatch.text,
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
      latex: cleanLatex(token.text),
      display: "yes",
      evaluate: "no",
    });
  },

  markdownTokenizer: {
    name: "inlineMathBlock",
    level: "block",
    start(src: string) {
      const match = src.match(/(?:\$|\\+\[|\[\s*\n)/);
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
      const blockBracketMatch = matchRegexes(src, blockBracketRegexes);
      if (blockBracketMatch) {
        return {
          type: "inlineMathBlock",
          raw: blockBracketMatch.raw,
          text: blockBracketMatch.text,
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

export function preprocessMath(content: string): string {
  if (!content) return "";

  let processed = content;

  // 1. Replace explicit escaped block math: \[ ... \] or \\[ ... \\] etc.
  processed = processed.replace(/\\+\[([\s\S]*?)\\+\]/g, (_, equation) => {
    return formatBlockMath(equation);
  });

  // 2. Replace brackets on separate lines:
  // [
  // ...
  // ]
  processed = processed.replace(/(?:^|\n)\[\s*\n([\s\S]*?)\n\s*\](?:\n|$)/g, (_, equation) => {
    return formatBlockMath(equation);
  });

  // 3. Replace explicit escaped inline math: \( ... \) or \\( ... \\) etc.
  processed = processed.replace(/\\+\(([\s\S]*?)\\+\)/g, (_, equation) => {
    return `$${equation.trim()}$`;
  });

  // 4. Convert inline math variables in parentheses like (a_i), (b_i), (c_i), (d_i), (x_n)
  processed = processed.replace(/\((([a-zA-Z])_([a-zA-Z0-9]+))\)/g, (_, equation) => {
    return `$${equation}$`;
  });

  return processed;
}

export function formatBlockMath(equation: string): string {
  // Fix single backslashes at the end of lines inside the equation
  let cleaned = equation.replace(/\\(?:\s*\n)/g, "\\\\\n");
  cleaned = cleaned.replace(/\\{3,}(?:\s*\n)/g, "\\\\\n");
  return `\n\n$$\n${cleaned.trim()}\n$$\n\n`;
}
