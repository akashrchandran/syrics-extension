// ...existing code...

/// <reference path="../types/chrome.d.ts" />

interface AuthStatus {
  hasAuth: boolean;
  details: {
    interceptedToken?: boolean;
    cookies?: boolean;
    tokenAge?: number;
  };
}

class PopupController {
  private testButton: HTMLButtonElement;
  private statusDiv: HTMLDivElement;

  constructor() {
    this.testButton = document.getElementById('testButton') as HTMLButtonElement;
    this.statusDiv = document.getElementById('status') as HTMLDivElement;
    
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.testButton.addEventListener('click', () => this.handleTest());
  }

  private async handleTest(): Promise<void> {
    this.setLoadingState(true);

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      
      if (!activeTab.url?.includes('open.spotify.com')) {
        throw new Error('Please navigate to open.spotify.com and try again');
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id! },
        function: checkSpotifyAuth
      });

      const authResult = results[0].result as AuthStatus;
      
      if (authResult.hasAuth) {
        let statusMessage = '✓ Extension is working! You can now download lyrics from Spotify tracks.';
        
        if (authResult.details.interceptedToken) {
          const tokenAge = authResult.details.tokenAge || 0;
          if (tokenAge < 1800) {
            statusMessage += ' (Fresh token intercepted)';
          } else if (tokenAge < 2700) {
            statusMessage += ' (Token available but aging)';
          } else {
            statusMessage += ' (Token expired - refresh needed)';
          }
        } else if (authResult.details.cookies) {
          statusMessage += ' (Using cookies - token will be intercepted on next Spotify request)';
        }
        
        this.showStatus(statusMessage, 'success');
      } else {
        this.showStatus('Please make sure you are logged into Spotify Web Player and try again.', 'warning');
      }
    } catch (error) {
      this.showStatus((error as Error).message, 'error');
    } finally {
      this.setLoadingState(false);
    }
  }

  private setLoadingState(isLoading: boolean): void {
    this.testButton.disabled = isLoading;
    this.testButton.textContent = isLoading ? 'Testing...' : 'Test Extension';
  }

  private showStatus(message: string, type: 'success' | 'warning' | 'error'): void {
    this.statusDiv.textContent = message;
    this.statusDiv.className = `status ${type}`;
    this.statusDiv.style.display = 'block';
  }
}

// Function to be injected into the active tab
function checkSpotifyAuth(): AuthStatus {
  const result: AuthStatus = {
    hasAuth: false,
    details: {}
  };

  try {
    const cookies = document.cookie;
    const hasSpDc = cookies.includes('sp_dc=');
    result.details.cookies = hasSpDc;

    const isLoggedIn = document.querySelector('[data-testid="user-widget-link"]') !== null;
    
    result.hasAuth = hasSpDc && isLoggedIn;
    result.details.interceptedToken = false;

    return result;
  } catch (error) {
    console.error('Auth check error:', error);
    return result;
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
