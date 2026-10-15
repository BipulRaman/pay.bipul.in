import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  vi.unstubAllGlobals();
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

  describe('mobile app-specific payments', () => {
    function renderMobile(userAgent: string, maxTouchPoints = 5) {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
      vi.stubGlobal('navigator', Object.create(navigator, {
        maxTouchPoints: { value: maxTouchPoints, configurable: true },
      }));
      window.history.replaceState(null, '', '/alumni.fundcollection@boi');
      return render(<App />);
    }

    it('prioritizes Android app buttons, with more apps and a generic fallback', async () => {
      const user = userEvent.setup();
      renderMobile('Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/140.0.0.0 Mobile Safari/537.36');
      const picker = screen.getByRole('region', { name: 'Choose a UPI app' });
      expect(within(picker).getAllByRole('link').map(link => link.textContent)).toHaveLength(5);
      expect(screen.getByRole('link', { name: 'Pay with Google Pay' }).getAttribute('href')).toBe('tez://upi/pay?pa=alumni.fundcollection@boi&pn=JNV%20Sitamarhi%20Alumni');
      expect(screen.getByRole('link', { name: 'Pay with PhonePe' }).getAttribute('href')).toBe('phonepe://pay?pa=alumni.fundcollection@boi&pn=JNV%20Sitamarhi%20Alumni');
      expect(screen.getByRole('link', { name: 'Pay with Paytm' }).getAttribute('href')).toBe('paytmmp://pay?pa=alumni.fundcollection@boi&pn=JNV%20Sitamarhi%20Alumni');
      expect(screen.getByRole('link', { name: 'Pay with BHIM' }).getAttribute('href')).toBe('bhim://upi/pay?pa=alumni.fundcollection@boi&pn=JNV%20Sitamarhi%20Alumni');
      expect(screen.getByRole('link', { name: 'Other UPI apps' }).getAttribute('href')).toBe(alumniUri);
      expect(screen.queryByRole('link', { name: 'Pay with Navi' })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Show more UPI apps' }));
      expect(screen.getByRole('link', { name: 'Pay with CRED' }).getAttribute('href')).toBe('credpay://upi/pay?pa=alumni.fundcollection@boi&pn=JNV%20Sitamarhi%20Alumni');
      expect(screen.getByRole('link', { name: 'Pay with Amazon Pay' }).getAttribute('href')).toBe('amazonpay://upi/pay?pa=alumni.fundcollection@boi&pn=JNV%20Sitamarhi%20Alumni');
      expect(screen.getByRole('link', { name: 'Pay with Navi' }).getAttribute('href')).toBe('navi://pay?pa=alumni.fundcollection@boi&pn=JNV%20Sitamarhi%20Alumni');
      expect(screen.getByRole('button', { name: 'Show fewer apps' }).getAttribute('aria-expanded')).toBe('true');
      await user.click(screen.getByRole('button', { name: 'Show fewer apps' }));
      expect(screen.queryByRole('link', { name: 'Pay with Navi' })).toBeNull();
    });

    it.each([
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile Safari/604.1',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Safari/605.1.15',
    ])('does not offer the generic UPI tray or Android-only apps on iOS: %s', async userAgent => {
      const user = userEvent.setup();
      renderMobile(userAgent);
      await user.click(screen.getByRole('button', { name: 'Show more UPI apps' }));
      expect(screen.getByRole('link', { name: 'Pay with CRED' })).toBeTruthy();
      expect(screen.queryByRole('link', { name: 'Other UPI apps' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'Pay with UPI app' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'Pay with Amazon Pay' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'Pay with Navi' })).toBeNull();
      expect(document.querySelector('a[href^="upi:"]')).toBeNull();
    });

    it('keeps the original generic QR as an expandable mobile fallback', async () => {
      const user = userEvent.setup();
      renderMobile('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile Safari/604.1');
      await act(async () => {});
      const qr = screen.getByRole('img', { name: 'UPI payment QR for alumni.fundcollection@boi', hidden: true });
      expect(qr.closest('details')?.open).toBe(false);
      await user.click(screen.getByText('Show QR code instead'));
      expect(qr.closest('details')?.open).toBe(true);
      expect(mockQr).toHaveBeenCalledWith(alumniUri, expect.objectContaining({ margin: 4 }));
    });

    it('offers recovery instructions without claiming that the app opened or payment succeeded', async () => {
      renderMobile('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile Safari/604.1');
      await act(async () => {});
      const appLink = screen.getByRole('link', { name: 'Pay with PhonePe' });
      appLink.addEventListener('click', event => event.preventDefault());
      fireEvent.click(appLink);
      expect(screen.getByText(/If PhonePe doesn't open/).textContent).toContain('Safari or Chrome');
      expect(screen.queryByText(/payment succeeded|payment confirmed|app opened/i)).toBeNull();
      expect(screen.getByRole('link', { name: 'Pay with Google Pay' })).toBeTruthy();
    });

    it('still offers app buttons when mobile QR generation fails', async () => {
      const user = userEvent.setup();
      mockQr.mockRejectedValueOnce(new Error('QR failed'));
      renderMobile('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile Safari/604.1');
      await user.click(screen.getByText('Show QR code instead'));
      expect((await screen.findByRole('alert')).textContent).toContain('Could not generate the QR code');
      expect(screen.getByRole('link', { name: 'Pay with PhonePe' }).getAttribute('href')).toBe('phonepe://pay?pa=alumni.fundcollection@boi&pn=JNV%20Sitamarhi%20Alumni');
    });

    it('does not show mobile-only app buttons on a desktop browser', async () => {
      render(<App />);
      navigate('/alumni.fundcollection@boi');
      expect(await screen.findByRole('img', { name: /UPI payment QR/ })).toBeTruthy();
      expect(screen.queryByRole('region', { name: 'Choose a UPI app' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Pay with UPI app' }).getAttribute('href')).toBe(alumniUri);
    });
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
