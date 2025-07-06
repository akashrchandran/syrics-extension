// Chrome extension types for background script
declare global {
  const chrome: {
    runtime: {
      onMessage: {
        addListener(
          callback: (
            request: any,
            sender: {
              id?: string;
              url?: string;
              origin?: string;
            },
            sendResponse: (response: any) => void
          ) => boolean | void
        ): void;
      };
      MessageSender: {
        id?: string;
        url?: string;
        origin?: string;
      };
    };
  };
  
  namespace chrome {
    namespace runtime {
      interface MessageSender {
        id?: string;
        url?: string;
        origin?: string;
      }
    }
  }
}

export {};
