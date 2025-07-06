// Shared types for the Syrics extension

export interface TrackInfo {
  id: string;
  name: string;
  artists: string;
  album: string;
  duration_ms: number;
  external_urls: {
    spotify: string;
  };
}

export interface AuthInfo {
  accessToken?: string;
  spDc?: string;
  tokenAge?: number;
}

export interface LyricsLine {
  startTimeMs: string;
  words: string;
  syllables?: Array<{
    startTimeMs: string;
    numChars: number;
  }>;
}

export interface LyricsData {
  lyrics: {
    syncType: 'LINE_SYNCED' | 'UNSYNCED';
    lines: LyricsLine[];
    provider: string;
    providerLyricsId: string;
    providerDisplayName: string;
    syncLyricsUri?: string;
    isDenseTypeface?: boolean;
    alternatives?: any[];
    language: string;
    isRtlLanguage: boolean;
    fullscreenAction: string;
  };
  colors: {
    background: number;
    text: number;
    highlightText: number;
  };
  hasVocalRemoval: boolean;
}

export interface DownloadLyricsRequest {
  action: 'downloadLyrics';
  trackInfo: TrackInfo;
  authInfo: AuthInfo;
}

export interface GetTrackDetailsRequest {
  action: 'getTrackDetails';
  trackId: string;
  authInfo: AuthInfo;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface LyricsDownloadResponse {
  success: boolean;
  lrcContent?: string;
  filename?: string;
  trackInfo?: TrackInfo;
  error?: string;
}

export interface TrackDetailsResponse {
  success: boolean;
  trackInfo?: TrackInfo;
  error?: string;
}

export interface AuthenticationStatus {
  hasAuth: boolean;
  details: {
    interceptedToken?: boolean;
    cookies?: boolean;
    tokenAge?: number;
  };
}

// Chrome extension message types
export type ExtensionMessage = 
  | DownloadLyricsRequest 
  | GetTrackDetailsRequest;

// Content script to injected script messages
export interface ContentToInjectedMessage {
  type: 'SYRICS_TRACK_ROW_CLICKED';
  trackRow: {
    innerHTML: string;
    trackId: string | null;
  };
}

// Injected script to content script messages
export interface InjectedToContentMessage {
  type: 'SYRICS_AUTH_INFO' | 'SYRICS_CURRENT_TRACK' | 'SYRICS_DOWNLOAD_LYRICS';
  data: any;
}

// TOTP configuration
export interface TOTPConfig {
  secret: Uint8Array;
  version: number;
  period: number;
  digits: number;
}
