declare module "@tiptap/extension-text-align";
declare module "@tiptap/extension-highlight";
declare module "tiptap-markdown";
declare module "@tiptap/extension-collaboration";
declare module "@tiptap/extension-collaboration-cursor";
declare module "yjs" {
  export class Doc {
    destroy(): void;
  }
}

declare module "y-websocket" {
  export class WebsocketProvider {
    awareness: {
      setLocalStateField: (field: string, value: unknown) => void;
    };
    constructor(url: string, roomName: string, doc: unknown);
    destroy(): void;
  }
}
