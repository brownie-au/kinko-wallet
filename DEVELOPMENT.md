# Kinko Wallet v2 development handoff

This prepared source upgrades the existing React 18 / Vite 6 application. It preserves the existing theme, routes, serverless API model and watch-only operation. The production branch and Vercel deployment have not been changed.

## Completed

- Replaced Ethereum's address-independent market-token placeholder implementation with address-based Blockscout ERC-20 balance discovery.
- Shared portfolio and DataClient balance retrieval through one pipeline, and aligned wallet-detail views with it.
- Native balances on Ethereum, PulseChain, BSC, Polygon and Base; indexer-based discovery on Ethereum, PulseChain, Polygon and Base, subject to provider availability.
- Decimal-string balances and BigInt decimal arithmetic for aggregation and USD valuations. Numerical conversion occurs at display / compatibility boundaries; exact balances remain available in `amountExact`.
- Wallet addresses validated before saving; case-insensitive duplicates merged; token identity uses network and contract rather than ticker.
- Per-wallet network choices, labels, visibility, local persistence, JSON wallet backup and merge-based restoration.
- Manual read-only ERC-20 contract tracking, including BSC fallback. Unknown prices remain unavailable.
- Portfolio wallet filtering, search, sorting, persistent small-value filtering and manual refresh. Filtering presentation does not change the underlying total.
- Partial-coverage reporting, explicit cached-row indicators and stale-balance retention on network failures.
- Corrected Base native price identity (ETH), Polygon native label/price identity (POL), null 24h change handling and price-request batching/timeouts.
- Corrected first-row double-counting in the legacy cache-only aggregation hook.
- Bounded background refresh concurrency, completion tracking and listener cleanup. Hidden wallets and unselected networks do not enter background balance refresh.
- Removed wallet-label HTML insertion from drag previews; mobile wallet controls wrap into reachable touch targets.
- Repaired optional Portfolio ID request parsing and Redis REST command format; retained compatibility with existing saved records and server environment aliases.
- Removed tracked environment files, added ignored local configuration and `.env.example`.

## Verification

The original application production build passed before changes. See VALIDATION.txt in the delivery package for the final test/build results.

Automated tests cover raw-balance precision, decimal arithmetic, wallet migration and imports, duplicate prevention, network-scoped token identity, unknown prices, indexer pagination/schema/error handling, cached-data retention during outages, selected-network isolation, Base ETH price selection, and Portfolio ID request/storage behavior.

A real public PulseChain token-balance request returned 2,205 ERC-20 records. Ethereum, Base and Polygon Blockscout requests returned HTTP 403 from this execution environment. Their live integrations are implemented but **not end-to-end verified** here. Mocked integration tests are not a substitute for a funded-wallet live check.

The live production appearance was inspected. Local browser access was refused by the remote browser environment, so mobile/desktop browser acceptance, screenshot comparison, clicks/import/export and regression testing of staking/history remain pending. Do not call this branch production-ready until those checks pass.

## Known limitations / deferred work

- BSC automatic discovery is explicitly unavailable in the shared pipeline. Native BNB and manually supplied contracts are supported. No empty response is presented as evidence of complete discovery.
- Some existing legacy modules remain for compatibility. This is not a repository-wide audit or cleanup of every template route.
- Prices depend on third-party coverage. USD totals exclude unpriced amounts and can be partial. Native/token numerical display rounds; exact balances are retained separately.
- The requested AUD conversion is not implemented. Values are explicitly USD.
- Manual contract lists and display preferences are browser-local and are not included in the wallet-list backup. There is no new account system.
- No new historical-balance chart is claimed. Existing staking/history functionality is retained but not regression-verified. NFT/DeFi expansion remains future work.
- Manual PulseChain contracts omitted by discovery are shown without a price until a trusted pricing source is available.
- A Portfolio ID remains a bearer-style lookup/update identifier, not an authenticated account. Anyone who has it can read or replace that saved list. Do not describe it as encrypted or private account storage. Authentication, server rate limiting and a stronger update credential should precede broad public use.
- Global/legacy dashboard caches and market widgets still need a broader data audit. This branch does not certify every existing financial widget.

## Security action before deployment

Public Git history contained configured values for `VITE_FREECRYPTO_KEY`, `VITE_LCW_API_KEY` and `GEMINI_API_KEY`, plus associated service configuration. Treat these credentials as exposed and rotate/revoke them at their providers. Deleting the files does not remove history or invalidate credentials.

No credential values are repeated in this report. The local build uses only the safe example configuration. Never put secret API credentials under a `VITE_` variable; Vite exposes those variables to browser code. Audit optional legacy integrations before re-enabling any old frontend keys.

## Run locally

Use Node 20 or later. This repository's existing dependency graph has peer-version conflicts; the repaired npm lock supports the following reproducible path:

```sh
cp .env.example .env.local
npm ci --legacy-peer-deps --ignore-scripts
npm test
npm run build
npm start -- --host 127.0.0.1
```

The framework's dev server retains the existing `/api` proxy. Use a trusted staging API by setting `VITE_PROXY_API_TARGET`; Vite by itself does not execute Vercel serverless functions. Core wallet monitoring uses public providers directly. Native Node tests mock storage/network responses and do not transmit personal wallets.

## Configuration and providers

- Blockscout: `VITE_ETH_BLOCKSCOUT_V2`, `VITE_BASE_BLOCKSCOUT_V2`, `VITE_POLYGON_BLOCKSCOUT_V2`, `VITE_PLS_BLOCKSCOUT_V2`. Public defaults are supplied. Deployments must verify browser CORS/access and indexing coverage.
- PulseChain price enrichment: existing Blockscout and DEX Screener integrations.
- Ethereum/Base/BSC/Polygon prices: DefiLlama current and historical endpoints. Failed historical pricing does not discard a successful current price.
- Public RPC overrides for manual tokens: `VITE_ETH_RPC_URL`, `VITE_PLS_RPC_URL`, `VITE_BSC_RPC_URL`, `VITE_POLYGON_RPC_URL`, `VITE_BASE_RPC_URL`.
- Existing native Ethereum/BSC RPC lists: `VITE_ETH_RPC_URLS`, `VITE_BSC_RPC_URLS`.
- Optional Portfolio ID server-only configuration: `UPSTASH_REST_URL` / `UPSTASH_REST_TOKEN`, or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, or `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
- Optional existing AI service: server-only `GEMINI_API_KEY`; not exercised in this upgrade.

No new paid provider is required by this implementation. Hosting, storage and API costs depend on the user's plans, quotas and traffic; no usage-based cost estimate is verified here.

Provider references used during implementation: [Blockscout account API](https://docs.blockscout.com/devs/apis/rpc/account), [Blockscout v2 schema](https://github.com/blockscout/blockscout-api-v2-swagger/blob/main/swagger.yaml), [Upstash REST API](https://upstash.com/docs/redis/features/restapi), [CoinGecko POL migration](https://support.coingecko.com/hc/en-us/articles/36751952559385-Migration-of-MATIC-to-POL-Completed).

## Deploy safely

1. Rotate the exposed credentials, then configure server-only variables in a staging Vercel environment. Do not copy the old `.env` into the client build.
2. Deploy this branch as a Vercel **Preview** deployment, preserving the existing framework/build output and API rewrites. For a reproducible preview, set Install Command to `npm ci --legacy-peer-deps --ignore-scripts` and Build Command to `npm run build`; the existing Yarn lock is retained for compatibility. The repository still supplies `vercel.json` with `dist` output.
3. Verify funded public addresses independently on each selected chain, invalid/duplicate addresses, new and existing wallet storage, hidden/network selection, manual contracts, unavailable prices, outages, backup/import, and Portfolio ID compatibility.
4. Test 360px, 390px, 430px, tablet and desktop. Compare the teal/glass UI with the current production app. Run staking/history regression checks.
5. Review the changes and remaining baseline lint errors. Merge/redeploy production only after the owner explicitly approves.

## Delivery status

This development branch is prepared for review against `main`. Production deployment requires separate owner approval. The portable delivery package also includes a review patch; it intentionally omits old credential-file contents to avoid reproducing exposed values.

Validation completed: 10 automated tests pass; production build passes; changed source files have 0 ESLint errors and 12 warnings. The repaired npm lock passes `npm ci --legacy-peer-deps --ignore-scripts --dry-run`. The review patch applies cleanly to the original base commit. Browser and live-provider limitations remain as described above.

## Mobile UI follow-up

The development branch now includes a mobile presentation and accessibility pass. See [MOBILE-UX-REVIEW.md](MOBILE-UX-REVIEW.md) for the concrete changes, source-audit scope and outstanding browser acceptance matrix. This adds no signing, transaction or private-key functionality. The previous runtime spacing injectors were replaced with scoped layout CSS. Browser verification is still blocked by preview authentication and remote loopback access, so this remains a draft for review.
