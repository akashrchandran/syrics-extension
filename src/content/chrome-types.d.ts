// Chrome extension types for content script  
declare global {
  const chrome: {
    runtime: {
      getURL(path: string): string;
      sendMessage(message: any, callback?: (response: any) => void): void;
    };
  };
}

export {};
