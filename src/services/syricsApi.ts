import { TrackInfo, LyricsData, AuthInfo } from '@/types';
import { TOTP } from '@/utils/totp';
import { Formatter, retry } from '@/utils/helpers';

/**
 * Service for handling Spotify API interactions and lyrics fetching
 */
export class SyricsAPIService {
  private totp: TOTP;
  private token: string | null = null;
  private spdc: string | null = null;

  constructor() {
    this.totp = new TOTP();
  }

  /**
   * Get track details from Spotify Web API
   */
  async getTrackDetails(trackId: string, accessToken: string): Promise<TrackInfo> {
    const trackUrl = `https://api.spotify.com/v1/tracks/${trackId}`;
    
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
      artists: trackData.artists.map((artist: any) => artist.name).join(', '),
      album: trackData.album.name,
      duration_ms: trackData.duration_ms,
      external_urls: {
        spotify: trackData.external_urls.spotify
      }
    };
  }

  /**
   * Get lyrics for a track using available authentication
   */
  async getLyrics(trackId: string, authInfo: AuthInfo): Promise<LyricsData> {
    // Prioritize intercepted access token from Spotify requests
    if (authInfo?.accessToken) {
      console.log('Using intercepted Spotify access token');
      return await this.getLyricsWithToken(trackId, authInfo.accessToken);
    }

    // Fallback to sp_dc cookie method if no access token available
    if (authInfo?.spDc) {
      console.log('Falling back to sp_dc authentication');
      this.spdc = authInfo.spDc;
      await this.authenticate();
      return await this.getLyricsWithToken(trackId, this.token!);
    }

    throw new Error('No valid authentication information found. Please make sure you are logged into Spotify and the page has loaded completely.');
  }

  /**
   * Get lyrics using an access token
   */
  private async getLyricsWithToken(trackId: string, accessToken: string): Promise<LyricsData> {
    const lyricsUrl = `https://spclient.wg.spotify.com/color-lyrics/v2/track/${trackId}?format=json&market=from_token`;
    
    const response = await retry(async () => {
      const res = await fetch(lyricsUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'App-platform': 'WebPlayer',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Spotify access token is invalid or expired. Please refresh the page.');
        } else if (res.status === 404) {
          throw new Error('No lyrics found for this track.');
        } else {
          throw new Error(`Failed to fetch lyrics: ${res.status} ${res.statusText}`);
        }
      }

      return res;
    }, 3, 1000);

    const lyricsData = await response.json();
    console.log('Fetched lyrics data:', lyricsData);

    // Check if lyrics exist
    if (!lyricsData.lyrics?.lines) {
      throw new Error('No lyrics available for this track.');
    }
    
    return lyricsData;
  }

  /**
   * Authenticate using sp_dc cookie
   */
  private async authenticate(): Promise<void> {
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
  }

  /**
   * Format lyrics and generate filename
   */
  formatLyricsForDownload(lyricsData: LyricsData, trackInfo: TrackInfo): { 
    lrcContent: string; 
    filename: string; 
  } {
    const lrcContent = Formatter.formatLyrics(lyricsData, trackInfo);
    const filename = Formatter.generateFilename(trackInfo);
    
    return { lrcContent, filename };
  }
}
