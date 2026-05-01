"use client";

import { Editor } from "@tiptap/react";
import type { ReactNode } from "react";
import { 
  Bold, Italic, List, ListOrdered, 
  Heading1, Heading2, Quote, Code, 
  Table as TableIcon,
  Underline as UnderlineIcon, AlignLeft,
  AlignCenter, AlignRight
} from "lucide-react";

interface Props {
  editor: Editor | null;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  children: ReactNode;
  title?: string;
}

export default function EditorToolbar({ editor }: Props) {
  if (!editor) return null;

  const Button = ({ onClick, isActive, children, title }: ToolbarButtonProps) => (
    <button
      onClick={onClick}
      title={title}
      className={`p-2 rounded hover:bg-white/10 transition-colors ${
        isActive ? "text-blue-400 bg-white/5" : "text-gray-400"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 mb-2 border-b border-white/10 bg-black/20 backdrop-blur-sm sticky top-0 z-10">
      <Button 
        onClick={() => editor.chain().focus().toggleBold().run()} 
        isActive={editor.isActive("bold")}
        title="Bold"
      >
        <Bold size={18} />
      </Button>
      <Button 
        onClick={() => editor.chain().focus().toggleItalic().run()} 
        isActive={editor.isActive("italic")}
        title="Italic"
      >
        <Italic size={18} />
      </Button>
      <Button 
        onClick={() => editor.chain().focus().toggleUnderline().run()} 
        isActive={editor.isActive("underline")}
        title="Underline"
      >
        <UnderlineIcon size={18} />
      </Button>

      <div className="w-px h-6 bg-white/10 mx-1" />

      <Button 
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} 
        isActive={editor.isActive("heading", { level: 1 })}
        title="Heading 1"
      >
        <Heading1 size={18} />
      </Button>
      <Button 
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} 
        isActive={editor.isActive("heading", { level: 2 })}
        title="Heading 2"
      >
        <Heading2 size={18} />
      </Button>

      <div className="w-px h-6 bg-white/10 mx-1" />

      <Button 
        onClick={() => editor.chain().focus().toggleBulletList().run()} 
        isActive={editor.isActive("bulletList")}
        title="Bullet List"
      >
        <List size={18} />
      </Button>
      <Button 
        onClick={() => editor.chain().focus().toggleOrderedList().run()} 
        isActive={editor.isActive("orderedList")}
        title="Ordered List"
      >
        <ListOrdered size={18} />
      </Button>

      <div className="w-px h-6 bg-white/10 mx-1" />

      <Button 
        onClick={() =>
          ((editor.chain().focus() as unknown) as { setTextAlign: (v: string) => { run: () => void } })
            .setTextAlign('left')
            .run()
        }
        isActive={editor.isActive({ textAlign: 'left' })}
        title="Align Left"
      >
        <AlignLeft size={18} />
      </Button>
      <Button 
        onClick={() =>
          ((editor.chain().focus() as unknown) as { setTextAlign: (v: string) => { run: () => void } })
            .setTextAlign('center')
            .run()
        }
        isActive={editor.isActive({ textAlign: 'center' })}
        title="Align Center"
      >
        <AlignCenter size={18} />
      </Button>
      <Button 
        onClick={() =>
          ((editor.chain().focus() as unknown) as { setTextAlign: (v: string) => { run: () => void } })
            .setTextAlign('right')
            .run()
        }
        isActive={editor.isActive({ textAlign: 'right' })}
        title="Align Right"
      >
        <AlignRight size={18} />
      </Button>

      <div className="w-px h-6 bg-white/10 mx-1" />

      <Button 
        onClick={() => editor.chain().focus().toggleBlockquote().run()} 
        isActive={editor.isActive("blockquote")}
        title="Quote"
      >
        <Quote size={18} />
      </Button>
      <Button 
        onClick={() => editor.chain().focus().toggleCodeBlock().run()} 
        isActive={editor.isActive("codeBlock")}
        title="Code Block"
      >
        <Code size={18} />
      </Button>
      
      <Button 
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} 
        title="Insert Table"
      >
        <TableIcon size={18} />
      </Button>
    </div>
  );
}
