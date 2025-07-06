// Syrics Extension - Popup Script
// Handles the extension popup interface

document.addEventListener('DOMContentLoaded', async () => {
  const testButton = document.getElementById('testButton');
  const status = document.getElementById('status');

  testButton.addEventListener('click', handleTest);

  async function handleTest() {
    setLoadingState(testButton, 'Testing...');

    try {
      // Check if user is on Spotify
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      
      if (!activeTab.url.includes('open.spotify.com')) {
        throw new Error('Please navigate to open.spotify.com and try again');
      }

      // Test by trying to inject a script to check authentication
      const results = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        function: checkSpotifyAuth
      });

      const authResult = results[0].result;
      
      if (authResult.hasAuth) {
        let statusMessage = '✓ Extension is working! You can now download lyrics from Spotify tracks.';
        
        if (authResult.details.interceptedToken) {
          const tokenAge = authResult.details.tokenAge;
          if (tokenAge < 1800) { // Less than 30 minutes
            statusMessage += ' (Fresh token intercepted)';
          } else if (tokenAge < 2700) { // Less than 45 minutes
            statusMessage += ' (Token available but aging)';
          } else {
            statusMessage += ' (Token expired - refresh needed)';
          }
        } else if (authResult.details.cookies) {
          statusMessage += ' (Using cookies - token will be intercepted on next Spotify request)';
        }
        
        showStatus(statusMessage, 'success');
      } else {
        showStatus('Please make sure you are logged into Spotify Web Player and try again.', 'warning');
      }
    } catch (error) {
      console.error('Test error:', error);
      showStatus(`Test failed: ${error.message}`, 'error');
    } finally {
      clearLoadingState(testButton, 'Test Extension');
    }
  }

  function checkSpotifyAuth() {
    // This function runs in the Spotify page context
    const hasLocalStorage = !!localStorage.length;
    const hasSessionStorage = !!sessionStorage.length;
    const isLoggedIn = document.cookie.includes('sp_dc');
    
    // Check if our injected script is running and has intercepted tokens
    let hasInterceptedToken = false;
    let tokenAge = null;
    
    try {
      // Try to communicate with our injected script
      window.postMessage({ type: 'SYRICS_REQUEST_AUTH_INFO' }, '*');
      
      // Wait briefly for response (this is a simplified check)
      const authCheckInterval = setInterval(() => {
        window.addEventListener('message', (event) => {
          if (event.data.type === 'SYRICS_AUTH_INFO') {
            hasInterceptedToken = !!event.data.authInfo.accessToken;
            tokenAge = event.data.authInfo.tokenAge;
            clearInterval(authCheckInterval);
          }
        });
      }, 100);
    } catch (e) {
      // Injected script might not be ready yet
    }
    
    return {
      hasAuth: hasLocalStorage || hasSessionStorage || isLoggedIn || hasInterceptedToken,
      details: {
        localStorage: hasLocalStorage,
        sessionStorage: hasSessionStorage,
        cookies: isLoggedIn,
        interceptedToken: hasInterceptedToken,
        tokenAge: tokenAge
      }
    };
  }

  function setLoadingState(button, loadingText) {
    button.disabled = true;
    button.innerHTML = `<span class="loading"></span>${loadingText}`;
  }

  function clearLoadingState(button, originalText) {
    button.disabled = false;
    button.textContent = originalText;
  }

  function showStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type}`;
    status.classList.remove('hidden');
  }

  function hideStatus() {
    status.classList.add('hidden');
  }
});
