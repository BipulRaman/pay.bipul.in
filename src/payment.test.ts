import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import {
  EXAMPLE_UPI_ADDRESS, buildPaymentPath, buildUpiUri,
  getPayeeName, getPaymentRoute, isValidUpiAddress,
} from './payment';

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
