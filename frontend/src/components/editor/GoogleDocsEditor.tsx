"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Underline } from "@tiptap/extension-underline";
import { TextAlign } from "@tiptap/extension-text-align";
import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import { BulletList } from "@tiptap/extension-bullet-list";
import { OrderedList } from "@tiptap/extension-ordered-list";
import { ListItem } from "@tiptap/extension-list-item";
import { Blockquote } from "@tiptap/extension-blockquote";
import { Markdown } from "@tiptap/markdown";
import { Link } from "@tiptap/extension-link";
import Collaboration from "@tiptap/extension-collaboration";
import { useEffect, useImperativeHandle, useMemo, forwardRef } from "react";

import SlashCommand from "./extensions/SlashCommand";
import suggestion from "./extensions/suggestions";
import Wikilink from "./extensions/Wikilink";
import getWikilinkSuggestion from "./extensions/WikilinkSuggestion";
import { Callout } from "./extensions/Callout";
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

function setEditorMarkdownContent(editor: NonNullable<ReturnType<typeof useEditor>>, markdown: string) {
  let value = markdown || "";

  // Pre-process [[Wikilinks]] if they are raw in markdown
  // This helps TipTap's Wikilink extension recognize them on load
  value = value.replace(/\[\[([^\]]+)\]\]/g, (match, title) => {
    return `<span data-wikilink data-title="${title}" class="wikilink">[[${title}]]</span>`;
  });

  editor.commands.setContent(value, {
    emitUpdate: false,
    parseOptions: { preserveWhitespace: "full" },
  });
}

export const GoogleDocsEditor = forwardRef<GoogleDocsEditorHandle, Props>(function GoogleDocsEditor(
  { initialText, onChange, teamId, ydoc, provider },
  ref,
) {
  const extensions = useMemo(() => {
    const base = [
      StarterKit.configure({
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
      }),
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Highlight,
      BulletList,
      OrderedList,
      ListItem,
      Blockquote,
      Image,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Markdown.configure({
        // Default options are fine
      }),
      Link.configure({
        autolink: true,
        openOnClick: false,
        HTMLAttributes: {
          class: "text-[var(--accent)] underline cursor-pointer",
        },
      }),
      SlashCommand.configure({ suggestion }),
      Wikilink.configure({
        suggestion: getWikilinkSuggestion(teamId),
      }),
      Callout,
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
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-invert max-w-none focus:outline-none min-h-[500px] pb-32 tiptap",
      },
    },
    onCreate: ({ editor }) => {
      if (!ydoc) {
        setEditorMarkdownContent(editor, initialText);
      }
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
    if (editor && !ydoc) {
      const current = ((editor.storage as unknown) as MarkdownStorage).markdown?.getMarkdown?.() || "";
      if (initialText !== current) {
        setEditorMarkdownContent(editor, initialText);
      }
    }
  }, [initialText, editor, ydoc]);

  if (!editor) return null;

  return (
    <div className="w-full bg-transparent">
      <EditorToolbar editor={editor} teamId={teamId} />
      <div className="mt-8">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});
