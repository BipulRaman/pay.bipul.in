import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import {
  INITIAL_FORM, REQUEST_TTL_MS, buildUpiUri, createDemoEvent,
  createPaymentRequest, formatMoney, parseAmount, validateForm, verifyDemoEvent,
} from './payment';
import type { PaymentStatus, Scenario } from './payment';

describe('amount validation in integer paise', () => {
  it.each([
    ['1', 100], ['1.01', 101], ['499.9', 49990], ['100000', 10000000],
    ['100000.00', 10000000], [' 42.50 ', 4250], ['000001.10', 110],
  ])('parses %s exactly', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each([
    '', ' ', '0', '0.99', '-1', '+1', '1e3', 'NaN', 'Infinity',
    '1,000', '1.001', '1.', '.50', '100000.01', '999999999999',
    '0xFF', '10 00', '1\n2',
  ])('rejects invalid or out-of-range amount %j', input => {
    expect(parseAmount(input)).toBeNull();
    expect(validateForm({ ...INITIAL_FORM, amount: input }).amount).toBeTruthy();
  });
});

describe('UPI request validation', () => {
  it('accepts the example form', () => {
    expect(validateForm(INITIAL_FORM)).toEqual({});
  });

  it.each(['alice@okaxis', '9876543210@ybl', 'alice.smith@oksbi', 'TEST_name-1@Bank12', ' alice@upi '])('accepts conservative UPI syntax %s', upiId => {
    expect(validateForm({ ...INITIAL_FORM, upiId }).upiId).toBeUndefined();
  });

  it.each(['', '1234567890', 'name@', '@bank', 'name@@bank', 'a b@bank', 'name@bank&am=1', '<script>@upi', '.name@upi'])('rejects invalid UPI ID %j', upiId => {
    expect(validateForm({ ...INITIAL_FORM, upiId }).upiId).toBeTruthy();
  });

  it('checks name and note boundaries and control characters', () => {
    expect(validateForm({ ...INITIAL_FORM, payeeName: '   ' }).payeeName).toBeTruthy();
    expect(validateForm({ ...INITIAL_FORM, payeeName: 'x'.repeat(61) }).payeeName).toBeTruthy();
    expect(validateForm({ ...INITIAL_FORM, payeeName: 'a\u0000b' }).payeeName).toBeTruthy();
    expect(validateForm({ ...INITIAL_FORM, payeeName: 'x'.repeat(60) }).payeeName).toBeUndefined();
    expect(validateForm({ ...INITIAL_FORM, note: 'x'.repeat(81) }).note).toBeTruthy();
    expect(validateForm({ ...INITIAL_FORM, note: 'hello\nworld' }).note).toBeTruthy();
    expect(validateForm({ ...INITIAL_FORM, note: 'x'.repeat(80) }).note).toBeUndefined();
    expect(validateForm({ ...INITIAL_FORM, note: '' }).note).toBeUndefined();
  });

  it('refuses to create an invalid request', () => {
    expect(() => createPaymentRequest({ ...INITIAL_FORM, amount: '-1' })).toThrow('Correct the payment details');
  });

  it('creates unique references, a normalized snapshot, and a five-minute window', () => {
    const form = { ...INITIAL_FORM, payeeName: '  Demo  ', upiId: ' alice@upi ', note: ' Thanks! ' };
    const first = createPaymentRequest(form, 1000);
    const second = createPaymentRequest(form, 1000);
    expect(first.reference).toMatch(/^D[A-F0-9]{32}$/);
    expect(first.reference).not.toBe(second.reference);
    expect(first).toMatchObject({
      amountPaise: 49900, payeeName: 'Demo', upiId: 'alice@upi',
      note: 'Thanks!', currency: 'INR', status: 'pending', expiresAt: 1000 + REQUEST_TTL_MS,
    });
    form.amount = '1';
    expect(first.amountPaise).toBe(49900);
  });
});

describe('UPI URI and QR', () => {
  it('encodes all fields without allowing query parameter injection', () => {
    const payment = createPaymentRequest({
      ...INITIAL_FORM, payeeName: 'Studio & Friends', note: 'Order #1 &am=1? Thanks \u20b9',
    });
    const uri = new URL(buildUpiUri(payment));
    expect(uri.protocol).toBe('upi:');
    expect(uri.hostname).toBe('pay');
    expect(Object.fromEntries(uri.searchParams)).toEqual({
      pa: payment.upiId, pn: 'Studio & Friends', tr: payment.reference, am: '499.00',
      cu: 'INR', tn: 'Order #1 &am=1? Thanks \u20b9',
    });
    expect(uri.searchParams.getAll('am')).toEqual(['499.00']);
  });

  it('omits an empty optional note', () => {
    const payment = createPaymentRequest({ ...INITIAL_FORM, note: '' });
    expect(new URL(buildUpiUri(payment)).searchParams.has('tn')).toBe(false);
  });

  it('can encode even the largest allowed request in a QR code', () => {
    const payment = createPaymentRequest({
      payeeName: 'A'.repeat(60), amount: '100000.00',
      upiId: `${'a'.repeat(256)}@${'b'.repeat(64)}`, note: '\u20b9'.repeat(80),
    });
    const qr = QRCode.create(buildUpiUri(payment), { errorCorrectionLevel: 'M' });
    expect(qr.modules.size).toBeGreaterThan(0);
    expect(qr.version).toBeLessThanOrEqual(40);
  });

  it('formats amounts using Indian currency grouping', () => {
    expect(formatMoney(10000000)).toContain('1,00,000.00');
  });
});

describe('simulated event validation', () => {
  const timestamp = 10000;
  const payment = createPaymentRequest(INITIAL_FORM, timestamp);

  it('accepts a matching success event, with an explicit simulation disclaimer', () => {
    expect(verifyDemoEvent(payment, createDemoEvent(payment, 'success'), timestamp)).toMatchObject({
      accepted: true, status: 'success', message: expect.stringContaining('No bank verification occurred'),
    });
  });

  it('accepts a matching decline without marking success', () => {
    expect(verifyDemoEvent(payment, createDemoEvent(payment, 'failed'), timestamp)).toMatchObject({
      accepted: true, status: 'failed',
    });
  });

  it.each<Scenario>(['amount-mismatch', 'reference-mismatch', 'payee-mismatch', 'currency-mismatch'])('rejects %s and keeps waiting', scenario => {
    expect(verifyDemoEvent(payment, createDemoEvent(payment, scenario), timestamp)).toMatchObject({
      accepted: false, status: 'pending', message: expect.stringContaining(`${scenario.split('-')[0]} mismatch`),
    });
  });

  it('accepts an event only strictly before expiry', () => {
    const event = createDemoEvent(payment, 'success');
    expect(verifyDemoEvent(payment, event, payment.expiresAt - 1).status).toBe('success');
    expect(verifyDemoEvent(payment, event, payment.expiresAt)).toMatchObject({ accepted: false, status: 'expired' });
    expect(verifyDemoEvent({ ...payment, status: 'verifying' }, event, payment.expiresAt + 1).status).toBe('expired');
  });

  it.each<PaymentStatus>(['success', 'failed', 'expired'])('never changes a closed %s request, even after its original deadline', status => {
    const closed = { ...payment, status };
    for (const now of [timestamp, payment.expiresAt + 1]) {
      expect(verifyDemoEvent(closed, createDemoEvent(closed, 'success'), now)).toMatchObject({ status, accepted: false });
    }
  });
});
