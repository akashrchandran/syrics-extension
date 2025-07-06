import { AuthInfo, TrackInfo } from '@/types';

/**
 * Injected script that runs in the page context to access Spotify's internal state
 */
class SyricsInjectedScript {
  private authInfo: AuthInfo = {};
  private currentTrack: TrackInfo | null = null;
  private accessTokenInterceptor: any = null;

  constructor() {
    this.init();
  }

  private init(): void {
    this.setupMessageListener();
    this.interceptNetworkRequests();
    this.setupPeriodicChecks();
    console.log('Syrics: Injected script initialized');
  }

  private setupMessageListener(): void {
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;

      switch (event.data.type) {
        case 'SYRICS_GET_AUTH_INFO':
          this.sendAuthInfo();
          break;
        case 'SYRICS_GET_CURRENT_TRACK':
          this.sendCurrentTrack();
          break;
        case 'SYRICS_TRACK_ROW_CLICKED':
          // Store the clicked track info for potential use
          break;
      }
    });
  }

  private interceptNetworkRequests(): void {
    // Intercept XMLHttpRequest
    this.interceptXHR();
    // Intercept fetch
    this.interceptFetch();
  }

  private interceptXHR(): void {
    const self = this;
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method: string, url: string | URL, async: boolean = true, username?: string | null, password?: string | null) {
      (this as any)._url = url;
      return originalOpen.apply(this, [method, url, async, username, password]);
    };

    XMLHttpRequest.prototype.send = function(data) {
      this.addEventListener('readystatechange', () => {
        if (this.readyState === 4 && this.status === 200) {
          const url = (this as any)._url;
          if (url && typeof url === 'string') {
            self.extractAuthFromHeaders();
          }
        }
      });

      return originalSend.apply(this, [data]);
    };
  }

  private interceptFetch(): void {
    const originalFetch = window.fetch;
    
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const response = await originalFetch(...args);
      
      // Clone response to avoid consuming it
      const clonedResponse = response.clone();
      
      try {
        const url = args[0] as string;
        if (url && typeof url === 'string') {
          this.extractAuthFromRequest(args);
        }
      } catch (error) {
        // Ignore errors in auth extraction
      }
      
      return response;
    };
  }

  private extractAuthFromHeaders(): void {
    // Try to extract auth info from network requests
    const authHeader = this.getAuthHeaderFromRequests();
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      this.authInfo.accessToken = token;
      this.authInfo.tokenAge = 0; // Fresh token
    }
  }

  private extractAuthFromRequest(args: Parameters<typeof fetch>): void {
    try {
      const [url, options] = args;
      
      if (options?.headers) {
        const headers = options.headers as Record<string, string>;
        const authHeader = headers['Authorization'] || headers['authorization'];
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.replace('Bearer ', '');
          this.authInfo.accessToken = token;
          this.authInfo.tokenAge = 0; // Fresh token
        }
      }
    } catch (error) {
      // Ignore errors
    }
  }

  private getAuthHeaderFromRequests(): string | null {
    // This is a simplified version - in practice, you'd need to intercept
    // actual network requests to get the Authorization header
    return null;
  }

  private setupPeriodicChecks(): void {
    // Check for current track and auth info periodically
    setInterval(() => {
      this.updateCurrentTrack();
      this.updateAuthFromCookies();
    }, 5000);

    // Initial check
    setTimeout(() => {
      this.updateCurrentTrack();
      this.updateAuthFromCookies();
    }, 1000);
  }

  private updateCurrentTrack(): void {
    try {
      // Try to get current track from Spotify's player state
      const trackInfo = this.getCurrentTrackFromPlayer();
      if (trackInfo) {
        this.currentTrack = trackInfo;
      }
    } catch (error) {
      // Ignore errors
    }
  }

  private getCurrentTrackFromPlayer(): TrackInfo | null {
    try {
      // Try to access Spotify's player state
      // This is a simplified version - actual implementation would depend on
      // Spotify's current architecture
      
      // Method 1: Try to get from URL
      const trackIdFromUrl = this.getTrackIdFromCurrentUrl();
      if (trackIdFromUrl) {
        return {
          id: trackIdFromUrl,
          name: '',
          artists: '',
          album: '',
          duration_ms: 0,
          external_urls: { spotify: window.location.href }
        };
      }

      // Method 2: Try to get from DOM
      const trackFromDOM = this.getTrackFromCurrentDOM();
      if (trackFromDOM) {
        return trackFromDOM;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  private getTrackIdFromCurrentUrl(): string | null {
    const match = window.location.href.match(/\/track\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }

  private getTrackFromCurrentDOM(): TrackInfo | null {
    try {
      // Look for currently playing track in the DOM
      const nowPlayingBar = document.querySelector('[data-testid="now-playing-widget"]');
      if (!nowPlayingBar) return null;

      const trackLink = nowPlayingBar.querySelector('a[href*="/track/"]') as HTMLAnchorElement;
      if (!trackLink) return null;

      const trackIdMatch = trackLink.href.match(/\/track\/([a-zA-Z0-9]+)/);
      if (!trackIdMatch) return null;

      const trackName = nowPlayingBar.querySelector('[data-testid="context-item-link"]')?.textContent || '';
      const artistName = nowPlayingBar.querySelector('[data-testid="context-item-info-artist"]')?.textContent || '';

      return {
        id: trackIdMatch[1],
        name: trackName,
        artists: artistName,
        album: '',
        duration_ms: 0,
        external_urls: { spotify: trackLink.href }
      };
    } catch (error) {
      return null;
    }
  }

  private updateAuthFromCookies(): void {
    try {
      // Get sp_dc cookie
      const spDcCookie = this.getCookie('sp_dc');
      if (spDcCookie) {
        this.authInfo.spDc = spDcCookie;
      }
    } catch (error) {
      // Ignore errors
    }
  }

  private getCookie(name: string): string | null {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      const cookieValue = parts.pop()?.split(';').shift();
      return cookieValue || null;
    }
    return null;
  }

  private sendAuthInfo(): void {
    window.postMessage({
      type: 'SYRICS_AUTH_INFO',
      data: this.authInfo
    }, '*');
  }

  private sendCurrentTrack(): void {
    window.postMessage({
      type: 'SYRICS_CURRENT_TRACK',
      data: this.currentTrack
    }, '*');
  }
}

// Initialize the injected script
new SyricsInjectedScript();
