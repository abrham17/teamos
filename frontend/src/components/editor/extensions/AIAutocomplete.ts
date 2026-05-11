import { Extension } from '@tiptap/core';
import { api } from '@/lib/api';

export interface AIAutocompleteOptions {
  teamId: string;
}

export const AIAutocomplete = Extension.create<AIAutocompleteOptions>({
  name: 'aiAutocomplete',

  addOptions() {
    return {
      teamId: '',
    };
  },

  addKeyboardShortcuts() {
    return {
      'Tab': () => {
        const { editor } = this;
        const { state } = editor;
        
        // Don't intercept tab if we are in a list or table, allow normal behavior
        if (editor.isActive('listItem') || editor.isActive('table')) {
          return false; 
        }

        const teamId = this.options.teamId;
        if (!teamId) return false;

        const { from } = state.selection;
        // Get the last 300 characters before the cursor
        const textContext = state.doc.textBetween(Math.max(0, from - 300), from, ' ');
        if (!textContext.trim()) return false;

        // Show a temporary loading text
        editor.chain().focus().insertContent('...').run();
        const loadingEnd = editor.state.selection.from;

        api.post<{ suggestion: string }>(`/wiki/${teamId}/autocomplete/`, {
          context: textContext
        }).then(res => {
          // Replace "..." with the real suggestion
          editor.chain().focus().deleteRange({ from: loadingEnd - 3, to: loadingEnd }).insertContent(res.suggestion).run();
        }).catch(err => {
          console.error("AI Autocomplete failed:", err);
          editor.chain().focus().deleteRange({ from: loadingEnd - 3, to: loadingEnd }).run();
        });

        return true; // We handled the Tab key
      },
    };
  },
});
