import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'

export default Extension.create({
  name: 'wikilink',

  addOptions() {
    return {
      suggestion: {
        char: '[[',
        command: ({ editor, range, props }: any) => {
          // insert the wikilink text, e.g. [[Page Title]]
          editor
            .chain()
            .focus()
            .insertContentAt(range, `[[${props.title}]] `)
            .run()
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        pluginKey: new PluginKey('wikiLink'),
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ]
  },
})
