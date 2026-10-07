# Paylab - UPI payment playground

A React + TypeScript proof of concept for creating a UPI payment request and exploring **simulated** payment validation. Built with Vite; no backend, API credentials, or database required.

## Run locally

Use Node.js 22.12+ (22.x), 24.x, or 26+.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://127.0.0.1:5173`).

```sh
npm test          # Validation and interaction tests
npm run build    # Type-check and production build
npm run preview  # Serve the production build locally
```

The production output is in `dist` and can be hosted on a static web host. No environment variables are required.

## Deploy to GitHub Pages

`.github/workflows/deploy-pages.yml` runs on pushes to `main` and can also be started manually from the Actions tab on `main`. It installs the lockfile dependencies, runs the tests, builds the site, checks the custom domain file, and publishes only `dist` to the **`gh-pages` branch**. Action versions are pinned to commit SHAs. The workflow uses the automatic `GITHUB_TOKEN` with `contents: write`; no personal access token is needed.

`public/CNAME` contains `pay.bipul.in`. Vite copies it into `dist/CNAME`, so every deployment preserves the custom domain. The publishing action also creates `.nojekyll` to serve the compiled static files without a Jekyll build.

One-time repository/domain setup:

1. Commit and push the source to `main`, then let **Deploy to GitHub Pages** create the `gh-pages` branch. Repository/organization Actions policies must permit the workflow's write permission and the pinned actions.
2. In **Settings > Pages**, choose **Deploy from a branch**, select **gh-pages**, select **/(root)**, and save. For the first deployment, rerun the workflow after choosing this publishing source if necessary.
3. Set the Pages custom domain to **pay.bipul.in**. At your DNS provider, add a **CNAME** record for **pay** pointing to **bipulraman.github.io** (not to a repository URL). Avoid conflicting records for that hostname.
4. Once GitHub's DNS check and certificate provisioning complete, enable **Enforce HTTPS**. Domain verification in your GitHub account is also recommended.

The Vite root base path is intentional for `https://pay.bipul.in/`. If you remove the custom domain and serve from `https://bipulraman.github.io/pay.bipul.in/`, update Vite's `base` accordingly before deploying.

Creating these files locally does not change your GitHub Pages settings or DNS, and does not deploy anything until the changes are committed and pushed.

## Explore the demo

1. Enter a payee name, UPI ID, INR amount, and optional note. The initial `demo.merchant@upi` is an unverified placeholder, not an account to send money to.
2. Create a request to generate a QR code and `upi://pay` link. Each request gets a new reference. Inputs are locked so the QR, link, and validation use the same snapshot.
3. Send a simulated success or decline event. Try reference, amount, payee, and currency mismatches: these are rejected and leave the request pending.
4. Simulate expiry or let the five-minute demo window expire. Closed requests no longer accept events. Create a new request to try another scenario.
5. Inspect the request payload and the most recent six events in the session activity area.

You can run the entire simulation without opening a UPI app. QR creation and validation happen locally. State exists only in memory and is cleared on refresh. Google Fonts is used for typography; system fonts provide a fallback. Payment data is not sent to a server.

## What is validated?

| Check | Behavior |
| --- | --- |
| Payee name | 1-60 characters after trimming; no control characters. This is a display label, not an account-name lookup. |
| UPI ID | Conservative demo syntax: 2-256 characters before `@` (letters, digits, `.`, `_`, `-`, starting with a letter or digit), and a 2-64 character alphanumeric handle starting with a letter. Surrounding whitespace is trimmed. |
| Amount | INR 1 to 1,00,000 inclusive, at most two decimal places, no signs, commas, or exponents. Stored as integer paise, not floating-point rupees. These are **demo limits**, not universal UPI limits. |
| Note | Optional, up to 80 trimmed characters, no control characters or line breaks. |
| Request | A random reference, immutable request details, and a local five-minute expiry. The link encodes `pa`, `pn`, `tr`, `am`, `cu`, and optional `tn`. |
| Simulated event | Must match the request reference, payee ID, exact integer amount, and INR currency. Duplicate/late events cannot reopen a closed request. |
| Account / actual payment | **Not verified.** No bank lookup, gateway API, webhook, signature verification, or settlement reconciliation exists in this POC. |

## Important boundaries

- **All payment outcomes are fabricated.** A green demo result is not proof of funds or payment.
- UPI links and QR codes use the real UPI URI format. If you replace the placeholder with a real address and authorize payment in a UPI app, you may move real money. This POC cannot detect, confirm, reverse, or refund that payment.
- Mobile handoff needs an installed UPI-compatible app. Desktop browsers may not have a protocol handler; scan the QR with a phone instead. PSPs can reject generic links depending on merchant onboarding and other rules.
- Opening an app, returning to the browser, entering a UTR, or uploading a screenshot must never mark an order paid.
- The expiry only closes the **local demo**. It does not revoke a copied link/QR or cancel anything with a bank. Real late payments require server-side reconciliation.
- Client-side checks are UX checks, not a security boundary. A user can modify any state or event in developer tools.

## For trustworthy real-payment verification

Use a supported payment gateway's sandbox first. A backend must create and persist the order and expected payee, amount, currency, and gateway identifiers. Keep credentials server-side, authenticate gateway events using that provider's signature scheme, deduplicate events, and reconcile with the gateway's server-to-server payment-status API before updating the order. The React app should read only your backend's authoritative status, not trust client callbacks. Handle replayed/out-of-order events, late success, refunds, and settlement independently.

This demo intentionally does not impersonate that integration or collect UPI PINs, bank credentials, or UTRs.
