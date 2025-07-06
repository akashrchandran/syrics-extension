// Syrics Extension - Background Script
// Handles lyrics downloading and API communication

// TOTP implementation for Spotify authentication
class TOTP {
  constructor() {
    this.secret = new Uint8Array([52, 52, 57, 52, 52, 51, 54, 52, 57, 48, 56, 52, 56, 56, 54, 51, 50, 56, 56, 57, 51, 53, 51, 52, 53, 55, 49, 48, 52, 49, 51, 49, 53]);
    this.version = 8;
    this.period = 30;
    this.digits = 6;
  }

  async generate(timestamp) {
    const counter = Math.floor(timestamp / 1000 / this.period);
    const counterBytes = new ArrayBuffer(8);
    const counterView = new DataView(counterBytes);
    counterView.setUint32(4, counter, false); // Big endian

    const key = await crypto.subtle.importKey(
      'raw',
      this.secret,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, counterBytes);
    const hmacResult = new Uint8Array(signature);

    const offset = hmacResult[hmacResult.length - 1] & 0x0f;
    const binary = (
      ((hmacResult[offset] & 0x7f) << 24) |
      ((hmacResult[offset + 1] & 0xff) << 16) |
      ((hmacResult[offset + 2] & 0xff) << 8) |
      (hmacResult[offset + 3] & 0xff)
    );

    return String(binary % Math.pow(10, this.digits)).padStart(this.digits, '0');
  }
}

class SyricsAPI {
  constructor() {
    this.totp = new TOTP();
    this.token = null;
    this.spdc = null;
  }

  async getTrackDetails(trackId, accessToken) {
    const trackUrl = `https://api.spotify.com/v1/tracks/${trackId}`;
    
    try {
      const response = await fetch(trackUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Spotify access token is invalid or expired. Please refresh the page.');
        } else if (response.status === 404) {
          throw new Error('Track not found.');
        } else {
          throw new Error(`Failed to fetch track details: ${response.status} ${response.statusText}`);
        }
      }

      const trackData = await response.json();
      
      // Convert Spotify API response to our format
      return {
        id: trackData.id,
        name: trackData.name,
        artists: trackData.artists.map(artist => artist.name).join(', '),
        album: trackData.album.name,
        duration_ms: trackData.duration_ms,
        external_urls: {
          spotify: trackData.external_urls.spotify
        }
      };
    } catch (error) {
      console.error('Error fetching track details from API:', error);
      throw error;
    }
  }

  async getLyrics(trackId, authInfo) {
    try {
      // Prioritize intercepted access token from Spotify requests
      if (authInfo && authInfo.accessToken) {
        console.log('Using intercepted Spotify access token');
        return await this.getLyricsWithToken(trackId, authInfo.accessToken);
      }

      // Fallback to sp_dc cookie method if no access token available
      if (authInfo && authInfo.spDc) {
        console.log('Falling back to sp_dc authentication');
        this.spdc = authInfo.spDc;
        await this.authenticate();
        return await this.getLyricsWithToken(trackId, this.token);
      }

      throw new Error('No valid authentication information found. Please make sure you are logged into Spotify and the page has loaded completely.');
    } catch (error) {
      console.error('Error fetching lyrics:', error);
      throw error;
    }
  }

  async getLyricsWithToken(trackId, accessToken) {
    const lyricsUrl = `https://spclient.wg.spotify.com/color-lyrics/v2/track/${trackId}?format=json&market=from_token`;
    
    try {
      const response = await fetch(lyricsUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'App-platform': 'WebPlayer',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Spotify access token is invalid or expired. Please refresh the page.');
        } else if (response.status === 404) {
          throw new Error('No lyrics found for this track.');
        } else {
          throw new Error(`Failed to fetch lyrics: ${response.status} ${response.statusText}`);
        }
      }

      const lyricsData = await response.json();
      console.log("Fetched data" + lyricsData)
      // Check if lyrics exist
      if (!lyricsData.lyrics || !lyricsData.lyrics.lines) {
        throw new Error('No lyrics available for this track.');
      }
      
      return lyricsData;
    } catch (error) {
      if (error.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to Spotify servers.');
      }
      throw error;
    }
  }

  async authenticate() {
    try {
      if (!this.spdc) {
        throw new Error('No sp_dc cookie found');
      }

      // Get server time
      const serverTimeResponse = await fetch('https://open.spotify.com/api/server-time');
      const serverTimeData = await serverTimeResponse.json();
      const serverTime = serverTimeData.serverTime * 1000;

      // Generate TOTP
      const totp = await this.totp.generate(serverTime);

      // Get access token
      const tokenUrl = new URL('https://open.spotify.com/api/token');
      tokenUrl.searchParams.set('reason', 'init');
      tokenUrl.searchParams.set('productType', 'web-player');
      tokenUrl.searchParams.set('totp', totp);
      tokenUrl.searchParams.set('totpVer', String(this.totp.version));
      tokenUrl.searchParams.set('ts', String(serverTime));

      const tokenResponse = await fetch(tokenUrl, {
        headers: {
          'Cookie': `sp_dc=${this.spdc}`,
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to authenticate with Spotify');
      }

      const tokenData = await tokenResponse.json();
      this.token = tokenData.accessToken;
      
      return true;
    } catch (error) {
      console.error('Authentication error:', error);
      throw error;
    }
  }

  formatLyrics(lyricsData, trackInfo) {
    if (!lyricsData || !lyricsData.lyrics) {
      throw new Error('No lyrics found for this track');
    }

    const lyrics = lyricsData.lyrics.lines;
    const minutes = Math.floor(trackInfo.duration_ms / 1000 / 60);
    const seconds = Math.floor((trackInfo.duration_ms / 1000) % 60);

    let lrcContent = [
      `[ti:${trackInfo.name}]`,
      `[ar:${trackInfo.artists}]`,
      `[al:${trackInfo.album || ''}]`,
      `[length:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`,
      ''
    ];

    for (const line of lyrics) {
      if (lyricsData.lyrics.syncType === 'UNSYNCED' || !line.startTimeMs) {
        lrcContent.push(line.words);
      } else {
        const duration = parseInt(line.startTimeMs);
        const lineMinutes = Math.floor(duration / 1000 / 60);
        const lineSeconds = ((duration / 1000) % 60).toFixed(2);
        lrcContent.push(`[${lineMinutes.toString().padStart(2, '0')}:${lineSeconds.padStart(5, '0')}] ${line.words}`);
      }
    }

    return lrcContent.join('\n');
  }

  sanitizeFilename(filename) {
    return filename.replace(/[\\/*?:"<>|]/g, '');
  }
}

const syricsAPI = new SyricsAPI();

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadLyrics') {
    handleDownloadLyrics(request.trackInfo, request.authInfo)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'getTrackDetails') {
    handleGetTrackDetails(request.trackId, request.authInfo)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
});

async function handleGetTrackDetails(trackId, authInfo) {
  try {
    console.log('Handling track details request for:', trackId);
    
    if (!trackId) {
      throw new Error('No track ID provided');
    }

    if (!authInfo || !authInfo.accessToken) {
      throw new Error('No authentication information provided');
    }

    // Get track details from Spotify Web API
    const trackDetails = await syricsAPI.getTrackDetails(trackId, authInfo.accessToken);
    
    console.log('Fetched track details:', trackDetails);
    
    return { 
      success: true, 
      trackInfo: trackDetails
    };
  } catch (error) {
    console.error('Track details fetch error:', error);
    return { success: false, error: error.message };
  }
}

async function handleDownloadLyrics(trackInfo, authInfo) {
  try {
    console.log('Handling lyrics download request:', trackInfo, authInfo);
    
    let finalTrackInfo = trackInfo;
    
    // If track info is incomplete (missing name or artists), try to fetch from API
    if (trackInfo && trackInfo.id && (!trackInfo.name || !trackInfo.artists || trackInfo.name.trim() === '' || trackInfo.artists.trim() === '')) {
      console.log('Track info incomplete, fetching from Spotify API...');
      
      if (authInfo && authInfo.accessToken) {
        try {
          const completeTrackInfo = await syricsAPI.getTrackDetails(trackInfo.id, authInfo.accessToken);
          finalTrackInfo = completeTrackInfo;
          console.log('Updated track info from API:', finalTrackInfo);
        } catch (apiError) {
          console.warn('Could not fetch complete track info from API, using provided info:', apiError.message);
          // Continue with original track info
        }
      }
    }
    
    if (!finalTrackInfo || !finalTrackInfo.id) {
      throw new Error('Invalid track information');
    }

    if (!authInfo || (!authInfo.accessToken && !authInfo.spDc)) {
      throw new Error('No authentication information provided');
    }

    console.log('Fetching lyrics for:', finalTrackInfo);

    // Get lyrics from Spotify
    const lyricsData = await syricsAPI.getLyrics(finalTrackInfo.id, authInfo);
    
    // Format lyrics as LRC
    const lrcContent = syricsAPI.formatLyrics(lyricsData, finalTrackInfo);
    
    // Create filename - ensure we have valid names
    const artistName = finalTrackInfo.artists || 'Unknown Artist';
    const trackName = finalTrackInfo.name || 'Unknown Track';
    
    const filename = syricsAPI.sanitizeFilename(
      `${artistName} - ${trackName}.lrc`
    );

    // Return the lyrics data back to content script for download
    return { 
      success: true, 
      lrcContent: lrcContent,
      filename: filename,
      trackInfo: finalTrackInfo
    };
  } catch (error) {
    console.error('Lyrics fetch error:', error);
    return { success: false, error: error.message };
  }
}

console.log('Syrics Extension: Background script loaded');
