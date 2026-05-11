import { ReactRenderer } from '@tiptap/react'
import tippy from 'tippy.js'
import { CommandList } from './CommandList'
import { getApiAuthHeaders } from '@/lib/api'

import { Editor, Range } from '@tiptap/core'

type CommandContext = {
  editor: Editor
  range: Range
}

type SuggestionProps = {
  editor: unknown
  clientRect?: (() => DOMRect) | null
  event: KeyboardEvent
}

type RendererBridge = {
  element: Element
  updateProps: (props: unknown) => void
  destroy: () => void
  ref?: { onKeyDown?: (props: SuggestionProps) => boolean }
}

const getSuggestions = (teamId: string) => ({
  items: ({ query, editor }: { query: string, editor: Editor }) => {
    const isTableActive = editor.isActive('table');

    const commands = [
      {
        title: 'Heading 1',
        command: ({ editor, range }: CommandContext) => {
          editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run()
        },
      },
      {
        title: 'Heading 2',
        command: ({ editor, range }: CommandContext) => {
          editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run()
        },
      },
      {
        title: 'Bullet List',
        command: ({ editor, range }: CommandContext) => {
          editor.chain().focus().deleteRange(range).toggleBulletList().run()
        },
      },
      {
        title: 'Table',
        command: ({ editor, range }: CommandContext) => {
          editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        },
      },
      {
        title: 'Task List',
        command: ({ editor, range }: CommandContext) => {
          editor.chain().focus().deleteRange(range).toggleTaskList().run()
        },
      },
      {
        title: 'Code Block',
        command: ({ editor, range }: CommandContext) => {
          editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
        },
      },
      {
        title: 'Callout / Note',
        command: ({ editor, range }: CommandContext) => {
          editor.chain().focus().deleteRange(range).insertContent({ type: 'callout', attrs: { type: 'note' }, content: [{ type: 'paragraph' }] }).run()
        },
      },
      {
        title: 'YouTube Embed',
        command: ({ editor, range }: CommandContext) => {
          const url = prompt('Enter YouTube URL')
          if (url) {
            editor.chain().focus().deleteRange(range).setYoutubeVideo({ src: url }).run()
          } else {
            editor.chain().focus().deleteRange(range).run()
          }
        },
      },
      {
        title: 'Math Block',
        command: ({ editor, range }: CommandContext) => {
          editor.chain().focus().deleteRange(range).insertContent({ type: 'math' }).run()
        },
      },
      {
        title: 'Mermaid Diagram',
        command: ({ editor, range }: CommandContext) => {
          editor.chain().focus().deleteRange(range).insertContent({ type: 'mermaid' }).run()
        },
      },
      {
        title: 'Knowledge Graph Map',
        command: ({ editor, range }: CommandContext) => {
          editor.chain().focus().deleteRange(range).insertContent({ type: 'graphEmbed', attrs: { teamId } }).run()
        },
      },
      {
        title: '✨ Ask AI',
        command: async ({ editor, range }: CommandContext) => {
          const promptText = prompt('What would you like the AI to write?')
          if (!promptText) {
            editor.chain().focus().deleteRange(range).run()
            return
          }

          // We must be able to access the teamId. The suggestions configuration in GoogleDocsEditor.tsx
          // currently doesn't pass teamId directly to suggestions items easily. 
          // Wait, we can get it from the window URL or localStorage, but let's try reading it from the DOM or URL.
          const urlParams = new URLSearchParams(window.location.search)
          // Actually, we can get the text around the cursor right now.
          editor.chain().focus().deleteRange(range).run()

          const state = editor.state;
          const pos = state.selection.from;
          const contextBefore = state.doc.textBetween(Math.max(0, pos - 1000), pos, '\n');
          const contextAfter = state.doc.textBetween(pos, Math.min(state.doc.content.size, pos + 1000), '\n');

          if (!teamId) {
            alert("No active team found to use AI.");
            return;
          }

          try {
            const authHeaders = await getApiAuthHeaders();
            const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
            
            const response = await fetch(`${API_URL}/wiki/${teamId}/autocomplete/`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...authHeaders
              },
              body: JSON.stringify({
                prompt: promptText,
                context_before: contextBefore,
                context_after: contextAfter,
              })
            });

            if (!response.ok) {
              throw new Error('Failed to start AI stream');
            }

            if (!response.body) return;

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              const chunk = decoder.decode(value);
              const lines = chunk.split('\n');
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.token) {
                      editor.chain().focus().insertContent(data.token).run();
                    }
                  } catch (e) {
                    // Ignore JSON parse errors for incomplete chunks
                  }
                }
              }
            }
          } catch (e) {
            console.error("AI Autocomplete failed:", e);
            alert("AI Autocomplete failed.");
          }
        },
      },
    ];

    if (isTableActive) {
      commands.push(
        {
          title: 'Add Row Above',
          command: ({ editor, range }: CommandContext) => {
            editor.chain().focus().deleteRange(range).addRowBefore().run()
          },
        },
        {
          title: 'Add Row Below',
          command: ({ editor, range }: CommandContext) => {
            editor.chain().focus().deleteRange(range).addRowAfter().run()
          },
        },
        {
          title: 'Add Column Left',
          command: ({ editor, range }: CommandContext) => {
            editor.chain().focus().deleteRange(range).addColumnBefore().run()
          },
        },
        {
          title: 'Add Column Right',
          command: ({ editor, range }: CommandContext) => {
            editor.chain().focus().deleteRange(range).addColumnAfter().run()
          },
        },
        {
          title: 'Delete Table',
          command: ({ editor, range }: CommandContext) => {
            editor.chain().focus().deleteRange(range).deleteTable().run()
          },
        }
      );
    }

    return commands.filter(item => item.title.toLowerCase().startsWith(query.toLowerCase())).slice(0, 10);
  },

  render: () => {
    let component: RendererBridge | null = null
    let popup: ReturnType<typeof tippy> | null = null

    return {
      onStart: (props: SuggestionProps) => {
        component = (new ReactRenderer(CommandList, {
          props,
          editor: props.editor as never,
        }) as unknown) as RendererBridge

        if (!props.clientRect) {
          return
        }

        popup = tippy('body', {
          getReferenceClientRect: props.clientRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
        })
      },

      onUpdate(props: SuggestionProps) {
        component?.updateProps(props)

        if (!props.clientRect) {
          return
        }

        popup?.[0].setProps({
          getReferenceClientRect: props.clientRect,
        })
      },

      onKeyDown(props: SuggestionProps) {
        if (props.event.key === 'Escape') {
          popup?.[0].hide()
          return true
        }
        return component?.ref?.onKeyDown?.(props) ?? false
      },

      onExit() {
        popup?.[0].destroy()
        component?.destroy()
      },
    }
  },
})

export default getSuggestions
