export const EXAMPLE_UPI_ADDRESS = 'alumni.fundcollection@boi';
export const UPI_ADDRESS_ERROR = 'Enter a valid UPI address, such as name@bank.';

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
