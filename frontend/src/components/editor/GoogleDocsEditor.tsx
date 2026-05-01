"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Link } from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { useEffect, useMemo } from "react";
import SlashCommand from "./extensions/SlashCommand";
import suggestion from "./extensions/suggestions";
import Wikilink from "./extensions/Wikilink";
import getWikilinkSuggestion from "./extensions/WikilinkSuggestion";

interface Props {
  initialText: string;
  onChange: (content: string) => void;
  teamId: string;
}

export function GoogleDocsEditor({ initialText, onChange, teamId }: Props) {
  const extensions = useMemo(() => [
    StarterKit,
    Placeholder.configure({
      placeholder: "Write your knowledge here... Type '/' for commands, '[[' for links.",
    }),
    Link.configure({ openOnClick: false }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    SlashCommand.configure({ suggestion }),
    Wikilink.configure({ suggestion: getWikilinkSuggestion(teamId) }),
  ], [teamId]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: initialText,
    editorProps: {
      attributes: {
        class: "prose prose-invert max-w-none focus:outline-none min-h-[500px]",
      },
    },
    onUpdate: ({ editor }) => {
      // Simplistic raw text for now; later we implement full Markdown serialization
      // TipTap natively supports HTML output easily, or we can use tiptap-markdown
      onChange(editor.getText()); 
    },
  });

  useEffect(() => {
    if (editor && initialText !== editor.getText()) {
      // In a real implementation we would parse markdown to tiptap json
      // but for Phase 1 MVP we are just setting it
      editor.commands.setContent(initialText);
    }
  }, [initialText, editor]);

  if (!editor) return null;

  return (
    <div className="w-full">
      <EditorContent editor={editor} />
    </div>
  );
}
