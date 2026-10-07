import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import QRCode from 'qrcode';
import { Icon } from './Icon';
import {
  INITIAL_FORM, buildUpiUri, createDemoEvent, createPaymentRequest, formatMoney,
  parseAmount, validateForm, verifyDemoEvent,
} from './payment';
import type { DemoEvent, PaymentForm, PaymentRequest, Scenario } from './payment';

interface Activity {
  id: number;
  time: string;
  message: string;
  tone: 'neutral' | 'success' | 'error';
}

const SCENARIOS: { value: Scenario; label: string }[] = [
  { value: 'success', label: 'Payment succeeded' },
  { value: 'failed', label: 'Payment declined' },
  { value: 'amount-mismatch', label: 'Amount mismatch (+INR 1)' },
  { value: 'reference-mismatch', label: 'Reference mismatch' },
  { value: 'payee-mismatch', label: 'Payee mismatch' },
  { value: 'currency-mismatch', label: 'Currency mismatch' },
];

const STATUS_LABELS = {
  pending: 'Awaiting demo event',
  verifying: 'Checking demo event',
  success: 'Demo successful',
  failed: 'Demo declined',
  expired: 'Request expired',
};

export default function App() {
  const [form, setForm] = useState<PaymentForm>(INITIAL_FORM);
  const [touched, setTouched] = useState<Partial<Record<keyof PaymentForm, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [request, setRequest] = useState<PaymentRequest | null>(null);
  const [qrCode, setQrCode] = useState('');
  const [qrError, setQrError] = useState('');
  const [actionError, setActionError] = useState('');
  const [copyNotice, setCopyNotice] = useState('');
  const [scenario, setScenario] = useState<Scenario>('success');
  const [event, setEvent] = useState<DemoEvent | null>(null);
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState('');
  const [activity, setActivity] = useState<Activity[]>([]);
  const activityId = useRef(0);
  const focusDraft = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const checkoutHeading = useRef<HTMLHeadingElement>(null);
  const errors = validateForm(form);
  const locked = request !== null;
  const active = request?.status === 'pending' || request?.status === 'verifying';
  const uri = request ? buildUpiUri(request) : '';
  const displayAmount = request?.amountPaise ?? parseAmount(form.amount);
  const secondsLeft = request ? Math.max(0, Math.ceil((request.expiresAt - now) / 1000)) : 300;
  const countdown = `${Math.floor(secondsLeft / 60).toString().padStart(2, '0')}:${(secondsLeft % 60).toString().padStart(2, '0')}`;

  useEffect(() => {
    if (!request && focusDraft.current) {
      formRef.current?.querySelector<HTMLInputElement>('[name="amount"]')?.focus();
      focusDraft.current = false;
    }
  }, [request]);

  function addActivity(message: string, tone: Activity['tone'] = 'neutral') {
    const entry = { id: ++activityId.current, time: new Date().toLocaleTimeString('en-GB'), message, tone };
    setActivity(previous => [entry, ...previous].slice(0, 6));
  }

  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    QRCode.toDataURL(uri, {
      width: 256, margin: 4, errorCorrectionLevel: 'M',
      color: { dark: '#111d31', light: '#ffffff' },
    }).then(image => {
      if (!cancelled) setQrCode(image);
    }).catch(() => {
      if (!cancelled) setQrError('Could not generate the QR code. Use the UPI link or create a new request.');
    });
    return () => { cancelled = true; };
  }, [uri]);

  useEffect(() => {
    if (!active || !request) return;
    const timer = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (currentTime >= request.expiresAt) {
        setRequest(previous => previous && (previous.status === 'pending' || previous.status === 'verifying')
          ? { ...previous, status: 'expired' } : previous);
        setEvent(null);
        setResult('The local demo window expired. Create a new request to try again.');
        addActivity('Request expired. No payment was confirmed.', 'error');
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active, request]);

  useEffect(() => {
    if (!request || request.status !== 'verifying' || !event) return;
    const timer = window.setTimeout(() => {
      const verification = verifyDemoEvent(request, event);
      setRequest(previous => previous?.reference === request.reference
        ? { ...previous, status: verification.status } : previous);
      setResult(verification.message);
      setEvent(null);
      addActivity(verification.message, verification.status === 'success' ? 'success' : 'error');
    }, 900);
    return () => window.clearTimeout(timer);
  }, [request, event]);

  useEffect(() => {
    if (!copyNotice) return;
    const timer = window.setTimeout(() => setCopyNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [copyNotice]);

  function updateField(field: keyof PaymentForm, value: string) {
    setForm(previous => ({ ...previous, [field]: value }));
    setActionError('');
  }

  function fieldError(field: keyof PaymentForm) {
    return submitted || touched[field] ? errors[field] : undefined;
  }

  function fieldProps(field: keyof PaymentForm) {
    return {
      id: field,
      name: field,
      value: form[field],
      onChange: (e: ChangeEvent<HTMLInputElement>) => updateField(field, e.target.value),
      onBlur: () => setTouched(previous => ({ ...previous, [field]: true })),
      'aria-invalid': Boolean(fieldError(field)),
      'aria-describedby': `${field}-hint${fieldError(field) ? ` ${field}-error` : ''}`,
    };
  }

  function submitPayment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (locked) return;
    setSubmitted(true);
    if (Object.keys(errors).length) {
      const firstInvalid = Object.keys(errors)[0];
      formRef.current?.querySelector<HTMLInputElement>(`[name="${firstInvalid}"]`)?.focus();
      return;
    }
    try {
      const payment = createPaymentRequest(form);
      setRequest(payment);
      setNow(Date.now());
      setResult('');
      setActionError('');
      setQrCode('');
      setQrError('');
      addActivity(`Request created for ${formatMoney(payment.amountPaise)}. Waiting for a simulated event.`);
      checkoutHeading.current?.focus();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not create the request. Please try again.');
    }
  }

  function newPayment() {
    focusDraft.current = true;
    setRequest(null);
    setEvent(null);
    setResult('');
    setQrCode('');
    setQrError('');
    setActionError('');
    setCopyNotice('');
    setSubmitted(false);
    setTouched({});
    setScenario('success');
    addActivity('New draft started. Previous demo request closed.');
  }

  function sendEvent() {
    if (!request || request.status !== 'pending') return;
    const demoEvent = createDemoEvent(request, scenario);
    setEvent(demoEvent);
    setRequest({ ...request, status: 'verifying' });
    setResult('');
    addActivity('Simulated event received. Checking request fields.');
  }

  function expireRequest() {
    if (!request || request.status !== 'pending') return;
    setRequest({ ...request, status: 'expired' });
    setResult('Expiry simulated. The local request is closed; no payment was confirmed.');
    addActivity('Request expiry simulated.', 'error');
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(uri);
      setCopyNotice('UPI link copied');
      setActionError('');
    } catch {
      setCopyNotice('');
      setActionError('Clipboard access failed. Select and copy the UPI link in Request payload below.');
    }
  }

  function renderError(field: keyof PaymentForm) {
    const error = fieldError(field);
    return error ? <span className="field-error" id={`${field}-error`}>{error}</span> : null;
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="./" aria-label="Paylab home">
          <span className="brand-mark"><Icon name="bolt" /></span>
          <span>paylab<span className="brand-period">.</span></span>
        </a>
        <div className="header-divider" />
        <span className="header-subtitle">UPI playground</span>
        <span className="environment-badge"><span className="status-dot" /> Demo environment</span>
      </header>

      <main>
        <section className="hero" aria-labelledby="page-title">
          <div>
            <span className="eyebrow"><span className="eyebrow-line" /> BUILD. PAY. UNDERSTAND.</span>
            <h1 id="page-title">Payments, without<br />the guesswork<span className="green-period">.</span></h1>
            <p>A little playground for the complete UPI flow.<br className="desktop-break" /> Create a request, scan a code, and see validation in action.</p>
          </div>
          <div className="hero-note">
            <span className="small-icon-box"><Icon name="code" /></span>
            <div><strong>Real payment links.<br />Simulated outcomes.</strong><p>No keys. No backend. Just explore.</p></div>
          </div>
        </section>

        <nav className="flow-strip" aria-label="Payment flow">
          <div className="flow-step current"><span className="step-number">{request ? <Icon name="check" /> : '01'}</span><span>Configure request</span></div>
          <div className="flow-connector" />
          <div className={`flow-step ${request ? 'current' : ''}`}><span className="step-number">02</span><span>Scan or open UPI</span></div>
          <div className="flow-connector" />
          <div className={`flow-step ${request && !active ? 'current' : ''}`}><span className="step-number">03</span><span>Simulate & validate</span></div>
          <span className="flow-caption">A few clicks, the full picture.</span>
        </nav>

        <div className="workspace">
          <section className="card configuration" aria-labelledby="details-title">
            <div className="card-heading"><div className="heading-icon"><Icon name="wallet" /></div><div><h2 id="details-title">Payment details</h2><p>Start with the who, what, and how much.</p></div><span className="tag">01</span></div>
            <form ref={formRef} onSubmit={submitPayment} noValidate>
              <fieldset disabled={locked}>
                <legend className="sr-only">Configure a UPI payment request</legend>
                <div className="field amount-field">
                  <label htmlFor="amount">Amount <span className="required-mark">*</span></label>
                  <div className={`amount-input ${fieldError('amount') ? 'invalid' : ''}`}><span aria-hidden="true">&#8377;</span><input {...fieldProps('amount')} inputMode="decimal" placeholder="0.00" required autoComplete="off" /><span className="currency-label">INR</span></div>
                  <div className="amount-presets" aria-label="Suggested amounts">{['100', '499', '1000', '2500'].map(amount => <button type="button" className={parseAmount(form.amount) === Number(amount) * 100 ? 'selected' : ''} key={amount} onClick={() => updateField('amount', `${amount}.00`)}>{formatMoney(Number(amount) * 100).replace('.00', '')}</button>)}</div>
                  <span className="field-hint" id="amount-hint">Demo range: &#8377;1 to &#8377;1,00,000.</span>
                  {renderError('amount')}
                </div>
                <div className="field">
                  <label htmlFor="payeeName">Payee name <span className="required-mark">*</span></label>
                  <input {...fieldProps('payeeName')} autoComplete="off" maxLength={60} required placeholder="Your business or name" />
                  <span className="sr-only" id="payeeName-hint">The display name included in the payment request. Not bank-verified.</span>
                  {renderError('payeeName')}
                </div>
                <div className="field">
                  <label htmlFor="upiId">UPI ID <span className="required-mark">*</span><span className="label-aside">Virtual payment address</span></label>
                  <input {...fieldProps('upiId')} autoCapitalize="none" spellCheck={false} autoComplete="off" placeholder="yourname@bank" required />
                  <span className="field-hint" id="upiId-hint">The prefilled ID is a placeholder. Format checks do not verify an account.</span>
                  {renderError('upiId')}
                </div>
                <div className="field note-field">
                  <label htmlFor="note">Payment note <span className="label-aside">Optional</span></label>
                  <input {...fieldProps('note')} placeholder="What's this for?" maxLength={80} autoComplete="off" />
                  <span className="field-hint character-count" id="note-hint">{form.note.length}/80 characters</span>
                  {renderError('note')}
                </div>
                <button className="button button-primary create-button" type="submit"><span>{locked ? 'Request created' : 'Create payment request'}</span><Icon name={locked ? 'check' : 'arrow'} /></button>
              </fieldset>
              {locked && <button className="button button-secondary new-request" type="button" onClick={newPayment}><Icon name="refresh" /> Create a new request</button>}
              {submitted && Object.keys(errors).length > 0 && <p className="field-error" role="alert">Please correct the highlighted payment details.</p>}
            </form>
            <div className="form-footnote"><Icon name="lock" /><span>Your details stay in this browser tab. Nothing is sent to a server.</span></div>
          </section>

          <section className="card checkout" aria-labelledby="checkout-title">
            <div className="card-heading"><div className="heading-icon"><Icon name="qr" /></div><div><h2 id="checkout-title" ref={checkoutHeading} tabIndex={-1}>Checkout preview</h2><p>A small taste of your customer's experience.</p></div><span className="tag">02</span></div>
            <div className="checkout-content">
              <div className="merchant-avatar">{(request?.payeeName || form.payeeName.trim() || 'D').slice(0, 1).toUpperCase()}</div>
              <p className="paying-label">PAYING TO</p>
              <h3 className="merchant-name">{request?.payeeName || form.payeeName.trim() || 'Your payee'}</h3>
              <p className="merchant-upi">{request?.upiId || form.upiId.trim() || 'yourname@bank'}</p>
              <p className="payment-amount">{displayAmount === null ? '\u2014' : formatMoney(displayAmount)}</p>

              {!request && <div className="qr-placeholder"><div className="qr-placeholder-icon"><Icon name="qr" /></div><strong>Your QR code goes here</strong><p>Create a request to bring<br />this checkout to life.</p><span className="corner top-left" /><span className="corner top-right" /><span className="corner bottom-left" /><span className="corner bottom-right" /></div>}
              {request && active && <div className="qr-area">{qrError ? <p className="field-error" role="alert">{qrError}</p> : qrCode ? <img className="qr-code" src={qrCode} width="224" height="224" alt={`UPI payment QR for ${formatMoney(request.amountPaise)} to ${request.upiId}`} /> : <p className="qr-loading" role="status">Generating your QR code...</p>}</div>}
              {request && !active && <div className={`outcome outcome-${request.status}`}><span className="outcome-icon"><Icon name={request.status === 'success' ? 'check' : request.status === 'failed' ? 'close' : 'clock'} /></span><strong>{STATUS_LABELS[request.status]}</strong><p>{request.status === 'success' ? 'A successful flow, not a confirmed payment.' : request.status === 'failed' ? 'Try a new request to explore another outcome.' : 'The local demo window has closed.'}</p></div>}

              <div className="checkout-status" role="status">{request ? <span className={`status-pill status-${request.status}`}><span className="status-dot" />{STATUS_LABELS[request.status]}</span> : <span className="draft-label"><span className="status-dot" /> Waiting for your request</span>}</div>
              {request && active && <p className="expiry"><Icon name="clock" /> Demo window <strong>{countdown}</strong></p>}
              <p className="scan-description">{request && active ? 'Scan with a UPI app, or open one on your phone.' : 'Built for UPI. Designed for experimenting.'}</p>
              {request && active && <div className="checkout-actions"><a className="button button-primary" href={uri}><Icon name="external" /> Open UPI app</a><button className="button button-secondary copy-button" type="button" onClick={copyLink} aria-label="Copy UPI link"><Icon name="copy" /></button></div>}
              <p className="copy-notice" role="status">{copyNotice}</p>
              {request && active && <p className="handoff-warning">A UPI link can initiate a real payment if you enter a real ID. Opening an app or scanning is not proof of payment.</p>}
            </div>
            <div className="checkout-footer"><span className="upi-wordmark">UPI<span className="upi-triangle" /></span><span>One link. Any compatible UPI app.</span></div>
          </section>

          <section className="card validation" aria-labelledby="validation-title">
            <div className="card-heading"><div className="heading-icon"><Icon name="shield" /></div><div><h2 id="validation-title">Trust, but validate</h2><p>Know exactly what has been checked.</p></div><span className="live-badge"><span className="status-dot" /> LIVE</span></div>
            <div className="validation-list">
              <ValidationRow valid={!errors.upiId} title="UPI ID format" detail="Syntax only. Not account ownership." />
              <ValidationRow valid={!errors.amount} title="Amount & precision" detail="Within demo limits. At most 2 decimals." />
              <ValidationRow valid={Boolean(request)} title="Unique request reference" detail="Links a demo event to this request." idle={!request} />
              <div className="validation-row"><span className="check-icon unverified"><Icon name="lock" /></span><div><strong>Bank / gateway verification</strong><p>Not connected in this demo.</p></div><span className="row-badge">Not verified</span></div>
            </div>
          </section>

          <section className="card simulator" aria-labelledby="simulator-title">
            <div className="card-heading"><div className="heading-icon"><Icon name="code" /></div><div><h2 id="simulator-title">Try the what-ifs</h2><p>Send a pretend event. Watch the checks happen.</p></div><span className="tag tag-purple">SIMULATOR</span></div>
            <div className="simulator-body">
              <label htmlFor="scenario">Simulated provider event</label>
              <div className="simulator-controls"><select id="scenario" value={scenario} onChange={e => setScenario(e.target.value as Scenario)} disabled={!request || request.status !== 'pending'}>{SCENARIOS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><button className="button button-dark" type="button" onClick={sendEvent} disabled={!request || request.status !== 'pending'}><Icon name={request?.status === 'verifying' ? 'refresh' : 'arrow'} className={request?.status === 'verifying' ? 'spinning' : ''} /><span>{request?.status === 'verifying' ? 'Checking...' : 'Send event'}</span></button></div>
              <div className="simulator-meta"><span>{!request ? 'Create a request to unlock the simulator.' : request.status === 'pending' ? 'Checks reference, payee, amount, and currency.' : request.status === 'verifying' ? 'Validating locally. No network request is made.' : 'Create a new request to try another outcome.'}</span><button className="text-button" type="button" onClick={expireRequest} disabled={!request || request.status !== 'pending'}>Simulate expiry <Icon name="clock" /></button></div>
              <div className={`result-message ${result ? 'visible' : ''}`} role="status">{result && <><Icon name="info" /><span>{result}</span></>}</div>
            </div>
          </section>
        </div>

        {actionError && <div className="action-error" role="alert"><Icon name="info" />{actionError}</div>}

        <section className="activity-section" aria-labelledby="activity-title">
          <div className="activity-header"><div><Icon name="activity" /><h2 id="activity-title">Session activity</h2><span className="activity-count">{activity.length.toString().padStart(2, '0')}</span></div><span>Local to this tab · Latest 6 events</span></div>
          {activity.length ? <ol className="activity-list">{activity.map(item => <li key={item.id}><span className={`activity-dot ${item.tone}`} /><time>{item.time}</time><span>{item.message}</span></li>)}</ol> : <div className="activity-empty"><span className="empty-line" />A clean slate. Your test events will appear here.</div>}
          {request && <details className="request-payload"><summary><Icon name="code" /> Request payload <span>Inspect the UPI link</span></summary><dl><div><dt>Reference</dt><dd>{request.reference}</dd></div><div><dt>Currency</dt><dd>INR</dd></div><div><dt>UPI URI</dt><dd><code>{uri}</code></dd></div></dl><p>Demo expiry only disables this page's controls. A copied QR or UPI link is not revoked by this timer.</p></details>}
        </section>

        <aside className="demo-notice"><Icon name="info" /><div><strong>A playground, not a payment processor.</strong><p>All outcomes here are simulated and can be changed in the browser. Real confirmation requires a backend that verifies authenticated gateway events and reconciles the payment. Never treat a screenshot, UTR entry, or app return as proof.</p></div><span className="notice-label">POC ONLY</span></aside>
      </main>

      <footer className="site-footer"><span><span className="footer-brand">paylab.</span> A UPI proof of concept.</span><span>Made to explore. Not to settle.</span></footer>
    </div>
  );
}

function ValidationRow({ valid, title, detail, idle = false }: { valid: boolean; title: string; detail: string; idle?: boolean }) {
  return <div className="validation-row"><span className={`check-icon ${valid ? 'valid' : idle ? 'idle' : 'invalid'}`}><Icon name={valid ? 'check' : idle ? 'clock' : 'close'} /></span><div><strong>{title}</strong><p>{detail}</p></div><span className={`row-badge ${valid ? 'valid' : idle ? '' : 'invalid'}`}>{valid ? 'Passed' : idle ? 'Waiting' : 'Invalid'}</span></div>;
}
