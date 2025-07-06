import { TOTPConfig } from '@/types';

/**
 * TOTP (Time-based One-Time Password) implementation for Spotify authentication
 */
export class TOTP {
  private config: TOTPConfig;

  constructor() {
    this.config = {
      secret: new Uint8Array([
        52, 52, 57, 52, 52, 51, 54, 52, 57, 48, 56, 52, 56, 56, 54, 51, 50, 56,
        56, 57, 51, 53, 51, 52, 53, 55, 49, 48, 52, 49, 51, 49, 53,
      ]),
      version: 8,
      period: 30,
      digits: 6,
    };
  }

  /**
   * Generate TOTP code for given timestamp
   */
  async generate(timestamp: number): Promise<string> {
    const counter = Math.floor(timestamp / 1000 / this.config.period);
    const counterBytes = new ArrayBuffer(8);
    const counterView = new DataView(counterBytes);
    counterView.setUint32(4, counter, false); // Big endian

    const key = await crypto.subtle.importKey(
      'raw',
      this.config.secret,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, counterBytes);
    const hmacResult = new Uint8Array(signature);

    const offset = hmacResult[hmacResult.length - 1] & 0x0f;
    const binary =
      ((hmacResult[offset] & 0x7f) << 24) |
      ((hmacResult[offset + 1] & 0xff) << 16) |
      ((hmacResult[offset + 2] & 0xff) << 8) |
      (hmacResult[offset + 3] & 0xff);

    return String(binary % Math.pow(10, this.config.digits)).padStart(
      this.config.digits,
      '0'
    );
  }

  get version(): number {
    return this.config.version;
  }
}
