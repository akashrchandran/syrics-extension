// Syrics Extension - Content Script
// Injects download lyrics functionality into Spotify Web Player

class SyricsExtension {
  constructor() {
    this.observer = null;
    this.isInitialized = false;
    this.lastClickedMoreButton = null;
    this.lastClickedMoreButtonTime = 0;
    this.lastClickedTrackRow = null;
    this.lastClickedTrackId = null;
    this.init();
  }

  init() {
    if (this.isInitialized) return;

    // Wait for page to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  setup() {
    this.isInitialized = true;
    this.injectHelperScript();
    this.startObserving();
    this.setupMessageListener();
    this.setupMoreButtonTracking();

    console.log('Syrics Extension: Initialized');
  }

  injectHelperScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = function () {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }

  setupMoreButtonTracking() {
    // Track clicks on more buttons in track rows
    document.addEventListener('click', (event) => {
      const target = event.target;

      // Check if clicked element is a more button inside a track row
      const moreButton = target.closest('[data-testid="more-button"]');
      if (moreButton) {
        const trackRow = moreButton.closest('[data-testid="tracklist-row"]');
        if (trackRow) {
          this.lastClickedMoreButton = moreButton;
          this.lastClickedMoreButtonTime = Date.now();
          this.lastClickedTrackRow = trackRow;

          // Extract track ID from the track row using regex
          this.lastClickedTrackId = this.extractTrackIdFromRow(trackRow);

          console.log('Syrics Extension: Track row more button clicked, track ID:', this.lastClickedTrackId);

          // Store the track row reference for the injected script
          window.postMessage({
            type: 'SYRICS_TRACK_ROW_CLICKED',
            trackRow: {
              innerHTML: trackRow.innerHTML,
              trackId: this.lastClickedTrackId
            }
          }, '*');
        }
      }
    }, true);
  }

  extractTrackIdFromRow(row) {
    try {
      if (!row) return null;

      // Method 1: Look for track link with data-testid="internal-track-link"
      const trackLink = row.querySelector('[data-testid="internal-track-link"]');
      if (trackLink && trackLink.href) {
        const match = trackLink.href.match(/\/track\/([a-zA-Z0-9]+)/);
        if (match) {
          return match[1];
        }
      }

      // Method 2: Look for any link with href containing "/track/"
      const allLinks = row.querySelectorAll('a[href*="/track/"]');
      for (const link of allLinks) {
        const match = link.href.match(/\/track\/([a-zA-Z0-9]+)/);
        if (match) {
          return match[1];
        }
      }

      // Method 3: Search the entire row's HTML for track URLs using regex
      const rowHtml = row.innerHTML;
      const trackMatch = rowHtml.match(/href="[^"]*\/track\/([a-zA-Z0-9]+)[^"]*"/);
      if (trackMatch) {
        return trackMatch[1];
      }

      return null;
    } catch (error) {
      console.error('Error extracting track ID from row:', error);
      return null;
    }
  }

  setupMessageListener() {
    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data.type) return;

      if (event.data.type === 'SYRICS_TRACK_INFO') {
        this.handleTrackInfo(event.data.trackInfo);
      }
    });
  }

  startObserving() {
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          // Check for context menus
          this.checkForContextMenu();

          // Also check specifically for newly added menu elements
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) { // Element node
              // Check if this is a menu element that belongs to a track row
              if (node.matches && node.matches('[role="menu"]')) {
                if (!node.querySelector('.syrics-download-btn') && this.isTrackRowContextMenu(node)) {
                  this.addDownloadButton(node);
                }
              }

              // Check for menus within the added node
              const menus = node.querySelectorAll && node.querySelectorAll('[role="menu"]');
              if (menus) {
                menus.forEach(menu => {
                  if (!menu.querySelector('.syrics-download-btn') && this.isTrackRowContextMenu(menu)) {
                    this.addDownloadButton(menu);
                  }
                });
              }
            }
          });
        }
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Initial check
    this.checkForContextMenu();
  }

  checkForContextMenu() {
    // Look for menus that are triggered by more buttons inside track rows
    const menus = document.querySelectorAll('[role="menu"]');

    menus.forEach(menu => {
      if (!menu.querySelector('.syrics-download-btn') && this.isTrackRowContextMenu(menu)) {
        this.addDownloadButton(menu);
      }
    });
  }

  isTrackRowContextMenu(menu) {
    // Strategy 1: Check if we recently clicked a track row more button (within last 3 seconds)
    if (this.lastClickedMoreButton && (Date.now() - this.lastClickedMoreButtonTime) < 3000) {
      const buttonRect = this.lastClickedMoreButton.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();

      // Check if menu is positioned near the recently clicked button
      const horizontalDistance = Math.abs(menuRect.left - buttonRect.left);
      const verticalDistance = Math.abs(menuRect.top - buttonRect.bottom);

      if (horizontalDistance < 200 && verticalDistance < 100) {
        console.log('Syrics Extension: Menu matched recently clicked track row more button');
        return true;
      }
    }

    // Strategy 2: Check if there's a currently expanded more button in a track row
    const expandedButtons = document.querySelectorAll('[data-testid="tracklist-row"] [data-testid="more-button"][aria-expanded="true"]');
    for (const button of expandedButtons) {
      const buttonRect = button.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();

      const horizontalDistance = Math.abs(menuRect.left - buttonRect.left);
      const verticalDistance = Math.abs(menuRect.top - buttonRect.bottom);

      if (horizontalDistance < 200 && verticalDistance < 100) {
        console.log('Syrics Extension: Menu matched expanded track row more button');
        return true;
      }
    }

    // Strategy 3: Check if the menu is positioned near any track row more button
    const trackRowMoreButtons = document.querySelectorAll('[data-testid="tracklist-row"] [data-testid="more-button"]');
    for (const button of trackRowMoreButtons) {
      const buttonRect = button.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();

      // Check if menu is positioned near the button (within reasonable distance)
      const horizontalDistance = Math.abs(menuRect.left - buttonRect.left);
      const verticalDistance = Math.abs(menuRect.top - buttonRect.bottom);

      if (horizontalDistance < 150 && verticalDistance < 80) {
        console.log('Syrics Extension: Menu positioned near track row more button');
        return true;
      }
    }

    // Strategy 4: Look for track-specific menu items with very strict criteria
    const menuItems = menu.querySelectorAll('[role="menuitem"]');
    const menuText = Array.from(menuItems).map(item => item.textContent.toLowerCase()).join(' ');

    // Look for very specific track actions that are unlikely to appear in other menus
    const trackSpecificPhrases = [
      'add to playlist',
      'save to your liked songs',
      'remove from this playlist',
      'go to song radio',
      'go to album',
      'go to artist',
      'show credits',
      'copy song link'
    ];

    const matchedPhrases = trackSpecificPhrases.filter(phrase => menuText.includes(phrase));

    // Only consider it a track menu if it has at least 3 track-specific actions
    if (matchedPhrases.length >= 3) {
      console.log('Syrics Extension: Menu matched track-specific actions fallback with', matchedPhrases.length, 'matches');
      return true;
    }

    console.log('Syrics Extension: Menu did not match track row criteria');
    return false;
  }

  addDownloadButton(menu) {
    const downloadBtn = this.createDownloadButton();

    // Find the best position to insert the button
    const menuItems = menu.querySelectorAll('[role="menuitem"]');
    if (menuItems.length > 0) {
      // Insert after the first separator or at the beginning
      const firstSeparator = menu.querySelector('[role="separator"]');
      if (firstSeparator) {
        firstSeparator.insertAdjacentElement('afterend', downloadBtn);
      } else {
        menuItems[0].insertAdjacentElement('beforebegin', downloadBtn);
      }
    } else {
      menu.appendChild(downloadBtn);
    }
  }

  createDownloadButton() {
    const button = document.createElement('div');
    button.setAttribute('role', 'menuitem');
    button.setAttribute('tabindex', '-1');
    button.className = 'syrics-download-btn';

    button.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="syrics-icon">
      <path d="M15.94 0L11.06 4.8L6.35 9.46h-.04c-1.12 0-2.16-.39-2.98-1.08C2.27 7.56 1.57 6.2 1.57 4.7c0-1.31.53-2.5 1.39-3.36C3.82.48 5.01-.05 6.32-.05L15.94 0z"/>
      <path d="M14.37 11.11c0 1.31-.53 2.5-1.39 3.36-.86.86-2.05 1.39-3.36 1.39H.06l4.88-4.86L9.63 6.37h.01c1.12 0 2.16.39 2.98 1.08 1.06.82 1.75 2.08 1.75 3.66z"/>
      </svg>
      <span class="syrics-text">Download lyrics</span>
    `;

    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleDownloadClick(button);
    });

    return button;
  }

  async handleDownloadClick(button) {
    try {
      this.setButtonState(button, 'loading');

      // Get current track info
      const trackInfo = await this.getCurrentTrackInfo();
      if (!trackInfo) {
        throw new Error('No track information found. Please make sure you clicked the three dots (⋯) next to a track in the track list, not other menus.');
      }

      console.log('Syrics: Downloading lyrics for:', trackInfo.name, 'by', trackInfo.artists, '(Track ID:', trackInfo.id + ')');

      // Get authentication info from Spotify
      const authInfo = await this.getAuthInfo();
      if (!authInfo || !authInfo.accessToken) {
        // Provide specific error messages based on token status
        if (authInfo && authInfo.hasInterceptedToken === false) {
          throw new Error('No Spotify authentication token found. Please refresh the page and try playing a song or navigating between tracks first.');
        } else if (authInfo && !authInfo.isTokenValid) {
          throw new Error('Authentication token has expired. Please refresh the page.');
        } else if (authInfo && !authInfo.isTokenFresh) {
          throw new Error('Authentication token is old and may not work. Please refresh the page for best results.');
        } else {
          throw new Error('No authentication information found. Please make sure you are logged into Spotify.');
        }
      }

      // Warn if token is getting old but still try to use it
      if (authInfo.tokenAge && authInfo.tokenAge > 1800 && authInfo.tokenAge < 2700) {
        console.warn('Syrics: Using older token, may need refresh soon');
      }

      // Send to background script for processing
      const response = await chrome.runtime.sendMessage({
        action: 'downloadLyrics',
        trackInfo: trackInfo,
        authInfo: authInfo
      });

      if (response.success) {
        // Use the potentially updated track info from the response
        const finalTrackInfo = response.trackInfo || trackInfo;
        
        // Download the lyrics file using the content script context
        this.downloadLyricsFile(response.lrcContent, response.filename);

        this.setButtonState(button, 'success');
        this.showNotification(`Lyrics downloaded for "${finalTrackInfo.name}"!`, 'success');

        // Close the context menu
        document.body.click();
      } else {
        throw new Error(response.error || 'Failed to download lyrics');
      }
    } catch (error) {
      console.error('Syrics Extension Error:', error);
      this.setButtonState(button, 'error');
      this.showNotification(error.message, 'error');
    }

    // Reset button state after 2 seconds
    setTimeout(() => {
      this.setButtonState(button, 'default');
    }, 2000);
  }

  downloadLyricsFile(lrcContent, filename) {
    try {
      // Create a blob with the lyrics content
      const blob = new Blob([lrcContent], { type: 'text/plain;charset=utf-8' });

      // Create a download link
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = filename;
      downloadLink.style.display = 'none';

      // Append to body, click, and remove
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      // Clean up the URL object
      URL.revokeObjectURL(url);

      console.log('Syrics: File download triggered for:', filename);
    } catch (error) {
      console.error('Syrics: Error downloading file:', error);
      throw new Error('Failed to download lyrics file');
    }
  }

  setButtonState(button, state) {
    button.classList.remove('loading', 'success', 'error');

    const icon = button.querySelector('.syrics-icon');
    const text = button.querySelector('.syrics-text');

    switch (state) {
      case 'loading':
        button.classList.add('loading');
        button.disabled = true;
        text.textContent = 'Downloading...';
        // Keep original icon, just change text
        break;
      case 'success':
        button.classList.add('success');
        text.textContent = 'Downloaded!';
        // Replace icon with a green checkmark
        icon.innerHTML = `
          <circle cx="8" cy="8" r="7" fill="#1db954" stroke="none"/>
          <path d="M5 8.5l1.5 1.5L11 6" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        `;
        break;
      case 'error':
        button.classList.add('error');
        text.textContent = 'Error';
        break;
      default:
        button.disabled = false;
        text.textContent = 'Download lyrics';
        // Reset to original icon
        icon.innerHTML = `
          <path d="M15.94 0L11.06 4.8L6.35 9.46h-.04c-1.12 0-2.16-.39-2.98-1.08C2.27 7.56 1.57 6.2 1.57 4.7c0-1.31.53-2.5 1.39-3.36C3.82.48 5.01-.05 6.32-.05L15.94 0z"/>
          <path d="M14.37 11.11c0 1.31-.53 2.5-1.39 3.36-.86.86-2.05 1.39-3.36 1.39H.06l4.88-4.86L9.63 6.37h.01c1.12 0 2.16.39 2.98 1.08 1.06.82 1.75 2.08 1.75 3.66z"/>
        `;
        break;
    }
  }

  async getCurrentTrackInfo() {
    return new Promise(async (resolve) => {
      let trackInfo = null;
      
      // If we have a recently clicked track ID, try to get track info for it
      if (this.lastClickedTrackId && (Date.now() - this.lastClickedMoreButtonTime) < 5000) {
        console.log('Syrics Extension: Using recently clicked track ID:', this.lastClickedTrackId);

        // First try to get track info from injected script
        trackInfo = await this.getTrackInfoFromInjectedScript(this.lastClickedTrackId);
        
        // If track info is incomplete or missing, fetch from Spotify API
        if (!trackInfo || this.isTrackInfoIncomplete(trackInfo)) {
          console.log('Syrics Extension: Track info incomplete, fetching from Spotify API...');
          trackInfo = await this.getTrackInfoFromAPI(this.lastClickedTrackId);
        }
        
        if (trackInfo) {
          resolve(trackInfo);
          return;
        }
      }
      
      // No recent track ID or failed to get info, use general track info request
      trackInfo = await this.getGeneralTrackInfo();
      
      // If general track info is incomplete and we have a track ID, try API
      if (trackInfo && trackInfo.id && this.isTrackInfoIncomplete(trackInfo)) {
        console.log('Syrics Extension: General track info incomplete, fetching from API...');
        const apiTrackInfo = await this.getTrackInfoFromAPI(trackInfo.id);
        if (apiTrackInfo) {
          trackInfo = apiTrackInfo;
        }
      }
      
      resolve(trackInfo);
    });
  }

  isTrackInfoIncomplete(trackInfo) {
    return !trackInfo || 
           !trackInfo.name || 
           !trackInfo.artists || 
           trackInfo.name.trim() === '' || 
           trackInfo.artists.trim() === '' ||
           trackInfo.name === 'Unknown Track' ||
           trackInfo.artists === 'Unknown Artist';
  }

  async getTrackInfoFromAPI(trackId) {
    try {
      // Get authentication info
      const authInfo = await this.getAuthInfo();
      if (!authInfo || !authInfo.accessToken) {
        console.warn('Syrics Extension: No auth info available for API request');
        return null;
      }

      // Call background script to get track details from Spotify API
      const response = await chrome.runtime.sendMessage({
        action: 'getTrackDetails',
        trackId: trackId,
        authInfo: authInfo
      });

      if (response.success) {
        console.log('Syrics Extension: Got track details from API:', response.trackInfo);
        return response.trackInfo;
      } else {
        console.warn('Syrics Extension: Failed to get track details from API:', response.error);
        return null;
      }
    } catch (error) {
      console.error('Syrics Extension: Error getting track info from API:', error);
      return null;
    }
  }

  async getTrackInfoFromInjectedScript(trackId) {
    return new Promise((resolve) => {
      // Send a message to the injected script to get track info for the specific track ID
      window.postMessage({
        type: 'SYRICS_REQUEST_TRACK_INFO_BY_ID',
        trackId: trackId
      }, '*');

      // Listen for response
      const handler = (event) => {
        if (event.source === window && event.data.type === 'SYRICS_TRACK_INFO_BY_ID') {
          window.removeEventListener('message', handler);
          resolve(event.data.trackInfo);
        }
      };

      window.addEventListener('message', handler);

      // Timeout after 3 seconds
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(null);
      }, 3000);
    });
  }

  async getGeneralTrackInfo() {
    return new Promise((resolve) => {
      // Request track info from injected script
      window.postMessage({ type: 'SYRICS_REQUEST_TRACK_INFO' }, '*');

      // Listen for response
      const handler = (event) => {
        if (event.source === window && event.data.type === 'SYRICS_TRACK_INFO') {
          window.removeEventListener('message', handler);
          resolve(event.data.trackInfo);
        }
      };

      window.addEventListener('message', handler);

      // Timeout after 5 seconds
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(null);
      }, 5000);
    });
  }

  async getAuthInfo() {
    return new Promise((resolve) => {
      // Request auth info from injected script
      window.postMessage({ type: 'SYRICS_REQUEST_AUTH_INFO' }, '*');

      // Listen for response
      const handler = (event) => {
        if (event.source === window && event.data.type === 'SYRICS_AUTH_INFO') {
          window.removeEventListener('message', handler);
          resolve(event.data.authInfo);
        }
      };

      window.addEventListener('message', handler);

      // Timeout after 5 seconds
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(null);
      }, 5000);
    });
  }

  showNotification(message, type = 'info') {
    // Remove existing notification
    const existing = document.querySelector('.syrics-notification');
    if (existing) {
      existing.remove();
    }

    const notification = document.createElement('div');
    notification.className = `syrics-notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Trigger animation
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);

    // Auto remove after 4 seconds
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    }, 4000);
  }

  handleTrackInfo(trackInfo) {
    console.log('Syrics Extension: Received track info:', trackInfo);
  }
}

// Initialize the extension
new SyricsExtension();