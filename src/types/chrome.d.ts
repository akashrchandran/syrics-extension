// Chrome Extension API types
declare namespace chrome {
  export namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      title?: string;
      active?: boolean;
      windowId?: number;
    }

    interface QueryInfo {
      active?: boolean;
      currentWindow?: boolean;
      url?: string;
    }

    function query(queryInfo: QueryInfo): Promise<Tab[]>;
  }

  export namespace scripting {
    interface InjectionTarget {
      tabId: number;
      frameIds?: number[];
      allFrames?: boolean;
    }

    interface ScriptInjection<Args extends any[], Result> {
      target: InjectionTarget;
      function: (...args: Args) => Result;
      args?: Args;
    }

    interface InjectionResult<T> {
      result: T;
      frameId: number;
    }

    function executeScript<Args extends any[], Result>(
      injection: ScriptInjection<Args, Result>
    ): Promise<InjectionResult<Result>[]>;
  }

  export namespace runtime {
    interface MessageSender {
      id?: string;
      url?: string;
      origin?: string;
      tab?: tabs.Tab;
    }

    interface OnMessageEvent {
      addListener(
        callback: (
          request: any,
          sender: MessageSender,
          sendResponse: (response: any) => void
        ) => boolean | void
      ): void;
    }

    function sendMessage(message: any): Promise<any>;
    function sendMessage(message: any, responseCallback: (response: any) => void): void;
    function getURL(path: string): string;

    const onMessage: OnMessageEvent;
  }

  export namespace storage {
    interface StorageArea {
      get(keys: string | string[] | null): Promise<{ [key: string]: any }>;
      set(items: { [key: string]: any }): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      clear(): Promise<void>;
    }

    const local: StorageArea;
    const sync: StorageArea;
  }
}

// Make chrome available globally
declare const chrome: typeof chrome;
