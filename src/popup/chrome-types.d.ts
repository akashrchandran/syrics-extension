// Chrome extension types for popup
declare global {
  const chrome: {
    tabs: {
      query(queryInfo: { active: boolean; currentWindow: boolean }): Promise<Array<{
        id?: number;
        url?: string;
      }>>;
    };
    scripting: {
      executeScript(details: {
        target: { tabId: number };
        function: () => any;
      }): Promise<Array<{ result: any }>>;
    };
  };
}

export {};
