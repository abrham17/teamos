import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'

type SuggestionCommandPayload = {
  editor: unknown
  range: unknown
  props: { command: (arg: { editor: unknown; range: unknown }) => void }
}

export default Extension.create({
  name: 'slashcommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }: SuggestionCommandPayload) => {
          props.command({ editor, range })
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        pluginKey: new PluginKey('slashCommand'),
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ]
  },
})
