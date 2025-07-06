import { TrackInfo, LyricsData } from '@/types';

/**
 * Utility functions for formatting and processing data
 */
export class Formatter {
  /**
   * Format lyrics data into LRC format
   */
  static formatLyrics(lyricsData: LyricsData, trackInfo: TrackInfo): string {
    if (!lyricsData?.lyrics) {
      throw new Error('No lyrics found for this track');
    }

    const lyrics = lyricsData.lyrics.lines;
    const minutes = Math.floor(trackInfo.duration_ms / 1000 / 60);
    const seconds = Math.floor((trackInfo.duration_ms / 1000) % 60);

    const lrcContent = [
      `[ti:${trackInfo.name}]`,
      `[ar:${trackInfo.artists}]`,
      `[al:${trackInfo.album || ''}]`,
      `[length:${minutes.toString().padStart(2, '0')}:${seconds
        .toString()
        .padStart(2, '0')}]`,
      '',
    ];

    for (const line of lyrics) {
      if (lyricsData.lyrics.syncType === 'UNSYNCED' || !line.startTimeMs) {
        lrcContent.push(line.words);
      } else {
        const duration = parseInt(line.startTimeMs);
        const lineMinutes = Math.floor(duration / 1000 / 60);
        const lineSeconds = ((duration / 1000) % 60).toFixed(2);
        lrcContent.push(
          `[${lineMinutes.toString().padStart(2, '0')}:${lineSeconds.padStart(
            5,
            '0'
          )}] ${line.words}`
        );
      }
    }

    return lrcContent.join('\n');
  }

  /**
   * Sanitize filename by removing invalid characters
   */
  static sanitizeFilename(filename: string): string {
    return filename.replace(/[\\/*?:"<>|]/g, '');
  }

  /**
   * Generate filename from track info
   */
  static generateFilename(trackInfo: TrackInfo): string {
    const artistName = trackInfo.artists || 'Unknown Artist';
    const trackName = trackInfo.name || 'Unknown Track';
    
    return this.sanitizeFilename(`${artistName} - ${trackName}.lrc`);
  }
}

/**
 * Utility functions for DOM manipulation
 */
export class DOMUtils {
  /**
   * Wait for element to appear in DOM
   */
  static waitForElement(
    selector: string,
    timeout = 10000
  ): Promise<Element | null> {
    return new Promise(resolve => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  /**
   * Create and inject a script element
   */
  static injectScript(src: string): void {
    const script = document.createElement('script');
    script.src = src;
    script.onload = function () {
      (this as HTMLScriptElement).remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }
}

/**
 * Utility functions for extracting track information
 */
export class TrackExtractor {
  /**
   * Extract track ID from various DOM elements
   */
  static extractTrackIdFromRow(row: Element): string | null {
    try {
      if (!row) return null;

      // Method 1: Look for track link with data-testid="internal-track-link"
      const trackLink = row.querySelector('[data-testid="internal-track-link"]') as HTMLAnchorElement;
      if (trackLink?.href) {
        const match = trackLink.href.match(/\/track\/([a-zA-Z0-9]+)/);
        if (match) {
          return match[1];
        }
      }

      // Method 2: Look for any link with href containing "/track/"
      const allLinks = row.querySelectorAll('a[href*="/track/"]') as NodeListOf<HTMLAnchorElement>;
      for (const link of allLinks) {
        const match = link.href.match(/\/track\/([a-zA-Z0-9]+)/);
        if (match) {
          return match[1];
        }
      }

      // Method 3: Search the entire row's HTML for track URLs using regex
      const rowHtml = row.innerHTML;
      const trackRegex = /\/track\/([a-zA-Z0-9]+)/;
      const match = rowHtml.match(trackRegex);
      if (match) {
        return match[1];
      }

      return null;
    } catch (error) {
      console.error('Error extracting track ID:', error);
      return null;
    }
  }

  /**
   * Extract track ID from URL
   */
  static extractTrackIdFromUrl(url: string): string | null {
    const match = url.match(/\/track\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }
}

/**
 * Debounce utility
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: number;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = window.setTimeout(() => func(...args), wait);
  };
}

/**
 * Async retry utility
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt === maxAttempts) {
        throw lastError;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}
