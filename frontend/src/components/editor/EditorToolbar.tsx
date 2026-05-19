"use client";

import { Editor } from "@tiptap/react";
import type { ReactNode } from "react";
import {
  Bold, Italic, List, ListOrdered,
  Heading1, Heading2, Quote, Code,
  Table as TableIcon,
  Underline as UnderlineIcon, AlignLeft,
  AlignCenter, AlignRight, Image as ImageIcon,
  MessageSquareQuote, Printer
} from "lucide-react";

import { useState } from "react";
import { ImageUploadModal } from "./ImageUploadModal";

interface Props {
  editor: Editor | null;
  teamId: string;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  children: ReactNode;
  title: string;
}

export default function EditorToolbar({ editor, teamId }: Props) {
  const [showImageModal, setShowImageModal] = useState(false);
  if (!editor) return null;

  const Button = ({ onClick, isActive, children, title }: ToolbarButtonProps) => (
    <button
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      className={`p-1.5 rounded-lg transition-all duration-150 active:scale-95 flex items-center justify-center ${
        isActive
          ? "bg-[var(--accent)] text-white shadow-[var(--shadow-glow)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-600)]"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 bg-[var(--bg-800)] border border-[var(--border-subtle)] rounded-xl sticky top-4 z-30 shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-1 px-1">
        <Button
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          title="Bold (Ctrl+B)"
        >
          <Bold size={16} />
        </Button>
        <Button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          title="Italic (Ctrl+I)"
        >
          <Italic size={16} />
        </Button>
        <Button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive("underline")}
          title="Underline (Ctrl+U)"
        >
          <UnderlineIcon size={16} />
        </Button>
      </div>

      <div className="w-px h-6 bg-white/10 mx-1" />

      <div className="flex items-center gap-1 px-1">
        <Button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive("heading", { level: 1 })}
          title="Heading 1"
        >
          <Heading1 size={16} />
        </Button>
        <Button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive("heading", { level: 2 })}
          title="Heading 2"
        >
          <Heading2 size={16} />
        </Button>
      </div>

      <div className="w-px h-6 bg-white/10 mx-1" />

      <div className="flex items-center gap-1 px-1">
        <Button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          title="Bullet List"
        >
          <List size={16} />
        </Button>
        <Button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          title="Ordered List"
        >
          <ListOrdered size={16} />
        </Button>
      </div>

      <div className="w-px h-6 bg-white/10 mx-1" />

      <div className="flex items-center gap-1 px-1">
        <Button
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          isActive={editor.isActive({ textAlign: 'left' })}
          title="Align Left"
        >
          <AlignLeft size={16} />
        </Button>
        <Button
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          isActive={editor.isActive({ textAlign: 'center' })}
          title="Align Center"
        >
          <AlignCenter size={16} />
        </Button>
        <Button
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          isActive={editor.isActive({ textAlign: 'right' })}
          title="Align Right"
        >
          <AlignRight size={16} />
        </Button>
      </div>

      <div className="w-px h-6 bg-white/10 mx-1" />

      <div className="flex items-center gap-1 px-1">
        <Button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive("blockquote")}
          title="Blockquote"
        >
          <Quote size={16} />
        </Button>
        <Button
          onClick={() => {
            editor.chain().focus().insertContent({ type: 'callout', attrs: { type: 'note' }, content: [{ type: 'paragraph' }] }).run()
          }}
          isActive={editor.isActive("callout")}
          title="Add Note (Obsidian Style)"
        >
          <MessageSquareQuote size={16} />
        </Button>
        <Button
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive("codeBlock")}
          title="Code Block"
        >
          <Code size={16} />
        </Button>
      </div>

      <div className="w-px h-6 bg-white/10 mx-1" />

      <div className="flex items-center gap-1 px-1">
        <Button
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          isActive={editor.isActive("table")}
          title="Insert Table"
        >
          <TableIcon size={16} />
        </Button>
        <Button
          onClick={() => setShowImageModal(true)}
          isActive={editor.isActive("image") || showImageModal}
          title="Insert Image"
        >
          <ImageIcon size={16} />
        </Button>
      </div>

      <div className="w-px h-6 bg-white/10 mx-1" />

      <div className="flex items-center gap-1 px-1">
        <Button
          onClick={() => window.print()}
          title="Export to PDF"
        >
          <Printer size={16} />
        </Button>
      </div>

      <ImageUploadModal
        open={showImageModal}
        onClose={() => setShowImageModal(false)}
        teamId={teamId}
        onUpload={(url) => {
          editor.chain().focus().setImage({ src: url }).run();
        }}
      />
    </div>
  );
}
