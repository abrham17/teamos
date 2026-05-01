import { Node, mergeAttributes } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';

export default Node.create({
  name: 'wikilink',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      title: {
        default: null,
        parseHTML: element => element.getAttribute('data-title'),
        renderHTML: attributes => ({ 'data-title': attributes.title }),
      },
      slug: {
        default: null,
        parseHTML: element => element.getAttribute('data-slug'),
        renderHTML: attributes => ({ 'data-slug': attributes.slug }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-wikilink]' }];
  },

  renderHTML({ attributes }) {
    return [
      'span',
      mergeAttributes({ 'data-wikilink': '', class: 'wikilink-chip' }, attributes),
      `[[${attributes.title}]]`,
    ];
  },

  addOptions() {
    return {
      suggestion: {
        char: '[[',
        pluginKey: new PluginKey('wikiLink'),
        command: ({ editor, range, props }: any) => {
          editor
            .chain()
            .focus()
            .replaceRangeWith(range, {
              type: this.name,
              attrs: props,
            })
            .insertContent(' ')
            .run();
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
