import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import QRCode from 'qrcode';
import { Icon } from './Icon';
import {
  EXAMPLE_UPI_ADDRESS, UPI_ADDRESS_ERROR, buildPaymentPath, buildUpiUri, buildUpiAppUri,
  detectPaymentPlatform, getPayeeName, getPaymentRoute, getUpiApps, isValidUpiAddress,
} from './payment';
import type { PaymentPlatform } from './payment';

export default function App() {
  const [pathname, setPathname] = useState(window.location.pathname);
  const mainRef = useRef<HTMLElement>(null);
  const shouldFocus = useRef(false);
  const route = getPaymentRoute(pathname);
  const title = route.kind === 'payment'
    ? `Pay ${getPayeeName(route.upiId)}`
    : route.kind === 'invalid' ? 'Invalid payment link' : 'Simple UPI payments';

  useEffect(() => {
    function onPopState() {
      shouldFocus.current = true;
      setPathname(window.location.pathname);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    document.title = `${title} | pay.bipul.in`;
    if (shouldFocus.current) {
      mainRef.current?.focus();
      shouldFocus.current = false;
    }
  }, [pathname, title]);

  function openPayment(upiId: string) {
    const path = buildPaymentPath(upiId);
    window.history.pushState(null, '', path);
    shouldFocus.current = true;
    setPathname(path);
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="pay.bipul.in home">
          <span className="brand-mark"><Icon name="bolt" /></span>
          <span>pay<span className="brand-domain">.bipul.in</span></span>
        </a>
        <span className="header-caption">Simple. Direct. UPI.</span>
      </header>

      <main ref={mainRef} tabIndex={-1}>
        {route.kind === 'payment' ? <PaymentPage key={route.upiId} upiId={route.upiId} /> : (
          <div className="home-layout">
            <section className="intro">
              <span className="eyebrow">ONE ADDRESS. ONE PAYMENT PAGE.</span>
              <h1>{route.kind === 'invalid' ? 'Invalid payment link' : <>A simpler way<br />to pay<span className="green-period">.</span></>}</h1>
              <p>Turn a UPI address into a shareable payment page. Scan the QR code or pay with your UPI app.</p>
              <div className="address-pattern"><span>pay.bipul.in/</span><strong>yourname@bank</strong></div>
              <p className="intro-footnote">No sign-up. No payment details stored.</p>
            </section>

            <section className="card address-card" aria-labelledby="address-title">
              <div className="card-icon"><Icon name="qr" /></div>
              <h2 id="address-title">Create a payment page</h2>
              <p>All you need is the recipient's UPI address.</p>
              {route.kind === 'invalid' && <p className="error-message" role="alert">This link does not contain a valid UPI address. Enter one below to create a payment page.</p>}
              <AddressForm onOpen={openPayment} />
              <div className="example-link">
                <span>For example</span>
                <a href={buildPaymentPath(EXAMPLE_UPI_ADDRESS)}>pay.bipul.in/{EXAMPLE_UPI_ADDRESS}<Icon name="arrow" /></a>
              </div>
            </section>
          </div>
        )}
      </main>

      <footer className="site-footer">
        <span>Payments happen in your UPI app.</span>
        <span>This site does not verify accounts or confirm payments.</span>
      </footer>
    </div>
  );
}

function AddressForm({ onOpen }: { onOpen: (upiId: string) => void }) {
  const [upiId, setUpiId] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = upiId.trim();
    if (!isValidUpiAddress(address)) {
      setError(UPI_ADDRESS_ERROR);
      inputRef.current?.focus();
      return;
    }
    onOpen(address);
  }

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor="upi-address">UPI address</label>
      <input
        ref={inputRef} id="upi-address" name="upi-address" value={upiId}
        onChange={event => { setUpiId(event.target.value); setError(''); }}
        placeholder="yourname@bank" autoComplete="off" autoCapitalize="none"
        spellCheck={false} required aria-invalid={Boolean(error)}
        aria-describedby={`address-hint${error ? ' address-error' : ''}`}
      />
      <p className="field-hint" id="address-hint">Use a UPI ID, not a phone number or a full URL.</p>
      {error && <p className="error-message" role="alert" id="address-error">{error}</p>}
      <button className="button button-primary" type="submit">Show payment page<Icon name="arrow" /></button>
    </form>
  );
}

function PaymentPage({ upiId }: { upiId: string }) {
  const uri = buildUpiUri(upiId);
  const payeeName = getPayeeName(upiId);
  const pageUrl = `${window.location.origin}${buildPaymentPath(upiId)}`;
  const [qrCode, setQrCode] = useState('');
  const [qrError, setQrError] = useState('');
  const [copyNotice, setCopyNotice] = useState('');
  const [copyError, setCopyError] = useState('');
  const [platform] = useState(() => detectPaymentPlatform(navigator.userAgent, navigator.maxTouchPoints));
  const isMobile = platform !== 'desktop';

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(uri, {
      width: 288, margin: 4, errorCorrectionLevel: 'M',
      color: { dark: '#182338', light: '#ffffff' },
    }).then(image => {
      if (!cancelled) setQrCode(image);
    }).catch(() => {
      if (!cancelled) setQrError('Could not generate the QR code. Use a UPI app button or reload this page to try again.');
    });
    return () => { cancelled = true; };
  }, [uri]);

  useEffect(() => {
    if (!copyNotice) return;
    const timer = window.setTimeout(() => setCopyNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [copyNotice]);

  async function copyPaymentLink() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopyNotice('Payment page link copied');
      setCopyError('');
    } catch {
      setCopyNotice('');
      setCopyError('Could not copy the link. Select and copy the payment page link below.');
    }
  }

  const qr = (
    <div className="qr-area">
      {qrError ? <p className="error-message" role="alert">{qrError}</p>
        : qrCode ? <img className="qr-code" src={qrCode} width="288" height="288" alt={`UPI payment QR for ${upiId}`} />
          : <p className="qr-loading" role="status">Generating your QR code...</p>}
    </div>
  );

  return (
    <div className="payment-layout">
      <section className="card payment-card" aria-labelledby="payee-title">
        <span className="eyebrow">PAYING TO</span>
        <h1 id="payee-title">{payeeName}</h1>
        {payeeName !== upiId && <p className="payee-address">{upiId}</p>}
        <p className="payment-intro">{isMobile ? 'Choose your UPI app to pay directly.' : 'Scan to pay with any compatible UPI app.'}</p>

        {isMobile ? (
          <>
            <p className="amount-hint">Choose the amount in your UPI app.</p>
            <UpiAppPicker uri={uri} platform={platform} />
            <details className="qr-fallback">
              <summary><Icon name="qr" />Show QR code instead</summary>
              {qr}
              <p className="device-hint">Scan with another phone's UPI app.</p>
            </details>
          </>
        ) : (
          <>
            {qr}
            <p className="amount-hint">Choose the amount in your UPI app.</p>
            <a className="button button-primary" href={uri}><Icon name="external" />Pay with UPI app</a>
            <p className="device-hint">Scan with your phone, or open a compatible UPI app installed on this device.</p>
          </>
        )}

        <div className="payment-warning"><Icon name="shield" /><p>Verify the recipient's name and UPI address in your app before authorizing a payment.</p></div>
      </section>

      <section className="share-section" aria-labelledby="share-title">
        <h2 id="share-title">Share this payment page</h2>
        <label className="sr-only" htmlFor="payment-page-link">Payment page link</label>
        <input id="payment-page-link" value={pageUrl} readOnly onFocus={event => event.target.select()} />
        <button className="button button-secondary" type="button" onClick={copyPaymentLink}><Icon name="copy" />Copy payment link</button>
        <p className="copy-notice" role="status">{copyNotice}</p>
        {copyError && <p className="error-message" role="alert">{copyError}</p>}
        <a className="home-link" href="/">Create a page for another UPI address<Icon name="arrow" /></a>
      </section>
    </div>
  );
}

function UpiAppPicker({ uri, platform }: { uri: string; platform: PaymentPlatform }) {
  const apps = getUpiApps(platform);
  const [showAll, setShowAll] = useState(false);
  const [launchNotice, setLaunchNotice] = useState('');
  const listId = useId();

  function onLaunch(appName: string) {
    setLaunchNotice(`If ${appName} doesn't open, check that it is installed, try another app, or use the QR code. In-app browsers may require opening this page in Safari or Chrome.`);
  }

  return (
    <section className="app-picker" aria-label="Choose a UPI app">
      <div className="upi-app-grid" id={listId}>
        {(showAll ? apps : apps.slice(0, 4)).map(app => (
          <a
            className="upi-app-button" key={app.id} href={buildUpiAppUri(uri, app.id)}
            aria-label={`Pay with ${app.name}`} onClick={() => onLaunch(app.name)}
          >
            <span className={`upi-app-mark app-${app.id}`} aria-hidden="true">{app.mark}</span>
            <span>{app.name}</span>
          </a>
        ))}
      </div>
      {apps.length > 4 && <button className="show-apps-button" type="button" aria-expanded={showAll} aria-controls={listId} onClick={() => setShowAll(previous => !previous)}>{showAll ? 'Show fewer apps' : 'Show more UPI apps'}</button>}
      {platform === 'android' && <a className="button button-secondary" href={uri} onClick={() => onLaunch('a UPI app')}><Icon name="external" />Other UPI apps</a>}
      <p className="device-hint">Choose an app installed on this device. App availability and payment acceptance depend on your app and bank.</p>
      {launchNotice && <p className="launch-notice" role="status">{launchNotice}</p>}
    </section>
  );
}
