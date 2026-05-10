import { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bold, Italic, Underline, Link as LinkIcon, Code } from "lucide-react";

interface Props {
  editor: Editor;
}

export function FloatingBubbleMenu({ editor }: Props) {
  if (!editor) return null;

  return (
    <BubbleMenu
      editor={editor}
      className="flex items-center gap-1 p-1 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl shadow-xl backdrop-blur-md"
    >
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`p-1.5 rounded-lg transition-colors ${
          editor.isActive("bold")
            ? "bg-[var(--accent)] text-[var(--bg-950)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-800)] hover:text-[var(--text-primary)]"
        }`}
      >
        <Bold size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`p-1.5 rounded-lg transition-colors ${
          editor.isActive("italic")
            ? "bg-[var(--accent)] text-[var(--bg-950)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-800)] hover:text-[var(--text-primary)]"
        }`}
      >
        <Italic size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={`p-1.5 rounded-lg transition-colors ${
          editor.isActive("underline")
            ? "bg-[var(--accent)] text-[var(--bg-950)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-800)] hover:text-[var(--text-primary)]"
        }`}
      >
        <Underline size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={`p-1.5 rounded-lg transition-colors ${
          editor.isActive("code")
            ? "bg-[var(--accent)] text-[var(--bg-950)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-800)] hover:text-[var(--text-primary)]"
        }`}
      >
        <Code size={16} />
      </button>
      <button
        onClick={() => {
          const previousUrl = editor.getAttributes("link").href;
          const url = window.prompt("URL", previousUrl);
          
          if (url === null) return;
          if (url === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
          }
          editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }}
        className={`p-1.5 rounded-lg transition-colors ${
          editor.isActive("link")
            ? "bg-[var(--accent)] text-[var(--bg-950)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-800)] hover:text-[var(--text-primary)]"
        }`}
      >
        <LinkIcon size={16} />
      </button>
    </BubbleMenu>
  );
}
