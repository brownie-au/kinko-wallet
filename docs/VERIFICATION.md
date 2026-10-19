# Verification · Kinko Reimagined

## Story

Create a browser-generated Access Key → encrypt a named public-address watchlist → persist ciphertext with a separately derived authorization credential → restore independently on another browser → read public balances/HEX stakes → display verified data, or explicit unavailable/partial states.

## Completed checks

- `npm test`: 13 focused tests passed, covering crypto, independent clients, API storage semantics and financial boundaries.
- `npm run build`: production bundle succeeded using Vite 8.3.4 and ethers 6.17.0. Initial JavaScript about 220 KB (70 KB gzip) before final refinement; see final build output for exact size.
- `npm audit`: zero known vulnerabilities after replacing legacy build dependencies and ethers 5.
- Verified PulseChain contract source directly from Blockscout; `is_verified: true`, 102,819 source characters; confirmed `LAUNCH_TIME = 1575331200` and `(block.timestamp - LAUNCH_TIME) / 1 days`.
- Live PulseChain public-address probe returned native PLS, token holdings including HEX, genuine available/unavailable prices, chain block and currentDay. Never converted failed balances to zero.
- Ethereum endpoint checks found one old RPC returned HTTP 405; replaced it with a working `eth.drpc.org` fallback and implemented mid-read fallback with chain checks.

## Evidence to append after deployment

Live API create/restore/update/delete, independent client/browser restoration, rendered desktop/mobile QA, and any external-provider failures must be recorded below after those checks finish. Mocked unit tests alone do not establish deployed database or browser functionality.

## Explicit limitations

No independent penetration test. No guarantee of provider uptime. Ended-stake history and reward/penalty projections are absent. Real long-term portfolio history is not supplied; only current-session observations are drawn. Infrastructure allowance verification is distinct from confirmation of the owner's current account billing plan.

## Deployed results

Preview deployment `dpl_AdeYNVuzNDdsoJTcRkD9MuKGDn4j`, commit `e096f285e09c8a9587cc8ace95b237cb72bdfa7c`: Vercel returned **READY**; public application opened successfully without a ChatGPT/Vercel login.

Real deployed `/api/vault` checks passed against the configured Redis integration:

- Create a disposable encrypted account: HTTP 201.
- Independently derive credentials in a second client; retrieve/decrypt the saved address and name: HTTP 200, exact data match.
- Rename from the second client and restore from the first: persisted correctly.
- Write using the old revision: HTTP 409, no overwrite.
- Read using only the account identifier with an incorrect authorization credential: HTTP 401.
- Delete the disposable integration-test record: HTTP 200; subsequent restore: HTTP 404. No test key or credential was logged or committed.

Real deployed `/api/data` results:

- PulseChain holdings: HTTP 200, 27 rows, five priced assets, no discovery issues for the tested public address; unpriced tokens remained unpriced.
- PulseChain HEX stakes: HTTP 200, **18 open positions**, currentDay 2512.
- Ethereum HEX stake query: HTTP 200, zero positions for a separately tested address (a successful empty result).
- AUD FX: HTTP 200, USD/AUD 1.437, reference date 2026-10-16.
- Additional live verified-contract event probe found a PulseChain address with **303 open stakes** and decoded principal, T-Shares and maturity correctly. This was a direct provider check, not a browser test.

Desktop browser QA at 1348 CSS pixels verified the welcome page, demo dashboard, navigation, light/dark themes, wallet edit/save/renamed display, assets, HEX ladder, and stake detail dialog. No application-origin console errors were observed; the browser extension emitted unrelated metadata errors.

**Verification limits:** The provided browser cannot change viewport/device emulation, so real mobile/tablet rendering remains unverified. Responsive breakpoints and mobile navigation/touch controls are implemented. Cross-device crypto/cloud restoration was verified with independent clients against the real API, not two physical devices or authenticated browser sessions. Browser sign-in/creation itself was not exercised with real user credentials. Existing account plan/billing settings could not be inspected; no plan changes, financial obligations or paid integrations were created.

## Final delivery

Final runtime commit: `cea969dab86314607738fa98cfa604fbc0c19207`. Vercel deployment `dpl_8SUiwxScwUrDnyN6edE1M4hY7iuE` returned READY and its public page was opened and inspected:

https://kinko-wallet-v2-test-2w6waqaj0-rob-browns-projects.vercel.app/

Final production build: 222.37 KB JavaScript / 70.08 KB gzip; 50.88 KB CSS / 10.65 KB gzip. All 13 focused tests passed. The final browser view also confirmed the corrected small-token price display (`0.018` rather than a rounded `0.02`).

[Desktop screenshot — clearly labelled illustrative demo](screenshots/kinko-desktop.jpg)

A requested-by-agent optional friendly alias was rejected by automatic approval review because it could displace existing public routing. No alias was changed. Delivery uses the verified Vercel-generated preview URL. The main domain and existing V2 test production URL retain their previous deployments.

## Remember This Device · 20 October 2026

- Added an unchecked-by-default Remember This Device control to existing access/create forms, plus automatic restoration before showing the welcome screen.
- Checked: AES-GCM sealed derived credentials persist in origin-scoped IndexedDB across visits. Unchecked: the sealed credentials exist only in sessionStorage for the current tab session; refreshes restore that session. A non-extractable wrapping CryptoKey is structured-cloned through IndexedDB; the raw Kinko Access Key is never stored.
- Explicit logout clears both authentication locations and the device key, invalidates in-flight restores, and notifies other tabs. Account deletion also forgets device access. If IndexedDB deletion is temporarily blocked, a non-secret logout marker prevents automatic restore; if Web Storage is blocked, IndexedDB deletion is still attempted.
- Restored sessions fetch the current encrypted cloud watchlist. Offline cached data is explicitly local; missing or rejected cloud accounts require re-entry of the key.
- Added 12 lifecycle tests using actual Web Crypto and fake-indexeddb's IndexedDB implementation: refresh/session-end separation, simulated browser restart, no raw key/auth material in stored JSON, non-extractable keys, switching from remembered to session-only, logout cleanup, blocked storage, tampering, logout races, stale tabs, and cloud/offline restoration.
- Full suite: **25 tests passed**. Production build passed (228.28 KB JavaScript; 71.96 KB gzip). Production dependency audit: zero known vulnerabilities.
- Lifecycle restart checks are automated storage-context simulations, not claims of physical-device or browser-process restart testing. Saved access is scoped to the exact origin; use the same URL and browser profile. Browser session-recovery settings may restore sessionStorage, so explicit logout is required on shared devices.

Deployment for this feature: `dpl_2Bq3JouikPjj4ZE19M3krwTwfnxn`, runtime commit `d0960ed874a1b14337dfcdce7f7762cd651f9ce8`, status **READY**. Browser inspection verified the returning-user checkbox defaults off, is selectable, and switches between session-only and trusted-device help text. No real user key was entered during UI inspection.

Use the stable branch preview for remembered access:
https://kinko-wallet-v2-test-git-feature-kin-b1ea48-rob-browns-projects.vercel.app/

[Login checkbox screenshot](screenshots/remember-this-device.jpg)

## Opera / password-manager dialog compatibility · 20 October 2026

The reported symptom was an access dialog that disappeared immediately in Opera with Dashlane, while Chrome without Dashlane worked. The supplied images were unavailable in this workspace, and Opera/Dashlane are not installed in the verification browser, so the exact cause remains unconfirmed.

- Access/create dialogs now require their explicit Close control or Escape to dismiss; clicking outside cannot discard the form.
- Shared dialogs only dismiss on an outside pointer gesture that starts and ends outside the dialog bounds. A standalone scripted click, padding click, inside-to-outside drag, or cancelled gesture does not dismiss them.
- Access forms and both Access Key fields use Dashlane's documented `data-form-type="other"` hint. This requests no autofill for these custom key fields; it does not prevent extensions from inspecting the DOM or guarantee that every extension will respect the hint. Source: https://support.dashlane.com/hc/en-us/articles/4420122792594-Optimize-your-web-forms-for-Dashlane-autofill
- Close controls explicitly use `type="button"`. Existing authentication, encryption and remembered-device storage are unchanged.
- Added five React/DOM regression tests with jsdom. Full suite: **30 passed**. Production build passed: 228.69 KB JavaScript / 72.12 KB gzip. Production dependency audit: zero known vulnerabilities.
- Native Escape/top-layer behaviour needs live-browser inspection; jsdom's dialog lifecycle is shimmed and does not establish Opera/Dashlane compatibility.

Deployment `dpl_6NEyDnJx4YHbqz9ZMrdm7ggR1NA4`, runtime commit `8e6213a792eb4480f822a08d23b3df92581173bc`: **READY**. On the stable branch preview, live Chrome inspection confirmed the Dashlane field hint, persistent form after a real outside click, Close and native Escape dismissal, focus returning to the landing-page access button, and selectable Remember This Device help text. No key was entered. This verifies the updated Chromium UI but does not reproduce the user's Opera/Dashlane setup.

[Verified access dialog](screenshots/access-dialog-compatibility.jpg)

## Dashlane phishing warning follow-up · 20 October 2026

New screenshots were available for inspection and show Dashlane's **Phishing risk detected** warning with its AI-model explanation. This establishes that the reported warning is phishing classification, not just autofill. The earlier autofill hint does not exempt a site from phishing checks. The warning appears dimmed behind Kinko's native modal. Native `showModal()` makes other document elements inert; a conflict with an injected extension prompt is plausible, but the exact Opera/Dashlane interaction is not reproduced here.

Returning-user access now uses a normal document-flow screen, keeping the existing form, encrypted backup import and Remember This Device control. It has an accessible page heading and Back to Kinko control, with no modal top layer or focus trap blocking external extension UI. Creation retains its existing dialog. Authentication and encryption are unchanged. This is a UI interoperability fix, not a change to Dashlane's security verdict.

Added a React/DOM regression for the access screen: no dialog or inert state, external security UI remains focusable/clickable without leaving access, heading focus and Back control work. All **31 tests pass** and production build passes. The browser suite does not reproduce the Opera/Dashlane extension environment.

Dashlane's official resolution for incorrect phishing classifications is an owner report through Support Chat. A user may also choose the extension's site-specific trust control after independently verifying the URL. No extension settings were changed and no report was submitted on the user's behalf.

References:
- https://support.dashlane.com/hc/en-us/articles/33017283560594-I-own-a-website-that-is-being-flagged-for-phishing
- https://support.dashlane.com/hc/en-us/articles/30786899404690-AI-Powered-Scam-Protection-for-personal-plans
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal

Deployment `dpl_CiXQGnxnx2WhnvL4MvjUxemwLzWG`, runtime commit `ae3366fdeb0062ef44832be5772b261e929f0932`: **READY**. Live Chrome inspection of the stable branch preview confirmed the normal access screen with zero open native dialogs, initial heading focus, selectable Remember This Device with updated help text, Back returning to the landing page and restoring focus to Access my Kinko, and successful reopening. The deployed script was `index--DWZcv9x.js`. No key was entered. Final build: 229.85 KB JavaScript / 72.33 KB gzip. This does not establish that Dashlane's classification has changed or reproduce Opera with Dashlane.

[Access screen after compatibility update](screenshots/access-screen.jpg)

## Network notices and portfolio observations · 20 October 2026

The supplied screenshot shows a generic token-discovery warning and an unconfigured BNB discovery notice. Reproduced a concrete cause: Ethereum Blockscout returned HTTP 422 `Unexpected field: type` for `/token-balances?type=ERC-20`. The same address returned HTTP 200 without that parameter, and the documented `/tokens?type=ERC-20` endpoint returned paginated data.

- Discovery now uses the documented filtered/paginated endpoint. Legacy HTTP 404/422 responses fall back to unfiltered `/token-balances` without the rejected parameter. Up to five pages are read, with an explicit partial-coverage notice at the limit.
- Invalid metadata records are skipped with a notice, retaining valid tokens. Later-page failures retain earlier results. Optional on-chain name/symbol failures no longer discard verified contract quantities; decimals and balance remain required. Explorer-marked spam is excluded.
- Structured notices retain legacy issue strings for compatibility. They distinguish manual discovery limitations, HTTP errors/rate limits, missing metadata, page limits and native/contract failures. Successful native balances are not marked stale simply because discovery failed.
- UI notices identify the network and number of affected wallets, open with actionable explanations, and offer a retry or a token-contract shortcut with the right network selected. Known coverage limitations no longer claim that all providers/cached balances are stale. BNB automatic discovery remains unconfigured; native BNB and explicit contracts continue to be checked. No paid service or new provider account was created.
- The chart now accepts clearly labelled partial observations from fresh, priced holdings, excluding stale and unpriced balances. Identical cached timestamps do not add points. Asset/read coverage is tracked and a changed coverage set begins a new series, preventing provider recovery from drawing a false portfolio gain/loss. The tile states whether it is loading, waiting for usable data, holding the first observation, or restarting for changed coverage. History still lives only in the current page session and is not backfilled.
- **46 tests passed**, including eight discovery regressions, six quality/history regressions and a rendered React notice/action check. Production build passed: 233.83 KB JavaScript / 73.76 KB gzip. No authentication changes.

Direct provider checks: a normal Ethereum test address returned five discovered tokens with complete status and no discovery issues using the corrected request. A high-token-count PulseChain address returned 250 tokens with the explicit page-limit notice. Some direct Base/Polygon calls received HTTP 403 challenge pages; these are retained as visible upstream failures, not bypassed. A separate high-token-count Ethereum call was temporarily unavailable, so provider uptime is not guaranteed.

Reference: https://github.com/blockscout/blockscout-api-v2-swagger/blob/main/swagger.yaml (`/addresses/{address_hash}/tokens` supports type/pagination; `/token-balances` lists only the address parameter).

Deployment `dpl_6DYNxYRL1cDMgtj732Ckg13zw9tv`, runtime commit `fba6eddc51c76840757feb30d4b960c5011d2835`: **READY**. Live deployed POST `/api/data` checks against the same public test address returned HTTP 200 on all five networks:

- Ethereum: complete discovery, six balance rows, three priced, no discovery notices. The former HTTP 422 is resolved for this check.
- PulseChain: 22 balance rows, four priced; valid records retained alongside the explicit incomplete-metadata notice.
- Base and Polygon: native balances/prices returned; discovery is explicitly unavailable because each explorer returns HTTP 403 from the deployed service.
- BNB: native balance/price returned; discovery correctly reported as manual/unconfigured rather than a temporary provider outage.
- The production-response data produced valid, explicitly partial chart observations for all five network checks using the same observation helper as the UI.

Browser inspection confirmed the stable branch URL serves the new `index-DUKetiZn.js` runtime. Notice rendering, network grouping, action routing and disabled states were verified through React/DOM tests. A real signed-in user session and two-point live chart rendering were not exercised in the browser; no user Access Key was requested or entered. Remaining upstream discovery limitations are retained visibly and are not claimed resolved.

## First-reading display and encrypted browser history · 20 October 2026

The follow-up screenshots show the updated notices and a recorded first observation, but the tile withheld its numeric reading until a second comparable point existed. History was also erased on page refresh. This was a display/persistence limitation, not a need to keep refreshing until every provider worked.

- The first actual reading now displays immediately as a liquid value, real timestamp, partial/complete coverage label and table row. A single baseline marker is shown; no second point or performance line is fabricated. Up to five recent readings remain visible in the table, including readings from earlier coverage sets. The graph connects only the latest comparable coverage series.
- History is encrypted on the current browser using AES-GCM with fresh IVs, the account's existing non-extractable encryption key, account binding and a distinct portfolio-history authenticated context. Coverage identities are SHA-256 hashed; neither raw Access Keys nor plaintext amounts/coverage are persisted. History is separate from cloud watchlist revisions and does not introduce cloud writes or new credentials.
- On sign-in/restoration, saved history is loaded before live readings are added. Storage failures display an explicit page-only-history message. Data is bounded to 2,000 observations over 31 days. Account deletion clears this browser history; an in-flight write in the same store cannot recreate a cleared record. Chromium Web Locks serialize same-origin save operations when available; other browsers use best-effort merges.
- An automatic refresh runs every two minutes while the app is signed in, idle and visible, and skips offline/hidden pages. No background collection while closed and no historical backfill. Saved history is browser-specific, not synchronized across devices or included in watchlist exports.
- Coverage notices now start collapsed so they do not consume multiple mobile screens. Failed/stale balance notices remain expanded. Actual upstream Base/Polygon discovery blocks, BNB manual discovery and unpriced-token limitations are still reported; this change does not claim to resolve them.
- **52 tests pass**. Added genuine Web Crypto history tests covering fresh-store restoration, account/purpose binding, tampering, bounded large payloads, blocked storage and clear/write races. A full React App integration test uses a generated disposable test session, actual encryption and fake IndexedDB, with simulated upstream responses: confirms first partial value/table row, automatic second reading and graph, encrypted persistence, and restoration on remount. Rendered component tests check first-point semantics, privacy masking, storage-error copy and collapsed/expanded notices. No real user credentials were entered or logged.
- Production build passed: 238.17 KB JavaScript / 75.06 KB gzip. A narrow component HTML fixture was generated for QA, but file-protocol browser navigation is unsupported; no workaround was attempted. Rendered React/DOM verification passed. Physical Android rendering and real authenticated browser refresh/restart remain unverified.

Deployment `dpl_57UDuvoUcDFGjkNMJ3L3QRgka5ka`, runtime commit `1881231a6bd1ab34b3c14a2d67d718b37cfbc1f0`: **READY**. Live Chrome inspection confirmed the stable branch preview loads Kinko and the expected `index-DRcegmXD.js` runtime. The signed-in observation lifecycle is covered by the full App integration test described above; this public-page check does not establish real Android or authenticated browser restart behaviour.
