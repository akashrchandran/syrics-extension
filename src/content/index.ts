// ...existing code...
import { 
  TrackInfo, 
  AuthInfo, 
  ContentToInjectedMessage, 
  InjectedToContentMessage,
  DownloadLyricsRequest,
  GetTrackDetailsRequest 
} from '@/types';
import { DOMUtils, TrackExtractor, debounce } from '@/utils/helpers';

/**
 * Main content script class for Syrics extension
 */
class SyricsExtension {
  private observer: MutationObserver | null = null;
  private isInitialized = false;
  private lastClickedMoreButton: Element | null = null;
  private lastClickedMoreButtonTime = 0;
  private lastClickedTrackRow: Element | null = null;
  private lastClickedTrackId: string | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    if (this.isInitialized) return;

    // Wait for page to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  private setup(): void {
    this.isInitialized = true;
    this.injectHelperScript();
    this.startObserving();
    this.setupMessageListener();
    this.setupMoreButtonTracking();

    console.log('Syrics Extension: Content script initialized');
  }

  private injectHelperScript(): void {
    const scriptUrl = chrome.runtime.getURL('injected.js');
    DOMUtils.injectScript(scriptUrl);
  }

  private setupMoreButtonTracking(): void {
    // Track clicks on more buttons in track rows
    document.addEventListener('click', (event) => {
      const target = event.target as Element;

      // Check if clicked element is a more button inside a track row
      const moreButton = target.closest('[data-testid="more-button"]');
      if (moreButton) {
        const trackRow = moreButton.closest('[data-testid="tracklist-row"]');
        if (trackRow) {
          this.handleMoreButtonClick(moreButton, trackRow);
        }
      }
    }, true);
  }

  private handleMoreButtonClick(moreButton: Element, trackRow: Element): void {
    this.lastClickedMoreButton = moreButton;
    this.lastClickedMoreButtonTime = Date.now();
    this.lastClickedTrackRow = trackRow;

    // Extract track ID from the track row
    this.lastClickedTrackId = TrackExtractor.extractTrackIdFromRow(trackRow);

    console.log('Syrics Extension: Track row more button clicked, track ID:', this.lastClickedTrackId);

    // Store the track row reference for the injected script
    const message: ContentToInjectedMessage = {
      type: 'SYRICS_TRACK_ROW_CLICKED',
      trackRow: {
        innerHTML: trackRow.innerHTML,
        trackId: this.lastClickedTrackId
      }
    };

    window.postMessage(message, '*');
  }

  private startObserving(): void {
    // Observe DOM changes to detect new menus and track rows
    this.observer = new MutationObserver(
      debounce((mutations) => {
        this.handleDOMChanges(mutations);
      }, 100)
    );

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private handleDOMChanges(mutations: MutationRecord[]): void {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        // Check for context menus that might have been added
        const addedNodes = Array.from(mutation.addedNodes) as Element[];
        for (const node of addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.checkForContextMenu(node);
          }
        }
      }
    }
  }

  private checkForContextMenu(element: Element): void {
    // Look for context menu containers
    const contextMenus = element.querySelectorAll('[role="menu"], [data-testid*="menu"]');
    
    for (const menu of contextMenus) {
      // Check if this menu is related to our last clicked track
      if (this.shouldAddDownloadOption(menu)) {
        this.addDownloadLyricsOption(menu);
      }
    }
  }

  private shouldAddDownloadOption(menu: Element): boolean {
    // Check if we recently clicked a more button and this menu appeared shortly after
    const timeSinceLastClick = Date.now() - this.lastClickedMoreButtonTime;
    const isRecentlyClicked = timeSinceLastClick < 1000; // Within 1 second
    
    // Check if the menu doesn't already have our download option
    const hasDownloadOption = menu.querySelector('[data-syrics-download]');
    
    return isRecentlyClicked && !hasDownloadOption && Boolean(this.lastClickedTrackId);
  }

  private addDownloadLyricsOption(menu: Element): void {
    try {
      // Create download lyrics menu item
      const downloadItem = this.createDownloadMenuItem();
      
      // Find the best position to insert the menu item
      const insertPosition = this.findInsertPosition(menu);
      
      if (insertPosition) {
        insertPosition.insertAdjacentElement('afterend', downloadItem);
      } else {
        // Fallback: append to the menu
        menu.appendChild(downloadItem);
      }

      console.log('Syrics Extension: Added download lyrics option to menu');
    } catch (error) {
      console.error('Syrics Extension: Error adding download option:', error);
    }
  }

  private createDownloadMenuItem(): HTMLElement {
    // Create a menu item that matches Spotify's styling
    const menuItem = document.createElement('div');
    menuItem.setAttribute('data-syrics-download', 'true');
    menuItem.setAttribute('role', 'menuitem');
    menuItem.setAttribute('tabindex', '-1');
    
    // Copy styling from existing menu items
    const existingItem = document.querySelector('[role="menuitem"]');
    if (existingItem) {
      menuItem.className = existingItem.className;
    }

    menuItem.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="syrics-icon">
      <path d="M15.94 0L11.06 4.8L6.35 9.46h-.04c-1.12 0-2.16-.39-2.98-1.08C2.27 7.56 1.57 6.2 1.57 4.7c0-1.31.53-2.5 1.39-3.36C3.82.48 5.01-.05 6.32-.05L15.94 0z"/>
      <path d="M14.37 11.11c0 1.31-.53 2.5-1.39 3.36-.86.86-2.05 1.39-3.36 1.39H.06l4.88-4.86L9.63 6.37h.01c1.12 0 2.16.39 2.98 1.08 1.06.82 1.75 2.08 1.75 3.66z"/>
      </svg>
      <span class="syrics-text">Download lyrics</span>
    `;

    menuItem.addEventListener('click', () => {
      this.handleDownloadLyricsClick();
    });

    return menuItem;
  }

  private findInsertPosition(menu: Element): Element | null {
    // Try to find a good position to insert our menu item
    const menuItems = menu.querySelectorAll('[role="menuitem"]');
    
    // Look for "Add to playlist" or similar items to insert after
    for (const item of menuItems) {
      const text = item.textContent?.toLowerCase() || '';
      if (text.includes('playlist') || text.includes('queue') || text.includes('liked')) {
        return item as Element;
      }
    }

    // Fallback: return the last menu item
    return menuItems[menuItems.length - 1] as Element || null;
  }

  private async handleDownloadLyricsClick(): Promise<void> {
    try {
      if (!this.lastClickedTrackId) {
        throw new Error('No track selected');
      }

      // Get authentication info from the injected script
      const authInfo = await this.getAuthInfo();
      
      // Get track info (try multiple methods)
      let trackInfo = await this.getTrackInfo();
      
      // If track info is incomplete, try to get it from API
      if (!trackInfo || !trackInfo.name) {
        console.log('Getting track details from API...');
        
        const trackDetailsRequest: GetTrackDetailsRequest = {
          action: 'getTrackDetails',
          trackId: this.lastClickedTrackId,
          authInfo
        };
        
        const trackDetailsResponse = await this.sendMessage(trackDetailsRequest);
        if (trackDetailsResponse.success && trackDetailsResponse.trackInfo) {
          trackInfo = trackDetailsResponse.trackInfo;
        }
      }

      if (!trackInfo) {
        throw new Error('Could not get track information');
      }

      console.log('Downloading lyrics for:', trackInfo);

      // Send download request to background script
      const downloadRequest: DownloadLyricsRequest = {
        action: 'downloadLyrics',
        trackInfo,
        authInfo
      };

      const response = await this.sendMessage(downloadRequest);

      if (response.success) {
        // Trigger download
        this.downloadFile(response.lrcContent, response.filename);
        
        // Show success notification
        this.showNotification('Lyrics downloaded successfully!', 'success');
      } else {
        throw new Error(response.error || 'Failed to download lyrics');
      }
    } catch (error) {
      console.error('Download error:', error);
      this.showNotification((error as Error).message, 'error');
    }
  }

  private async getAuthInfo(): Promise<AuthInfo> {
    return new Promise((resolve) => {
      // Request auth info from injected script
      window.postMessage({ type: 'SYRICS_GET_AUTH_INFO' }, '*');
      
      const handleAuthResponse = (event: MessageEvent<InjectedToContentMessage>) => {
        if (event.source === window && event.data.type === 'SYRICS_AUTH_INFO') {
          window.removeEventListener('message', handleAuthResponse);
          resolve(event.data.data);
        }
      };
      
      window.addEventListener('message', handleAuthResponse);
      
      // Timeout after 5 seconds
      setTimeout(() => {
        window.removeEventListener('message', handleAuthResponse);
        resolve({});
      }, 5000);
    });
  }

  private async getTrackInfo(): Promise<TrackInfo | null> {
    return new Promise((resolve) => {
      // Request current track info from injected script
      window.postMessage({ type: 'SYRICS_GET_CURRENT_TRACK' }, '*');
      
      const handleTrackResponse = (event: MessageEvent<InjectedToContentMessage>) => {
        if (event.source === window && event.data.type === 'SYRICS_CURRENT_TRACK') {
          window.removeEventListener('message', handleTrackResponse);
          resolve(event.data.data);
        }
      };
      
      window.addEventListener('message', handleTrackResponse);
      
      // Timeout after 3 seconds
      setTimeout(() => {
        window.removeEventListener('message', handleTrackResponse);
        resolve(null);
      }, 3000);
    });
  }

  private sendMessage(message: any): Promise<any> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response: any) => {
        resolve(response);
      });
    });
  }

  private downloadFile(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
  }

  private showNotification(message: string, type: 'success' | 'error'): void {
    // Create a simple notification
    const notification = document.createElement('div');
    notification.className = `syrics-notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }

  private setupMessageListener(): void {
    // Listen for messages from injected script
    window.addEventListener('message', (event: MessageEvent<InjectedToContentMessage>) => {
      if (event.source !== window) return;
      
      // Handle different message types if needed
      switch (event.data.type) {
        case 'SYRICS_DOWNLOAD_LYRICS':
          this.handleDownloadLyricsClick();
          break;
      }
    });
  }
}

// Initialize the extension
new SyricsExtension();
