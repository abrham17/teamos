import { ReactRenderer } from '@tiptap/react'
import tippy from 'tippy.js'
import { CommandList } from './CommandList'

type CommandContext = {
  editor: {
    chain: () => {
      focus: () => {
        deleteRange: (range: unknown) => {
          setNode: (name: string, attrs?: Record<string, unknown>) => { run: () => void }
          toggleBulletList: () => { run: () => void }
          insertTable: (opts: { rows: number; cols: number; withHeaderRow: boolean }) => { run: () => void }
          toggleCodeBlock: () => { run: () => void }
        }
      }
    }
  }
  range: unknown
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

const suggestions = {
  items: ({ query }: { query: string }) => {
    return [
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
        title: 'Code Block',
        command: ({ editor, range }: CommandContext) => {
          editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
        },
      },
    ].filter(item => item.title.toLowerCase().startsWith(query.toLowerCase())).slice(0, 10)
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
}

export default suggestions
