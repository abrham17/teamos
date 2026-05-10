import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { api } from '@/lib/api';

export const ImageUpload = Extension.create({
  name: 'imageUpload',

  addOptions() {
    return {
      teamId: null,
    };
  },

  addProseMirrorPlugins() {
    const uploadImage = async (file: File, view: any, pos?: number) => {
      const { teamId } = this.options;
      if (!teamId) return;

      // 1. Optional: insert a temporary placeholder (omitted here for simplicity, 
      // but could be an image with a local dataURL or a loading node)
      
      try {
        const formData = new FormData();
        formData.append('file', file);
        
        // Use our backend endpoint
        const response = await api.postForm<{ url: string }>(`/wiki/${teamId}/upload-image/`, formData);
        
        if (response?.url) {
          // 2. Insert the actual image
          const { schema } = view.state;
          const node = schema.nodes.image.create({ src: response.url });
          const transaction = view.state.tr.insert(pos ?? view.state.selection.from, node);
          view.dispatch(transaction);
        }
      } catch (error) {
        console.error("Failed to upload image:", error);
      }
    };

    return [
      new Plugin({
        key: new PluginKey('imageUpload'),
        props: {
          handlePaste: (view, event) => {
            const items = Array.from(event.clipboardData?.items || []);
            const imageItem = items.find(item => item.type.startsWith('image/'));

            if (imageItem) {
              const file = imageItem.getAsFile();
              if (file && this.options.teamId) {
                event.preventDefault();
                uploadImage(file, view);
                return true;
              }
            }
            return false;
          },
          handleDrop: (view, event, slice, moved) => {
            if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
              const file = event.dataTransfer.files[0];
              if (file.type.startsWith('image/') && this.options.teamId) {
                event.preventDefault();
                const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
                uploadImage(file, view, coordinates?.pos);
                return true;
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});
