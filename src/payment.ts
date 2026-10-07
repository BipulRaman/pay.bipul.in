export const REQUEST_TTL_MS = 5 * 60 * 1000;
export const MAX_AMOUNT_PAISE = 10_000_000;

export interface PaymentForm {
  payeeName: string;
  upiId: string;
  amount: string;
  note: string;
}

export type FormErrors = Partial<Record<keyof PaymentForm, string>>;
export type PaymentStatus = 'pending' | 'verifying' | 'success' | 'failed' | 'expired';

export interface PaymentRequest {
  reference: string;
  payeeName: string;
  upiId: string;
  amountPaise: number;
  note: string;
  currency: 'INR';
  expiresAt: number;
  status: PaymentStatus;
}

export type Scenario = 'success' | 'failed' | 'amount-mismatch' | 'reference-mismatch' | 'payee-mismatch' | 'currency-mismatch';

export interface DemoEvent {
  reference: string;
  upiId: string;
  amountPaise: number;
  currency: string;
  status: 'success' | 'failed';
}

export interface VerificationResult {
  status: 'pending' | 'success' | 'failed' | 'expired';
  accepted: boolean;
  message: string;
}

export const INITIAL_FORM: PaymentForm = {
  payeeName: 'Demo Studio',
  upiId: 'demo.merchant@upi',
  amount: '499.00',
  note: 'A little something for great work',
};

export function parseAmount(value: string): number | null {
  const amount = value.trim();
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(amount)) return null;
  const [rupees, fraction = ''] = amount.split('.');
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
  return paise >= 100 && paise <= MAX_AMOUNT_PAISE ? paise : null;
}

export function validateForm(form: PaymentForm): FormErrors {
  const errors: FormErrors = {};
  const name = form.payeeName.trim();
  if (!name || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) {
    errors.payeeName = 'Enter a payee name between 1 and 60 characters.';
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,255}@[a-zA-Z][a-zA-Z0-9]{1,63}$/.test(form.upiId.trim())) {
    errors.upiId = 'Use a UPI ID like name@bank (not a phone number alone).';
  }
  if (parseAmount(form.amount) === null) {
    errors.amount = 'Enter INR 1 to 1,00,000, with at most 2 decimal places.';
  }
  if (form.note.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(form.note)) {
    errors.note = 'Keep the note to 80 characters without line breaks.';
  }
  return errors;
}

export function createPaymentRequest(form: PaymentForm, now = Date.now()): PaymentRequest {
  const amountPaise = parseAmount(form.amount);
  if (Object.keys(validateForm(form)).length || amountPaise === null) {
    throw new Error('Correct the payment details before creating a request.');
  }
  return {
    reference: `D${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`,
    payeeName: form.payeeName.trim(),
    upiId: form.upiId.trim(),
    amountPaise,
    note: form.note.trim(),
    currency: 'INR',
    expiresAt: now + REQUEST_TTL_MS,
    status: 'pending',
  };
}

export function buildUpiUri(request: PaymentRequest): string {
  const params = new URLSearchParams({
    pa: request.upiId,
    pn: request.payeeName,
    tr: request.reference,
    am: (request.amountPaise / 100).toFixed(2),
    cu: request.currency,
  });
  if (request.note) params.set('tn', request.note);
  return `upi://pay?${params.toString()}`;
}

export function createDemoEvent(request: PaymentRequest, scenario: Scenario): DemoEvent {
  return {
    reference: scenario === 'reference-mismatch' ? 'DEMO_WRONG_REFERENCE' : request.reference,
    upiId: scenario === 'payee-mismatch' ? 'another.merchant@upi' : request.upiId,
    amountPaise: scenario === 'amount-mismatch' ? request.amountPaise + 100 : request.amountPaise,
    currency: scenario === 'currency-mismatch' ? 'USD' : request.currency,
    status: scenario === 'failed' ? 'failed' : 'success',
  };
}

// These are local consistency checks on a fabricated event, not proof of payment.
export function verifyDemoEvent(request: PaymentRequest, event: DemoEvent, now = Date.now()): VerificationResult {
  if (request.status !== 'pending' && request.status !== 'verifying') {
    return { status: request.status, accepted: false, message: 'Request already closed. Duplicate event ignored.' };
  }
  if (request.expiresAt <= now) {
    return { status: 'expired', accepted: false, message: 'Request expired. The event was not accepted.' };
  }
  const mismatch = event.reference !== request.reference ? 'reference'
    : event.upiId !== request.upiId ? 'payee'
    : event.amountPaise !== request.amountPaise ? 'amount'
    : event.currency !== request.currency ? 'currency'
    : null;
  if (mismatch) {
    return { status: 'pending', accepted: false, message: `Event rejected: ${mismatch} mismatch. Request is still pending.` };
  }
  return event.status === 'success'
    ? { status: 'success', accepted: true, message: 'Demo success. Reference, payee, amount, and currency matched. No bank verification occurred.' }
    : { status: 'failed', accepted: true, message: 'Demo declined. The simulated provider reported a failed payment.' };
}

export function formatMoney(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(paise / 100);
}
