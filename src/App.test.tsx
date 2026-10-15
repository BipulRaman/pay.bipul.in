import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const { mockQr } = vi.hoisted(() => ({
  mockQr: vi.fn<(...args: unknown[]) => Promise<string>>(),
}));

vi.mock('qrcode', () => ({
  default: { toDataURL: mockQr },
}));

const alumniUri = 'upi://pay?pa=alumni.fundcollection@boi&pn=JNV%20Sitamarhi%20Alumni';

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  mockQr.mockReset().mockResolvedValue('data:image/png;base64,demo');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function navigate(path: string) {
  act(() => {
    window.history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

describe('UPI address homepage', () => {
  it('shows address entry instead of simulated payment controls', () => {
    render(<App />);
    expect(screen.getByLabelText('UPI address')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'pay.bipul.in/alumni.fundcollection@boi' }).getAttribute('href')).toBe('/alumni.fundcollection@boi');
    expect(screen.queryByRole('link', { name: 'Pay with UPI app' })).toBeNull();
    expect(screen.queryByText(/simulat/i)).toBeNull();
    expect(mockQr).not.toHaveBeenCalled();
  });

  it('opens a payment page after trimming the entered address', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('UPI address'), ' alumni.fundcollection@boi ');
    await user.click(screen.getByRole('button', { name: 'Show payment page' }));
    expect(window.location.pathname).toBe('/alumni.fundcollection@boi');
    expect(screen.getByRole('link', { name: 'Pay with UPI app' }).getAttribute('href')).toBe(alumniUri);
    expect(await screen.findByRole('img', { name: /UPI payment QR/ })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('main'));
    expect(document.title).toBe('Pay JNV Sitamarhi Alumni | pay.bipul.in');
  });

  it.each(['', 'invalid', 'alice@upi&am=1', 'https://pay.bipul.in/alice@upi'])('rejects invalid input %j without creating a QR or navigating', async value => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('UPI address'), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Show payment page' }));
    expect(screen.getByRole('alert').textContent).toContain('Enter a valid UPI address');
    expect(window.location.pathname).toBe('/');
    expect(mockQr).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText('UPI address'));
  });
});

describe('direct payment pages', () => {
  it('generates matching QR and app links immediately on a direct visit', async () => {
    window.history.replaceState(null, '', '/alumni.fundcollection@boi');
    render(<StrictMode><App /></StrictMode>);
    expect(screen.getByRole('heading', { name: 'JNV Sitamarhi Alumni' })).toBeTruthy();
    expect(screen.getByText('alumni.fundcollection@boi')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Pay with UPI app' }).getAttribute('href')).toBe(alumniUri);
    expect(mockQr).toHaveBeenCalledWith(alumniUri, expect.objectContaining({ margin: 4 }));
    expect(await screen.findByRole('img', { name: 'UPI payment QR for alumni.fundcollection@boi' })).toBeTruthy();
    expect(screen.getByText('Choose the amount in your UPI app.')).toBeTruthy();
    expect(screen.getByText(/This site does not verify accounts or confirm payments/)).toBeTruthy();
  });

  it('supports an encoded address and ignores query parameters that could change the payment', async () => {
    window.history.replaceState(null, '', '/alice%40okaxis?pa=attacker@upi&pn=Fake&am=100#fragment');
    render(<App />);
    const link = screen.getByRole('link', { name: 'Pay with UPI app' }).getAttribute('href');
    expect(link).toBe('upi://pay?pa=alice@okaxis&pn=alice@okaxis');
    expect(screen.getByRole('heading', { name: 'alice@okaxis' })).toBeTruthy();
    expect(screen.getByLabelText('Payment page link').getAttribute('value')).toBe(`${window.location.origin}/alice@okaxis`);
    await screen.findByRole('img', { name: /UPI payment QR/ });
  });

  it.each(['/invalid', '/%ZZ', '/alice@upi/extra', '/alice%40upi%26am%3D1'])('shows a recoverable error for %s with no payment action', path => {
    window.history.replaceState(null, '', path);
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Invalid payment link' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('does not contain a valid UPI address');
    expect(screen.getByLabelText('UPI address')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Pay with UPI app' })).toBeNull();
    expect(mockQr).not.toHaveBeenCalled();
  });

  it('updates on browser history navigation and clears the previous recipient QR', async () => {
    window.history.replaceState(null, '', '/alumni.fundcollection@boi');
    render(<App />);
    await screen.findByRole('img', { name: /UPI payment QR/ });
    mockQr.mockResolvedValueOnce('data:image/png;base64,alice');
    navigate('/alice@upi');
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('link', { name: 'Pay with UPI app' }).getAttribute('href')).toBe('upi://pay?pa=alice@upi&pn=alice@upi');
    await waitFor(() => expect(screen.getByRole('img').getAttribute('src')).toBe('data:image/png;base64,alice'));
    navigate('/');
    expect(screen.getByLabelText('UPI address')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    expect(document.title).toBe('Simple UPI payments | pay.bipul.in');
  });

  it('does not display a stale QR after navigating to another payee', async () => {
    let resolveOldQr: (value: string) => void = () => { throw new Error('QR generation has not started'); };
    mockQr.mockImplementationOnce(() => new Promise<string>(resolve => { resolveOldQr = resolve; }));
    window.history.replaceState(null, '', '/alumni.fundcollection@boi');
    render(<App />);
    navigate('/alice@upi');
    await screen.findByRole('img', { name: 'UPI payment QR for alice@upi' });
    await act(async () => { resolveOldQr('data:image/png;base64,old'); });
    expect(screen.getByRole('img').getAttribute('src')).toBe('data:image/png;base64,demo');
  });

  it('keeps the app handoff available when QR generation fails', async () => {
    mockQr.mockRejectedValueOnce(new Error('QR failed'));
    window.history.replaceState(null, '', '/alumni.fundcollection@boi');
    render(<App />);
    expect((await screen.findByRole('alert')).textContent).toContain('Could not generate the QR code');
    expect(screen.getByRole('link', { name: 'Pay with UPI app' }).getAttribute('href')).toBe(alumniUri);
  });

  it('copies the shareable HTTP page URL, not the UPI app URI', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    window.history.replaceState(null, '', '/alumni.fundcollection@boi');
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Copy payment link' }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/alumni.fundcollection@boi`);
    expect(screen.getByText('Payment page link copied')).toBeTruthy();
  });

  it('shows manual copy instructions on clipboard failure', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('Permission denied'));
    window.history.replaceState(null, '', '/alumni.fundcollection@boi');
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Copy payment link' }));
    expect(screen.getByRole('alert').textContent).toContain('Select and copy the payment page link below');
    expect(screen.queryByText('Payment page link copied')).toBeNull();
    expect(screen.getByLabelText('Payment page link').hasAttribute('readonly')).toBe(true);
  });
});
