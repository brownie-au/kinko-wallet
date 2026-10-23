# Verification and review package

23 October 2026 UTC. Evidence types are intentionally distinct: deterministic fixtures, live public-fixture provider/API calls, and actual desktop browser interaction. No signed-in owner holdings were inspected. No reference images were available.

## Story and boundaries

Unlock → authenticated decryption of browser history → chart before provider completion → current balance refresh / incremental archive API → encrypted merge → later reopen / encrypted export-import. The chart represents saved actual liquid readings plus labelled partial archive valuations. It never prices present holdings at an old date.

| Acceptance area | Result | Evidence / limits |
| --- | --- | --- |
| Interface and six ranges | PASS desktop; implemented responsive | “Portfolio history”, green SVG area/line, all six controls. Browser clicks verified each selected range in both themes; chart has 40 explicitly fictional demo points, real timestamp scale. Value-change calculations tested on actual-history fixtures |
| Mobile 360px and finger drag | **BLOCKED runtime verification** | CSS uses six ≥44px controls and responsive plot/labels. This CUA browser exposes no supported viewport/device emulation control. A local preview attempt was blocked by browser policy; no bypass attempted. No physical touch or 360px browser screenshot claim. This requires a device/360px browser check before production approval |
| Cached loading under 1 second | PASS fixture integration | Node v24.19.0, React 18.3.1, JSDOM 30.1.3, Linux test environment. Final parallel full-suite restoration **60.4ms** (earlier runs 64.6–455.7ms) with external balances deliberately held pending. Actual AES-GCM and browser-storage adapter used; not a physical-device performance benchmark |
| Persistence / reopening | PASS fixture integration | Store instance recreation, React unmount/remount with remembered session, held provider responses, authenticated encrypted export/import and v1 migration. Useful old ciphertext is never rewritten on read; corrupted ciphertext is never overwritten by new readings. Browser close/relaunch on an owner session was not performed |
| Failure resilience and freshness | PASS fixtures | Real-mode React test simulates failed refresh, retains the chart and original observation time, displays network-unavailable/saved-history status. Failed backfill does not advance valuation time. HTTP 429/backoff and null results covered |
| Numerical correctness | PASS fixtures and live subset cross-check | Exact expected 202.469134 USD and value-change 25.05 USD / 20% within 1e-10 tolerance; zero baseline has unavailable %. Deployed Base response independently recomputed using Python Decimal; rounded chart display is currency precision, not a stored zero |
| Comparability | PASS fixtures | Different wallet/network coverage, partial state, sources, methods, price timestamp quality, compaction boundaries and gaps split SVG segments and disable full-interval comparisons. Actual shorter comparison interval shown |
| Missing prices and genuine zero | PASS fixtures | Null unknown values, timestamp/confidence rejects, genuine zero balances and no fabricated point/trend. No-history, one-point, three-day/1Y and all six windows tested |
| Historical integrity | PASS implementation + live partial evidence | Historical block-pinned native/ERC20 balances, contract decimals and contemporaneous quotes; no current amount enters archive valuation. Base and PulseChain native/wrapped subsets live verified at 2024-07-28. Not a complete wallet history |
| Coverage of five networks | PASS documentation; **PARTIAL data** | COVERAGE.md and JSON evidence. ETH/Polygon/BNB tested unkeyed PublicNode archive state rejected; Base/Pulse subsets work. Sold discovery and historical staking incomplete. Public fixture only, not the owner's earlier eight-wallet investigation |
| Retention and migration | PASS fixtures | 800-day data, extrema and one-point coverage boundaries survive compaction. v1 cache retains >500-day sample and original ciphertext until successful save. Representative one-year/100-asset provenance fixture stays under 1 MB encrypted. No age-based deletion |
| API efficiency | PASS fixtures / bounded implementation | Concurrent requests coalesced, bounded workers, fixed source precedence and repeated-backfill merge tests. Encrypted 24-hour attempt checkpoint; integration test proves reopening does not repeat the same backfill. At most 8 pairs/range/visit, 12 contracts/pair, 2 active server histories. Not a distributed multi-instance quota guarantee |
| Late responses | PASS cancellation/fixture integration | Account generations and cleanup guards retain the current scope/range; slow response restore test and concurrent-save/clear tests. No late selected-range response replaces a newer selected-range state |
| Privacy | PASS scoped checks | AES-GCM authenticated compression/encryption, purpose/account binding, no plaintext financial values or coverage in storage, tamper rejects, no client provider secret introduced. Build imports exclude server history provider. Existing discovery credentials stay server-side. Not an independent full-app security audit |
| Release checks | PASS | All **114** npm tests and Vite release build pass. Initial legacy-history assertions were updated to require visible points rather than “History building”; no assertions were skipped. See test-output.txt and build-output.txt |
| Review branch / PR / preview | PASS | feature/portfolio-history-verified → draft PR #3 against active feature/kinko-reimagined; public Vercel test-project preview. GitHub connector published source because terminal git push lacked credentials. Remote source tree matched local source tree before each publication |
| Production boundary | PASS within performed actions | Feature commits and draft PR only. No merge, production promotion, domain/alias reassignment, billing/plan change or user-history deletion. Existing kinko-wallet project also attempts its own feature Preview and reports failure; this pre-existing integration was not reconfigured. Test project Preview is READY. Privileged production/build-log audit is unavailable because Vercel team connection returns 403 |

## Live evidence, not fixtures

- Public fixture: `0xd8da6bf26964af9d7eed9e03e53415d37aa96045`.
- Base preview API: 28 July 2024, native + WETH at block 0x10d968e; 309.05489659276643499146 USD subset. HTTP 200 / 7.624 seconds. `live-preview-base.json`.
- Pulse preview API: same date, native PLS + genuine-zero WPLS at block 0x1406ad3; 3.33486021779418209245250308 USD subset. HTTP 200 / 12.720 seconds. `live-preview-pulse-verified.json`.
- `live-evidence.json`: five-network headers/state/errors, price timestamps, Ethereum recent transfer seeds, GeckoTerminal month-old DAI candles and Zerion 402 without key. Polygon native mapping corrected in `live-polygon-native.json`.
- `live-base-snapshot.json` and `live-preview-pulse.json` retain earlier failed attempts, with their later fixes/results distinguished. A local provider timeout is not evidence of absent archive data.

## Browser review

Desktop Chrome browser, 1363 × 936 CSS viewport. No horizontal overflow observed. Measured six controls at 44 CSS px high and ~99 px wide. Home/End selected first/last (0/39), arrow and pointer-nearest inspection exercised; details open/close and Escape available. Both light/dark themes inspected. Screenshots are of the clearly labelled illustrative demo, not owner holdings or live value-change evidence. Final screenshots are under screenshots/.

**Still needed before production:** 360px layout/overflow and actual finger-drag check on Android/iOS; physical browser close/reopen on a representative owner watchlist; provider credentials/free archive availability for remaining networks; completeness of sold assets and historical staking. This is a reviewable partial-history implementation, not approval to merge or a complete backfill claim.

## Review

- Draft: https://github.com/brownie-au/kinko-wallet/pull/3
- Preview: https://kinko-wallet-v2-test-git-feature-por-3fd008-rob-browns-projects.vercel.app/
- Source: feature/portfolio-history-verified. Exact final commit is pinned in the PR description; browser evidence and build identity are recorded in REVIEW.md.
- Implementation/retention/migration: IMPLEMENTATION.md. Provider matrix and rights: COVERAGE.md.
