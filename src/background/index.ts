// ...existing code...
/// <reference path="../types/chrome.d.ts" />

import { 
  ExtensionMessage, 
  DownloadLyricsRequest, 
  GetTrackDetailsRequest,
  LyricsDownloadResponse,
  TrackDetailsResponse,
  TrackInfo,
  AuthInfo
} from '@/types';
import { SyricsAPIService } from '@/services/syricsApi';

class BackgroundService {
  private syricsAPI: SyricsAPIService;

  constructor() {
    this.syricsAPI = new SyricsAPIService();
    this.setupMessageListener();
    console.log('Syrics Extension: Background service initialized');
  }

  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener(
      (
        request: ExtensionMessage,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: any) => void
      ) => {
        if (request.action === 'downloadLyrics') {
          this.handleDownloadLyrics(request)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
          return true; // Keep message channel open for async response
        }
        
        if (request.action === 'getTrackDetails') {
          this.handleGetTrackDetails(request)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
          return true; // Keep message channel open for async response
        }
      }
    );
  }

  private async handleGetTrackDetails(
    request: GetTrackDetailsRequest
  ): Promise<TrackDetailsResponse> {
    try {
      console.log('Handling track details request for:', request.trackId);
      
      if (!request.trackId) {
        throw new Error('No track ID provided');
      }

      if (!request.authInfo?.accessToken) {
        throw new Error('No authentication information provided');
      }

      // Get track details from Spotify Web API
      const trackDetails = await this.syricsAPI.getTrackDetails(
        request.trackId,
        request.authInfo.accessToken
      );
      
      console.log('Fetched track details:', trackDetails);
      
      return { 
        success: true, 
        trackInfo: trackDetails
      };
    } catch (error) {
      console.error('Track details fetch error:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  private async handleDownloadLyrics(
    request: DownloadLyricsRequest
  ): Promise<LyricsDownloadResponse> {
    try {
      console.log('Handling lyrics download request:', request.trackInfo, request.authInfo);
      
      let finalTrackInfo = request.trackInfo;
      
      // If track info is incomplete, try to fetch from API
      if (this.isTrackInfoIncomplete(request.trackInfo) && request.authInfo?.accessToken) {
        console.log('Track info incomplete, fetching from Spotify API...');
        
        try {
          const completeTrackInfo = await this.syricsAPI.getTrackDetails(
            request.trackInfo.id,
            request.authInfo.accessToken
          );
          finalTrackInfo = completeTrackInfo;
          console.log('Updated track info from API:', finalTrackInfo);
        } catch (apiError) {
          console.warn('Could not fetch complete track info from API:', (apiError as Error).message);
          // Continue with original track info
        }
      }
      
      if (!finalTrackInfo?.id) {
        throw new Error('Invalid track information');
      }

      if (!request.authInfo || (!request.authInfo.accessToken && !request.authInfo.spDc)) {
        throw new Error('No authentication information provided');
      }

      console.log('Fetching lyrics for:', finalTrackInfo);

      // Get lyrics from Spotify
      const lyricsData = await this.syricsAPI.getLyrics(finalTrackInfo.id, request.authInfo);
      
      // Format lyrics and generate filename
      const { lrcContent, filename } = this.syricsAPI.formatLyricsForDownload(
        lyricsData,
        finalTrackInfo
      );

      // Return the lyrics data back to content script for download
      return { 
        success: true, 
        lrcContent,
        filename,
        trackInfo: finalTrackInfo
      };
    } catch (error) {
      console.error('Lyrics fetch error:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  private isTrackInfoIncomplete(trackInfo: TrackInfo): boolean {
    return !trackInfo.name || 
           !trackInfo.artists || 
           trackInfo.name.trim() === '' || 
           trackInfo.artists.trim() === '';
  }
}

// Initialize the background service
new BackgroundService();
