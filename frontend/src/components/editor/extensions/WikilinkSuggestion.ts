import { ReactRenderer } from '@tiptap/react'
import tippy from 'tippy.js'
import { CommandList } from './CommandList'
import { api } from '@/lib/api'

export default function getWikilinkSuggestion(teamId: string) {
  return {
    items: async ({ query }: { query: string }) => {
      if (!teamId) return []
      try {
        // Simple search query to the backend
        const pages = await api.get(`/wiki/${teamId}/search/?q=${encodeURIComponent(query)}`)
        return pages.map((p: any) => ({ title: p.title, id: p.id, slug: p.slug }))
      } catch (e) {
        console.error(e)
        return []
      }
    },

    render: () => {
      let component: any
      let popup: any

      return {
        onStart: (props: any) => {
          component = new ReactRenderer(CommandList, {
            props,
            editor: props.editor,
          })

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

        onUpdate(props: any) {
          component.updateProps(props)

          if (!props.clientRect) {
            return
          }

          popup[0].setProps({
            getReferenceClientRect: props.clientRect,
          })
        },

        onKeyDown(props: any) {
          if (props.event.key === 'Escape') {
            popup[0].hide()
            return true
          }
          return component.ref?.onKeyDown(props)
        },

        onExit() {
          popup[0].destroy()
          component.destroy()
        },
      }
    },
  }
}
