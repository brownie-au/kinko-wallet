# Kinko Wallet V2 mobile UI review

Branch: `feature/kinko-wallet-v2`. Draft PR #1; no production release.

## Audit scope and findings

Source review covered the actual Kinko routes: landing, dashboard, portfolio, wallet management and detail, about, HEX/eHEX staking and ETH/PLS coming-soon pages; shared navigation, theme controls, dialogs and transaction history. The bundled template/demo routes were not exhaustively audited.

- Multiple runtime gap adjustments overrode header spacing and changed margins on DOM mutations. Header and drawer used different mobile breakpoints.
- Portfolio columns retained desktop-sized widths even at phone widths. Wallet detail used a dense table; long names and addresses were clipped.
- Network filters did not wrap or expose selection to assistive technology. Navigation groups were mouse-only and active groups could not close.
- Exact balance strings were only available through hover titles. Contract copying used a nonsemantic clickable span without success feedback.
- Wallet ordering relied on dragging. Secondary backup/ID actions competed with the add-wallet form.
- History filters had fixed 200px/400px widths; loading could look like an empty history. The `/wallets` route was a placeholder.
- Some dialogs had unassociated labels; touch targets and keyboard focus were inconsistent. The clear-device action referenced an undefined navigation function.

## Implemented

- One scoped layout stylesheet replaces runtime gap mutation scripts. Mobile navigation remains in normal document flow, so it does not cover content. Existing Bootstrap Offcanvas provides close, Escape, focus trapping and focus restoration; navigation closes on route changes.
- Direct Portfolio/Wallets links, current-page indicators, keyboard-operable collapsible groups, skip-to-content link, and existing Light/Dark/System controls in the menu.
- Responsive two-column asset cards and wallet-detail cards at phone widths; sorting remains available on mobile. Full exact quantities expand by touch/keyboard, contracts and wallet addresses remain selectable/copyable.
- Network chips wrap, expose pressed state and have larger targets. Readable inputs, visible focus, 44px controls, reduced-motion support, wrapping totals, and scrolling dialogs.
- Wallet reorder buttons alongside existing drag behavior, full wrapped addresses, grouped backup/ID tools, clearer device-clearing label and repaired navigation after clearing.
- Dashboard introduction and empty-wallet action. Portfolio distinguishes loading, missing holdings and filtered results, offers filter reset, and collapses detailed network notices. Wallet detail adds a local refresh and copy status. Unknown breakdown values stay unavailable.
- History controls wrap; the wide transaction table remains horizontally scrollable with an explicit hint and keyboard-focusable region. No history columns removed.
- Existing chain retrieval, precision arithmetic, valuation, cache keys and watch-only model retained; no dependencies added.

## Verification and limits

- Existing ten regression tests plus a server-rendered accessibility/precision test: 11 pass. The new test verifies exact large/tiny decimal strings and zero survive rendering, unavailable stays distinct, and network selection is exposed accessibly. These are not browser interaction tests.
- Production build passes. Changed-source lint has no errors and 25 warnings (hook dependencies and unused suppression directives). No TypeScript check script exists in this JavaScript project.
- Vite reports ready on `http://127.0.0.1:3000`, but subsequent HTTP checks cannot reach that listener. The remote browser cannot connect to that address (`ERR_CONNECTION_REFUSED`). The hosted V2 branch preview redirects this browser to Vercel login.
- Consequently no rendered before/after screenshots, browser mobile simulation or physical-phone testing was completed. Do not treat the responsive CSS as visually accepted.
- Required browser acceptance remains pending at **320, 375, 390, 430, 768 and 1440 CSS pixels**, in both themes: add/rename/hide/reorder wallets; keyboard and touch navigation; network filters; long token names and exact tiny/large balances; loading/provider failures; backup/import/Portfolio ID dialogs; history/staking tables; zoom, focus order, contrast and keyboard-open dialogs.
- Live funded-wallet comparisons and server-backed Portfolio ID journeys remain unverified. Existing provider/data limitations in DEVELOPMENT.md still apply. No settings or access protections were weakened to obtain screenshots.

## Review

Open the branch preview from draft PR #1 while signed in to the Vercel account that owns the project. The preview has separate browser storage from production. Keep this PR in draft until the browser acceptance checklist above has been completed. Production requires separate approval.
