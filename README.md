# pay.bipul.in - Simple UPI payments

A React + TypeScript app that turns a UPI address into a shareable payment page. No backend, API credentials, or database required.

## Payment pages

- Visit `https://pay.bipul.in/` and enter a recipient's UPI address.
- Or open a direct link, such as `https://pay.bipul.in/alumni.fundcollection@boi`.
- On mobile, the payment page shows app-specific payment buttons. On desktop, it immediately shows a QR code and a **Pay with UPI app** button.
- Choose the amount and verify the recipient in your UPI app before authorizing payment.
- **Copy payment link** copies the shareable website URL, so another person can scan the QR or open their own UPI app.

The alumni page uses this exact payment URI:

```text
upi://pay?pa=alumni.fundcollection@boi&pn=JNV%20Sitamarhi%20Alumni
```

Other valid addresses are supported at `/{upi-address}`. For unknown recipients, the UPI address itself is the display label and `pn` value; no bank-name lookup is performed. No amount or transaction reference is imposed. Query parameters do not override the recipient or payment details.

Addresses are syntax-checked: 2-256 characters before `@` (letters, digits, `.`, `_`, `-`, starting with a letter or digit), and a 2-64 character alphanumeric handle starting with a letter. Homepage input is trimmed. Encoded addresses such as `/alumni.fundcollection%40boi` and a single trailing slash are supported. Invalid or malformed paths show an error and address-entry form, never a payment action.

The old playground and simulated payment outcomes have been removed.

## Mobile UPI Intent

Mobile handoff follows the **one-time payment** scheme mappings in [Solidgate's UPI Intent guide](https://docs.solidgate.com/payments/alternative-payments/apms-overview/upi/upi-intent/). Selecting an app replaces only the `upi://pay` prefix; the original encoded query is preserved unchanged. The QR always contains the generic UPI URI, never an app-specific URI.

| App | Payment prefix | Platforms |
| --- | --- | --- |
| Google Pay | `tez://upi/pay` | Android, iOS |
| PhonePe | `phonepe://pay` | Android, iOS |
| Paytm | `paytmmp://pay` | Android, iOS |
| BHIM | `bhim://upi/pay` | Android, iOS |
| CRED | `credpay://upi/pay` | Android, iOS |
| Amazon Pay | `amazonpay://upi/pay` | Android |
| Navi | `navi://pay` | Android |

Google Pay, PhonePe, Paytm, and BHIM appear first; **Show more UPI apps** reveals the remaining apps for the device. Android also offers **Other UPI apps** using the generic URI. iOS has no generic chooser because its universal UPI app tray is not supported. Both mobile platforms offer **Show QR code instead** to scan using another phone.

Device detection uses the browser's user agent and includes touch-enabled iPadOS browsers reporting a Macintosh user agent. A narrow desktop window remains QR-first. User-agent overrides and some embedded browsers can affect detection or app handoff.

Links launch only on an explicit tap. The site cannot determine which apps are installed or whether a payment finished. If an app does not open, try another installed app, use the QR, or open the page in Safari/Chrome rather than an embedded browser. The displayed letters are app labels, not official logos. Apps listed by the provider without documented scheme mappings are not guessed or added.

This is a static UPI link generator, **not a Solidgate Payment Form/API integration**. No provider session, 15-minute provider expiry, order tracking, webhook confirmation, or recurring mandate is implemented. Provider-specific amount limits do not apply to this page; the payment app and bank decide whether to accept an address-only payment link. The amount is still entered in the payment app.

## Run locally

Use Node.js 22.12+ (22.x), 24.x, or 26+.

```sh
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://127.0.0.1:5173`). Direct payment paths also work locally.

```sh
npm test          # Address, routing, QR/link, and interaction tests
npm run build    # Type-check, production build, and GitHub Pages fallback
npm run preview  # Serve the production build locally
```

The production output is in `dist`. No environment variables are required.

## Deploy to GitHub Pages

`.github/workflows/deploy-pages.yml` runs on pushes to `main` and can also be started manually from the Actions tab on `main`. It installs dependencies from the lockfile, runs tests, builds the site, verifies the custom domain and deep-link fallback, and publishes only `dist` to the **`gh-pages` branch**. Action versions are pinned to commit SHAs. The workflow uses the automatic `GITHUB_TOKEN` with `contents: write`; no personal access token is needed.

`public/CNAME` contains `pay.bipul.in`. Vite copies it into `dist/CNAME`, so every deployment preserves the custom domain. The publishing action creates `.nojekyll`.

The build also copies the compiled `index.html` to `404.html`. GitHub Pages serves this app shell for addresses without a physical file, so opening or refreshing `/{upi-address}` renders the payment page without a redirect or hash URL. Assets use root-relative paths. GitHub Pages still returns HTTP **404** for these deep links; this is a static-host limitation, not a failed payment page. For HTTP 200 deep links on another host, configure all non-file paths to rewrite to `index.html`.

One-time repository/domain setup:

1. Commit and push the source to `main`, then let **Deploy to GitHub Pages** create the `gh-pages` branch. Repository/organization Actions policies must permit the workflow's write permission and pinned actions.
2. In **Settings > Pages**, choose **Deploy from a branch**, select **gh-pages**, select **/(root)**, and save. For the first deployment, rerun the workflow after choosing this publishing source if necessary.
3. Set the Pages custom domain to **pay.bipul.in**. At your DNS provider, add a **CNAME** record for **pay** pointing to **bipulraman.github.io** (not a repository URL). Avoid conflicting records for that hostname.
4. Once GitHub's DNS check and certificate provisioning complete, enable **Enforce HTTPS**. Domain verification in your GitHub account is also recommended.

The root-relative routes and assets target `https://pay.bipul.in/`. Hosting under a repository subpath would require corresponding route and Vite base-path changes.

Local changes do not update GitHub Pages settings or DNS, and do not deploy anything until committed and pushed.

## Payment and privacy boundaries

- **These links can initiate real payments.** Verify the recipient's name, UPI address, and amount inside your UPI app before authorizing.
- UPI addresses and display names are **not bank-verified** by this site. Syntax validation does not establish account ownership or existence.
- This site does not detect or confirm payments, collect UPI PINs, or offer refunds. Opening an app, scanning a QR, or returning to the browser is not proof of payment.
- A compatible UPI app must be installed for mobile handoff. Desktop users should scan with a phone. Individual apps may reject generic links depending on their policies.
- QR generation happens locally. No payment data is sent to an application backend or saved in browser storage. The UPI address is part of the page URL and is visible to the hosting provider, browser history, and anyone receiving the link. Google Fonts is used for typography, with system-font fallbacks.
