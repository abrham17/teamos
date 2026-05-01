import { ReactRenderer } from '@tiptap/react'
import tippy from 'tippy.js'
import { CommandList } from './CommandList'
import { api } from '@/lib/api'

type WikilinkPage = { title: string; id: string; slug: string }
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

export default function getWikilinkSuggestion(teamId: string) {
  return {
    items: async ({ query }: { query: string }) => {
      if (!teamId) return []
      try {
        // Simple search query to the backend
        const pages = (await api.get(`/wiki/${teamId}/search/?q=${encodeURIComponent(query)}`)) as WikilinkPage[]
        return pages.map((p) => ({ title: p.title, id: p.id, slug: p.slug }))
      } catch (e) {
        console.error(e)
        return []
      }
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
}
