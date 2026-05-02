"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Link } from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Underline } from "@tiptap/extension-underline";
import { TextAlign } from "@tiptap/extension-text-align";
import { Highlight } from "@tiptap/extension-highlight";
import { Markdown } from "@tiptap/markdown";
import Collaboration from "@tiptap/extension-collaboration";
import { useEffect, useImperativeHandle, useMemo, forwardRef } from "react";

import SlashCommand from "./extensions/SlashCommand";
import suggestion from "./extensions/suggestions";
import Wikilink from "./extensions/Wikilink";
import getWikilinkSuggestion from "./extensions/WikilinkSuggestion";
import EditorToolbar from "./EditorToolbar";

export type GoogleDocsEditorHandle = {
  /** Latest markdown from the editor (TipTap storage), even if React state is stale. */
  getMarkdown: () => string;
};

interface Props {
  initialText: string;
  onChange: (content: string) => void;
  teamId: string;
  ydoc?: unknown;
  provider?: unknown;
}

type MarkdownStorage = {
  markdown?: {
    getMarkdown: () => string;
  };
};

export const GoogleDocsEditor = forwardRef<GoogleDocsEditorHandle, Props>(function GoogleDocsEditor(
  { initialText, onChange, teamId, ydoc, provider },
  ref,
) {
  const extensions = useMemo(() => {
    const base = [
      StarterKit.configure({}),
      Markdown.configure({}),
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Highlight,
      Placeholder.configure({
        placeholder: "Write your knowledge here... Type '/' for commands, '[[' for links.",
      }),
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      SlashCommand.configure({ suggestion }),
      Wikilink.configure({
        suggestion: getWikilinkSuggestion(teamId),
      }),
    ];

    if (ydoc && provider) {
      base.push(
        Collaboration.configure({
          document: ydoc,
        }),
      );
    }

    return base;
  }, [teamId, ydoc, provider]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: initialText,
    editorProps: {
      attributes: {
        class: "prose prose-invert max-w-none focus:outline-none min-h-[500px] p-4",
      },
    },
    onUpdate: ({ editor }) => {
      const markdown = ((editor.storage as unknown) as MarkdownStorage).markdown?.getMarkdown?.() || "";
      onChange(markdown);
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => {
        if (!editor) return "";
        return ((editor.storage as unknown) as MarkdownStorage).markdown?.getMarkdown?.() || "";
      },
    }),
    [editor],
  );

  useEffect(() => {
    if (editor && initialText && !ydoc) {
      const current = ((editor.storage as unknown) as MarkdownStorage).markdown?.getMarkdown?.() || "";
      if (initialText !== current) {
        editor.commands.setContent(initialText);
      }
    }
  }, [initialText, editor, ydoc]);

  if (!editor) return null;

  return (
    <div className="w-full border border-white/10 rounded-xl overflow-hidden bg-white/5 backdrop-blur-md">
      <EditorToolbar editor={editor} />
      <div className="max-h-[70vh] overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});
