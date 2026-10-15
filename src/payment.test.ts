import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import {
  EXAMPLE_UPI_ADDRESS, UPI_APPS, buildPaymentPath, buildUpiUri, buildUpiAppUri,
  detectPaymentPlatform, getPayeeName, getPaymentRoute, getUpiApps, isValidUpiAddress,
} from './payment';
import type { PaymentPlatform, UpiAppId } from './payment';

describe('UPI address validation', () => {
  it.each([
    EXAMPLE_UPI_ADDRESS, 'alice@okaxis', '9876543210@ybl',
    'alice.smith@oksbi', 'TEST_name-1@Bank12',
  ])('accepts %s', upiId => {
    expect(isValidUpiAddress(upiId)).toBe(true);
  });

  it.each([
    '', ' ', '1234567890', 'name@', '@bank', 'name@@bank', 'a b@bank',
    'name@bank&am=1', '<script>@upi', '.name@upi', ' alice@upi ',
    'alice@upi\n', 'https://example.com/alice@upi', 'alice@upi/extra',
    `${'a'.repeat(257)}@bank`, `alice@${'b'.repeat(65)}`,
  ])('rejects invalid address %j in validation and link builders', upiId => {
    expect(isValidUpiAddress(upiId)).toBe(false);
    expect(() => buildUpiUri(upiId)).toThrow('Enter a valid UPI address');
    expect(() => buildPaymentPath(upiId)).toThrow('Enter a valid UPI address');
  });
});

describe('payment page routing', () => {
  it('recognizes the homepage', () => {
    expect(getPaymentRoute('/')).toEqual({ kind: 'home' });
  });

  it.each([
    '/alumni.fundcollection@boi', '/alumni.fundcollection%40boi',
    '/alumni.fundcollection@boi/',
  ])('reads an address from %s', path => {
    expect(getPaymentRoute(path)).toEqual({ kind: 'payment', upiId: EXAMPLE_UPI_ADDRESS });
  });

  it.each([
    '/invalid', '/alice@upi/extra', '//alice@upi', '/%ZZ', '/%E0%A4%A',
    '/alice%40upi%26am%3D1', '/alice%2540upi', '/alice%40upi%2F',
    '/%3Cscript%3E%40upi', '/alice%40upi%0A', '/%20alice%40upi',
  ])('rejects malformed paths without throwing: %s', path => {
    expect(getPaymentRoute(path)).toEqual({ kind: 'invalid' });
  });

  it('creates shareable paths with a literal @ and preserves case', () => {
    expect(buildPaymentPath(EXAMPLE_UPI_ADDRESS)).toBe('/alumni.fundcollection@boi');
    expect(getPaymentRoute(buildPaymentPath('TEST_name-1@Bank12'))).toEqual({
      kind: 'payment', upiId: 'TEST_name-1@Bank12',
    });
  });
});

describe('UPI URI and QR', () => {
  it('matches the requested alumni URI exactly, with the amount left to the UPI app', () => {
    expect(buildUpiUri(EXAMPLE_UPI_ADDRESS)).toBe(
      'upi://pay?pa=alumni.fundcollection@boi&pn=JNV%20Sitamarhi%20Alumni',
    );
  });

  describe('mobile UPI app intents', () => {
    it.each<[UpiAppId, string]>([
      ['google-pay', 'tez://upi/pay'],
      ['phonepe', 'phonepe://pay'],
      ['paytm', 'paytmmp://pay'],
      ['bhim', 'bhim://upi/pay'],
      ['cred', 'credpay://upi/pay'],
      ['amazon-pay', 'amazonpay://upi/pay'],
      ['navi', 'navi://pay'],
    ])('uses the documented one-time prefix for %s', (appId, prefix) => {
      expect(buildUpiAppUri(buildUpiUri(EXAMPLE_UPI_ADDRESS), appId)).toBe(
        `${prefix}?pa=alumni.fundcollection@boi&pn=JNV%20Sitamarhi%20Alumni`,
      );
    });

    it.each(UPI_APPS)('preserves every original query byte for $name', app => {
      const query = '?pa=merchant%40upi&pn=Studio%20%26%20Friends&tr=REF-1&tn=A%2BB%20%26%20C&am=299.00&cu=INR';
      const genericUri = `upi://pay${query}`;
      const appUri = buildUpiAppUri(genericUri, app.id);
      expect(appUri).toBe(`${app.prefix}${query}`);
      expect(new URL(appUri).search).toBe(new URL(genericUri).search);
    });

    it.each(['https://example.com/pay?pa=alice@upi', 'upi://mandate?pa=alice@upi', 'upi://pay', 'upi://payment?pa=alice@upi'])('refuses non-payment URI %s', uri => {
      expect(() => buildUpiAppUri(uri, 'google-pay')).toThrow('Expected a one-time UPI payment URI');
    });

    it.each<[string, number, PaymentPlatform]>([
      ['Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/140.0.0.0 Mobile Safari/537.36', 5, 'android'],
      ['Mozilla/5.0 (Linux; Android 14; Tablet) Chrome/140.0.0.0 Safari/537.36', 5, 'android'],
      ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile Safari/604.1', 5, 'ios'],
      ['Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Mobile Safari/604.1', 5, 'ios'],
      ['Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)', 5, 'ios'],
      ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Safari/605.1.15', 5, 'ios'],
      ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Safari/605.1.15', 0, 'desktop'],
      ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0 Safari/537.36', 10, 'desktop'],
      ['', 0, 'desktop'],
    ])('detects the payment platform for %s', (userAgent, touches, platform) => {
      expect(detectPaymentPlatform(userAgent, touches)).toBe(platform);
    });

    it('offers the documented iOS apps without Android-only apps', () => {
      expect(getUpiApps('ios').map(app => app.id)).toEqual(['google-pay', 'phonepe', 'paytm', 'bhim', 'cred']);
      expect(getUpiApps('android').map(app => app.id)).toEqual(['google-pay', 'phonepe', 'paytm', 'bhim', 'cred', 'amazon-pay', 'navi']);
      expect(getUpiApps('desktop')).toEqual([]);
    });
  });

  it('uses any valid address as the destination and fallback display label', () => {
    const upiId = 'alice.smith@okaxis';
    const uri = new URL(buildUpiUri(upiId));
    expect(uri.protocol).toBe('upi:');
    expect(uri.hostname).toBe('pay');
    expect(Object.fromEntries(uri.searchParams)).toEqual({ pa: upiId, pn: upiId });
    expect(getPayeeName(upiId)).toBe(upiId);
  });

  it('encodes the largest allowed address in a QR code', () => {
    const upiId = `${'a'.repeat(256)}@${'b'.repeat(64)}`;
    const uri = buildUpiUri(upiId);
    const qr = QRCode.create(uri, { errorCorrectionLevel: 'M' });
    expect(qr.modules.size).toBeGreaterThan(0);
    expect(qr.version).toBeLessThanOrEqual(40);
    expect(getPaymentRoute(buildPaymentPath(upiId))).toEqual({ kind: 'payment', upiId });
  });
});
