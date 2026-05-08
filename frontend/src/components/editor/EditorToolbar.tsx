"use client";

import { Editor } from "@tiptap/react";
import type { ReactNode } from "react";
import { 
  Bold, Italic, List, ListOrdered, 
  Heading1, Heading2, Quote, Code, 
  Table as TableIcon,
  Underline as UnderlineIcon, AlignLeft,
  AlignCenter, AlignRight, Image as ImageIcon,
  MessageSquareQuote, Network
} from "lucide-react";

interface Props {
  editor: Editor | null;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  children: ReactNode;
  title: string;
}

export default function EditorToolbar({ editor }: Props) {
  if (!editor) return null;

  const Button = ({ onClick, isActive, children, title }: ToolbarButtonProps) => (
    <button
      onClick={onClick}
      title={title}
      className={`p-2 rounded-xl transition-all duration-200 active:scale-90 flex items-center justify-center ${
        isActive 
          ? "bg-[var(--accent)] text-[var(--bg-950)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)]" 
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5 p-2 bg-white/[0.02] border border-white/5 rounded-2xl backdrop-blur-md sticky top-4 z-30 transition-all hover:bg-white/[0.04]">
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
            // @ts-ignore - custom callout node
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
          title="Insert Table"
        >
          <TableIcon size={16} />
        </Button>
        <Button 
          onClick={() => {
            const url = window.prompt('URL');
            if (url) {
              // @ts-ignore - image extension might not be explicitly typed if custom
              editor.chain().focus().setImage({ src: url }).run();
            }
          }}
          title="Insert Image"
        >
          <ImageIcon size={16} />
        </Button>
        <Button 
          onClick={() => {
            // Logic to insert a graph placeholder or specific graph block
            editor.chain().focus().insertContent('[[graph]]').run()
          }}
          title="Insert Knowledge Graph"
        >
          <Network size={16} />
        </Button>
      </div>
    </div>
  );
}
