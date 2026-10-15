export const EXAMPLE_UPI_ADDRESS = 'alumni.fundcollection@boi';
export const UPI_ADDRESS_ERROR = 'Enter a valid UPI address, such as name@bank.';

export type PaymentPlatform = 'android' | 'ios' | 'desktop';

// One-time payment schemes from Solidgate's UPI Intent mobile integration guide.
export const UPI_APPS = [
  { id: 'google-pay', name: 'Google Pay', mark: 'G', prefix: 'tez://upi/pay', platforms: ['android', 'ios'] },
  { id: 'phonepe', name: 'PhonePe', mark: 'Pe', prefix: 'phonepe://pay', platforms: ['android', 'ios'] },
  { id: 'paytm', name: 'Paytm', mark: 'P', prefix: 'paytmmp://pay', platforms: ['android', 'ios'] },
  { id: 'bhim', name: 'BHIM', mark: 'B', prefix: 'bhim://upi/pay', platforms: ['android', 'ios'] },
  { id: 'cred', name: 'CRED', mark: 'C', prefix: 'credpay://upi/pay', platforms: ['android', 'ios'] },
  { id: 'amazon-pay', name: 'Amazon Pay', mark: 'a', prefix: 'amazonpay://upi/pay', platforms: ['android'] },
  { id: 'navi', name: 'Navi', mark: 'N', prefix: 'navi://pay', platforms: ['android'] },
] as const;

export type UpiAppId = typeof UPI_APPS[number]['id'];

export function detectPaymentPlatform(userAgent: string, maxTouchPoints = 0): PaymentPlatform {
  if (/android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) {
    return 'ios';
  }
  return 'desktop';
}

export function getUpiApps(platform: PaymentPlatform) {
  return UPI_APPS.filter(app => app.platforms.some(supported => supported === platform));
}

export function buildUpiAppUri(uri: string, appId: UpiAppId): string {
  if (!uri.startsWith('upi://pay?')) throw new Error('Expected a one-time UPI payment URI.');
  const app = UPI_APPS.find(candidate => candidate.id === appId);
  if (!app) throw new Error('Unknown UPI app.');
  return `${app.prefix}${uri.slice('upi://pay'.length)}`;
}

export type PaymentRoute =
  | { kind: 'home' }
  | { kind: 'payment'; upiId: string }
  | { kind: 'invalid' };

export function isValidUpiAddress(upiId: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,255}@[a-zA-Z][a-zA-Z0-9]{1,63}$/.test(upiId);
}

export function getPaymentRoute(pathname: string): PaymentRoute {
  if (pathname === '/') return { kind: 'home' };
  const match = /^\/([^/]+)\/?$/.exec(pathname);
  if (!match) return { kind: 'invalid' };

  let upiId: string;
  try {
    upiId = decodeURIComponent(match[1]);
  } catch (error) {
    if (error instanceof URIError) return { kind: 'invalid' };
    throw error;
  }
  return isValidUpiAddress(upiId) ? { kind: 'payment', upiId } : { kind: 'invalid' };
}

export function getPayeeName(upiId: string): string {
  return upiId === EXAMPLE_UPI_ADDRESS ? 'JNV Sitamarhi Alumni' : upiId;
}

export function buildPaymentPath(upiId: string): string {
  if (!isValidUpiAddress(upiId)) throw new Error(UPI_ADDRESS_ERROR);
  return `/${encodeURIComponent(upiId).replaceAll('%40', '@')}`;
}

export function buildUpiUri(upiId: string): string {
  if (!isValidUpiAddress(upiId)) throw new Error(UPI_ADDRESS_ERROR);
  const params = new URLSearchParams({ pa: upiId, pn: getPayeeName(upiId) });
  return `upi://pay?${params.toString().replaceAll('+', '%20').replaceAll('%40', '@')}`;
}
