import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { REQUEST_TTL_MS } from './payment';

const { mockQr } = vi.hoisted(() => ({
  mockQr: vi.fn<(...args: unknown[]) => Promise<string>>(),
}));

vi.mock('qrcode', () => ({
  default: { toDataURL: mockQr },
}));

beforeEach(() => {
  mockQr.mockReset().mockResolvedValue('data:image/png;base64,demo');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function createRequest() {
  fireEvent.click(screen.getByRole('button', { name: 'Create payment request' }));
  await act(async () => {});
}

describe('payment playground', () => {
  it('starts as a draft with simulation boundaries and the event controls disabled', () => {
    render(<App />);
    expect(screen.getByText('Your QR code goes here')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send event' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Not connected in this demo.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Open UPI app' })).toBeNull();
  });

  it('shows validation errors and does not generate a link for invalid details', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.clear(screen.getByLabelText(/UPI ID.*Virtual/));
    await user.type(screen.getByLabelText(/UPI ID.*Virtual/), 'invalid');
    await user.click(screen.getByRole('button', { name: 'Create payment request' }));
    expect(screen.getByText(/Use a UPI ID like/)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('correct');
    expect(screen.queryByRole('link', { name: 'Open UPI app' })).toBeNull();
    expect(mockQr).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText(/UPI ID.*Virtual/));
  });

  it('generates matching QR and link payloads and locks the request details', async () => {
    render(<StrictMode><App /></StrictMode>);
    await createRequest();
    const link = screen.getByRole('link', { name: 'Open UPI app' }).getAttribute('href');
    expect(link).toMatch(/^upi:\/\/pay\?/);
    expect(mockQr).toHaveBeenCalledWith(link, expect.objectContaining({ margin: 4 }));
    expect(screen.getByRole('img', { name: /UPI payment QR/ })).toBeTruthy();
    expect(screen.getByLabelText(/Payee name/).closest('fieldset')?.disabled).toBe(true);
    expect(screen.getByText('Awaiting demo event')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Checkout preview' })).toBe(document.activeElement);
  });

  it('rejects a mismatched amount, then permits a matching simulated success', async () => {
    vi.useFakeTimers();
    render(<App />);
    await createRequest();
    fireEvent.change(screen.getByLabelText('Simulated provider event'), { target: { value: 'amount-mismatch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send event' }));
    expect(screen.getByText('Checking demo event')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Checking...' }).hasAttribute('disabled')).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(screen.getByText('Awaiting demo event')).toBeTruthy();
    expect(screen.getAllByText(/Event rejected: amount mismatch/).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Simulated provider event'), { target: { value: 'success' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send event' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(screen.getByText('A successful flow, not a confirmed payment.')).toBeTruthy();
    expect(screen.getAllByText(/No bank verification occurred/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Send event' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('link', { name: 'Open UPI app' })).toBeNull();
    expect(screen.queryByRole('img', { name: /UPI payment QR/ })).toBeNull();
    expect(screen.getByText('Not connected in this demo.')).toBeTruthy();
  });

  it('handles a simulated decline without implying payment confirmation', async () => {
    vi.useFakeTimers();
    render(<App />);
    await createRequest();
    fireEvent.change(screen.getByLabelText('Simulated provider event'), { target: { value: 'failed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send event' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(screen.getAllByText('Demo declined').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Send event' }).hasAttribute('disabled')).toBe(true);
  });

  it('expires the request automatically and removes the QR and handoff link', async () => {
    vi.useFakeTimers();
    render(<App />);
    await createRequest();
    await act(async () => { await vi.advanceTimersByTimeAsync(REQUEST_TTL_MS); });
    expect(screen.getAllByText('Request expired').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Open UPI app' })).toBeNull();
    expect(screen.queryByRole('img', { name: /UPI payment QR/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Send event' }).hasAttribute('disabled')).toBe(true);
  });

  it('does not accept success when verification crosses the expiry deadline', async () => {
    vi.useFakeTimers();
    render(<App />);
    await createRequest();
    await act(async () => { await vi.advanceTimersByTimeAsync(REQUEST_TTL_MS - 500); });
    fireEvent.click(screen.getByRole('button', { name: 'Send event' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(screen.getAllByText('Request expired').length).toBeGreaterThan(0);
    expect(screen.queryByText('A successful flow, not a confirmed payment.')).toBeNull();
  });

  it('supports manual expiry and a new draft with preserved input values', async () => {
    render(<App />);
    await createRequest();
    const oldUri = screen.getByRole('link', { name: 'Open UPI app' }).getAttribute('href');
    fireEvent.click(screen.getByRole('button', { name: /Simulate expiry/ }));
    expect(screen.getAllByText('Request expired').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Create a new request' }));
    expect(screen.getByLabelText(/Amount/).closest('fieldset')?.disabled).toBe(false);
    expect(screen.getByLabelText(/Amount/)).toBe(document.activeElement);
    expect(screen.getByLabelText(/Amount/).getAttribute('value')).toBe('499.00');
    await createRequest();
    expect(screen.getByRole('link', { name: 'Open UPI app' }).getAttribute('href')).not.toBe(oldUri);
  });

  it('cancels an in-flight simulation when starting a new draft', async () => {
    vi.useFakeTimers();
    render(<App />);
    await createRequest();
    fireEvent.click(screen.getByRole('button', { name: 'Send event' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create a new request' }));
    await createRequest();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByText('Awaiting demo event')).toBeTruthy();
    expect(screen.queryByText('A successful flow, not a confirmed payment.')).toBeNull();
  });

  it('reports QR generation errors and keeps the UPI link available', async () => {
    mockQr.mockRejectedValueOnce(new Error('QR failed'));
    render(<App />);
    await createRequest();
    expect(screen.getByRole('alert').textContent).toContain('Could not generate the QR code');
    expect(screen.getByRole('link', { name: 'Open UPI app' })).toBeTruthy();
  });

  it('reports clipboard failure instead of displaying a copied confirmation', async () => {
    userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('Permission denied'));
    render(<App />);
    await createRequest();
    fireEvent.click(screen.getByRole('button', { name: 'Copy UPI link' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Clipboard access failed'));
    expect(screen.queryByText('UPI link copied')).toBeNull();
  });
});
