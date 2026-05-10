import { Node, mergeAttributes } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';

type WikilinkCommandPayload = {
  editor: {
    chain: () => {
      focus: () => {
        replaceRangeWith: (range: unknown, replacement: { type: string; attrs: Record<string, unknown> }) => {
          insertContent: (content: string) => { run: () => void }
        }
      }
    }
  }
  range: unknown
  props: Record<string, unknown>
}

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

  renderHTML({ node }) {
    return [
      'span',
      mergeAttributes({ 'data-wikilink': '', class: 'wikilink wikilink-chip' }, node.attrs),
      `[[${node.attrs.title}]]`,
    ];
  },

  addOptions() {
    return {
      suggestion: {
        char: '[[',
        pluginKey: new PluginKey('wikiLink'),
        command: ({ editor, range, props }: WikilinkCommandPayload) => {
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
