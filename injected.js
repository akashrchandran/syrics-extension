// Syrics Extension - Injected Script
// Runs in the same context as Spotify's JavaScript to intercept authentication tokens

(function() {
  'use strict';

  console.log('Syrics Extension: Injected script loaded');

  // Global variable to store intercepted access token
  let interceptedAccessToken = null;
  let lastTokenTime = 0;

  // Storage keys for the token
  const STORAGE_KEY = 'syrics_spotify_token';
  const STORAGE_TIME_KEY = 'syrics_token_time';

  // Function to save token to storage
  async function saveTokenToStorage(token, timestamp) {
    try {
      // Calculate expiration time (45 minutes from now, as Spotify tokens typically last 1 hour)
      const expirationTime = timestamp + (45 * 60 * 1000);
      
      const tokenData = {
        token: token,
        timestamp: timestamp,
        expirationTime: expirationTime
      };
      
      // Use extension storage if available, otherwise localStorage
      if (window.chrome && chrome.storage) {
        await chrome.storage.local.set({
          [STORAGE_KEY]: tokenData
        });
      } else {
        // Fallback to localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tokenData));
      }
      
      console.log('Syrics: Token saved to storage, expires at:', new Date(expirationTime).toLocaleTimeString());
    } catch (error) {
      console.error('Syrics: Failed to save token to storage:', error);
    }
  }

  // Function to load token from storage
  async function loadTokenFromStorage() {
    try {
      let tokenData = null;
      
      // Try extension storage first
      if (window.chrome && chrome.storage) {
        const result = await chrome.storage.local.get([STORAGE_KEY]);
        tokenData = result[STORAGE_KEY];
      } else {
        // Fallback to localStorage
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          tokenData = JSON.parse(stored);
        }
      }
      
      if (tokenData) {
        const now = Date.now();
        
        // Check if token is still valid
        if (now < tokenData.expirationTime) {
          interceptedAccessToken = tokenData.token;
          lastTokenTime = tokenData.timestamp;
          console.log('Syrics: Loaded valid token from storage');
          return true;
        } else {
          // Token expired, clean up
          console.log('Syrics: Stored token expired, cleaning up');
          await clearTokenFromStorage();
        }
      }
      
      return false;
    } catch (error) {
      console.error('Syrics: Failed to load token from storage:', error);
      return false;
    }
  }

  // Function to clear token from storage
  async function clearTokenFromStorage() {
    try {
      if (window.chrome && chrome.storage) {
        await chrome.storage.local.remove([STORAGE_KEY]);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
      
      interceptedAccessToken = null;
      lastTokenTime = 0;
    } catch (error) {
      console.error('Syrics: Failed to clear token from storage:', error);
    }
  }

  // Function to intercept network requests and extract access token
  function setupRequestInterception() {
    // Load any existing valid token from storage first
    loadTokenFromStorage();
    
    // Intercept XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
      if (header.toLowerCase() === 'authorization' && value) {
        const token = extractTokenFromAuthHeader(value);
        if (token && token !== interceptedAccessToken) {
          interceptedAccessToken = token;
          lastTokenTime = Date.now();
          saveTokenToStorage(token, lastTokenTime);
          console.log('Syrics: Intercepted and saved new access token from XHR');
        }
      }
      return originalSetRequestHeader.call(this, header, value);
    };

    // Intercept fetch requests
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const [url, options] = args;
      
      if (options && options.headers) {
        const headers = options.headers;
        let authHeader = null;
        
        // Handle different header formats
        if (headers instanceof Headers) {
          authHeader = headers.get('authorization') || headers.get('Authorization');
        } else if (typeof headers === 'object') {
          authHeader = headers.authorization || headers.Authorization;
        }
        
        if (authHeader) {
          const token = extractTokenFromAuthHeader(authHeader);
          if (token && token !== interceptedAccessToken) {
            interceptedAccessToken = token;
            lastTokenTime = Date.now();
            saveTokenToStorage(token, lastTokenTime);
            console.log('Syrics: Intercepted and saved new access token from fetch');
          }
        }
      }
      
      return originalFetch.apply(this, args);
    };

    console.log('Syrics: Request interception setup complete');
  }

  // Function to extract token from authorization header
  function extractTokenFromAuthHeader(authHeader) {
    try {
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '');
        // Validate token format (Spotify tokens are usually long alphanumeric strings)
        if (token.length > 50 && token.match(/^[A-Za-z0-9\-_.]+$/)) {
          return token;
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  // Function to get the intercepted access token
  function getSpotifyAccessToken() {
    try {
      // Return intercepted token if it's recent (less than 30 minutes old)
      if (interceptedAccessToken && (Date.now() - lastTokenTime) < 30 * 60 * 1000) {
        return interceptedAccessToken;
      }
      
      // Check if token is still in valid range but older than 30 minutes
      if (interceptedAccessToken && (Date.now() - lastTokenTime) < 45 * 60 * 1000) {
        console.log('Syrics: Using stored token (older than 30 minutes but still valid)');
        return interceptedAccessToken;
      }
      
      // Token is too old or doesn't exist, try to load from storage
      loadTokenFromStorage().then(loaded => {
        if (!loaded) {
          // Try to trigger a request to get a fresh token
          triggerTokenRefresh();
        }
      });
      
      return interceptedAccessToken;
    } catch (error) {
      console.error('Error getting access token:', error);
      return null;
    }
  }

  // Function to trigger a request that will contain authorization header
  function triggerTokenRefresh() {
    try {
      // Try to trigger Spotify API calls that would include auth headers
      // This is a lightweight request that Spotify makes frequently
      if (window.location.hostname === 'open.spotify.com') {
        // Trigger any existing Spotify API calls that might refresh the token
        const event = new Event('focus');
        window.dispatchEvent(event);
      }
    } catch (error) {
      // Ignore errors, this is just a trigger attempt
    }
  }

  // Function to get sp_dc cookie from browser cookies
  function getSpDcCookie() {
    try {
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'sp_dc' && value) {
          return value;
        }
      }
      return null;
    } catch (error) {
      console.error('Error extracting sp_dc cookie:', error);
      return null;
    }
  }

  // Listen for requests from content script
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;

    if (event.data.type === 'SYRICS_REQUEST_AUTH_INFO') {
      const accessToken = getSpotifyAccessToken();
      const spDc = getSpDcCookie();
      
      // Calculate token freshness
      const tokenAge = interceptedAccessToken ? (Date.now() - lastTokenTime) / 1000 : null;
      const isTokenFresh = tokenAge ? tokenAge < 1800 : false; // Less than 30 minutes
      const isTokenValid = tokenAge ? tokenAge < 2700 : false; // Less than 45 minutes
      
      window.postMessage({
        type: 'SYRICS_AUTH_INFO',
        authInfo: {
          accessToken: accessToken,
          spDc: spDc,
          hasInterceptedToken: !!interceptedAccessToken,
          tokenAge: tokenAge,
          isTokenFresh: isTokenFresh,
          isTokenValid: isTokenValid,
          tokenSource: interceptedAccessToken ? 'intercepted' : 'none'
        }
      }, '*');
    }
  });

  // Initialize request interception
  setupRequestInterception();

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    // Keep the token in storage for future page loads
    // Only clear if we have a very old token (older than 45 minutes)
    if (interceptedAccessToken && (Date.now() - lastTokenTime) > 45 * 60 * 1000) {
      clearTokenFromStorage();
    }
  });

  // Periodic token validation (every 5 minutes)
  setInterval(async () => {
    if (interceptedAccessToken) {
      const tokenAge = (Date.now() - lastTokenTime) / 1000 / 60; // age in minutes
      
      if (tokenAge > 45) {
        console.log('Syrics: Token expired, clearing from storage');
        await clearTokenFromStorage();
      } else if (tokenAge > 30) {
        console.log('Syrics: Token is getting old, will be refreshed on next request');
      }
    }
  }, 5 * 60 * 1000); // Check every 5 minutes

  console.log('Syrics Extension: Token interception initialized');
})();
