# Kinko Wallet · Reimagined

Your keys. Your coins. Your control. Kinko just keeps you informed.

A responsive, **strictly watch-only** crypto portfolio and HEX staking dashboard. Add public EVM addresses, name your wallets, inspect token holdings and open HEX stakes, and recover your encrypted watchlist on another device using a Kinko Access Key. No email, signing wallet, cryptocurrency private key, or seed phrase is required or accepted.

## Run locally

Node 22.12+ or Node 24 is required.

```sh
npm ci --ignore-scripts
npm test
npm run build
npm run dev
```

`npm run dev` serves the interface and the clearly labelled illustrative demo. `/api/vault` and `/api/data` are Vercel functions; full local development uses `npx vercel dev` with an owner-linked project and the server-only variables in `.env.local`. The Vite-only server deliberately does not forward account data to an unrelated production site.

Deploy the repository root as a Vite project on Vercel; `vercel.json` supplies the install/build commands, two API functions, security headers and SPA routing. Keep the rebuild on a separate branch and test deployment until approved for the primary domain. There are no paid SDKs, analytics, fonts, signing integrations, automatic upgrades, or purchased assets.

## Implemented

- Original forest/ivory design, light/dark themes, responsive sidebar/bottom navigation and an explicit sample-data demo.
- Multiple public wallet addresses, names, network choices, add/edit/remove, search, copy confirmation and explorer links.
- Ethereum and PulseChain priority; Base, Polygon and BNB Smart Chain configurations.
- Native balances; paginated Blockscout token discovery on supported chains; custom read-only ERC-20 contracts (up to 30).
- Cross-chain provider/claim-link spam filtering before pricing, encrypted manual hides (up to 100 contracts), review/restore controls, and optional Assets-only dust filtering.
- Decimal-string balances, BigInt calculations and contract/network-based token identity; no ticker-only merging.
- DefiLlama pricing and chain-specific Dexscreener fallbacks on all five networks; unavailable prices stay unavailable.
- USD and AUD display (AUD uses an available dated ECB reference rate through Frankfurter).
- Read-only HEX `currentDay`, `stakeCount`, `stakeLists`, principal, shares/T-Shares, maturity dates, status and a stake ladder.
- Recent explorer-indexed transactions on supported networks. BNB activity requires its explorer.
- Secure browser-generated Access Keys, client-encrypted cloud sync, optimistic concurrency, encrypted export/import, legacy JSON import, and account deletion.
- Encrypted browser history of actual liquid portfolio readings (up to 31 days / 2,000 readings), with first-reading values and a recent-readings table. This is not investment performance or historical backfill.

## Access Key and encrypted storage

1. The browser generates 32 random bytes using Web Crypto (256 bits), displayed as `KINKO-` plus grouped hexadecimal characters. The KINKO prefix prevents accepting an ordinary cryptocurrency private key as an account key.
2. HKDF-SHA-256 derives **separate** lookup, authorization and AES encryption material with versioned domain labels.
3. AES-256-GCM encrypts wallet addresses, names, networks, preferences and custom contracts with a fresh 96-bit random nonce. The account identifier and version are bound as authenticated associated data.
4. `/api/vault` receives ciphertext, the derived account identifier, and a **separate bearer credential** over HTTPS. It never receives the raw Access Key or encryption key.
5. The database stores the identifier, a SHA-256 verifier of the derived authorization credential, encrypted envelope, and revision. Account creation uses Redis `SET NX`; updates/deletions use atomic Lua compare-and-swap checks of the verifier and revision.
6. Another browser independently derives the same material, authenticates, fetches the envelope, and decrypts it locally. Nothing depends on the first browser's storage.
7. The raw Access Key is never saved. Successful sign-in seals the separately derived account identifier, authorization credential and vault encryption material using AES-256-GCM with a non-extractable device CryptoKey stored in origin-scoped IndexedDB. The checkbox is off by default. Unchecked stores the sealed credentials only in `sessionStorage`, preserving refreshes for the current tab session. Checked stores the sealed credentials in IndexedDB, allowing future visits and browser restarts. Restored vault keys remain non-extractable. No credentials are put in URLs or logs.
8. Explicit logout deletes the device key and saved credentials, clears the current tab session, writes a non-secret logout marker to prevent stale automatic restores, and signs out other open tabs through the browser storage event. Account deletion also clears saved authentication. Failed/corrupted storage requires entering the Access Key again; authentication is never stored as plaintext as a fallback.

**Trusted-device boundary:** Anyone using an unlocked browser profile with remembered access can open that Kinko watchlist. Browser storage encryption does not protect against same-origin malicious JavaScript, a compromised browser/extension, or a compromised device. This feature does not claim OS/hardware-backed protection. Clearing site data/private browsing can remove remembered access. Browser tab/session restoration may also restore `sessionStorage`; use explicit logout on shared devices. Saved access is scoped to the exact website origin, so changing preview URLs requires logging in on the new URL.

If the Access Key is lost, there is no recovery backdoor. The actual cryptocurrency is unaffected. Exported encrypted backups still require the same Access Key. A local backup can be opened explicitly if the cloud is unavailable; it is visibly marked **local**, without a false claim of cross-device sync. Conflicting edits are not silently overwritten: export pending edits, then load the current cloud copy.

## Environment

Use an **owner-controlled free Upstash Redis database**, configured only in the Vercel project's server environment. The existing test project already has KV variable names configured. No secrets are needed in the frontend.

```text
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

Equivalent `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` and legacy `UPSTASH_REST_URL` / `UPSTASH_REST_TOKEN` are supported. Use the read/write REST token, not a read-only token. Do not commit `.env` files. No optional legacy AI keys are used.

## Public data and accuracy

`api/data.js` accepts only fixed supported actions and networks, validated public addresses and bounded custom contracts. It is not an arbitrary proxy. Each RPC reader checks `eth_chainId`, pins contract reads to one block, and retries only known providers on that chain. Native and explorer balances are distinct retrieval paths. Prices require a usable recent timestamp (within six hours); unpriced tokens are excluded from known fiat totals. Failures are visible and cached client results are marked stale rather than changed to zero.

HEX contract: `0x2b591e99afe9f32eaa6214f7b7629768c40eeb39` on Ethereum (1) and PulseChain (369). `LAUNCH_TIME = 1575331200`, hearts = 10^8 per HEX, and 10^12 raw shares per T-Share. `lockedDay + stakedDays` determines scheduled maturity at UTC day boundaries. `unlockedDay` indicates good accounting and is **not** equivalent to ending a stake. Ended positions disappear from `stakeLists` and require historical indexing; they are not fabricated here. Shares and principal summed across networks are **raw units**, not equal economic exposure. Use network filters for meaningful comparisons.

## Free infrastructure and constraints

Official sources reviewed **19 October 2026**:

| Provider | Documented free allowance / limits | Use |
| --- | --- | --- |
| [Vercel Hobby](https://vercel.com/docs/plans/hobby) | 100 GB fast transfer, 1M function invocations, 4 active CPU hours, 360 GB-hours memory; non-commercial personal use only; quotas pause service | Vite assets + two read-only/server-storage functions |
| [Upstash Redis Free](https://upstash.com/pricing/redis) | 500K commands/month; headline/FAQ says 250 MB, technical capacity table says 256 MB; use 250 MB as the conservative bound; 10 GB bandwidth, one free database | Ciphertext and authentication verifiers |
| [Dexscreener API](https://docs.dexscreener.com/api/reference) | Chain token endpoint documented at 300 requests/minute | Missing/stale-price fallback on all five networks |
| [Blockscout](https://docs.blockscout.com/devs/apis) / public RPCs / [DefiLlama](https://defillama.com/docs/api) | Shared availability/rate limits; no dedicated SLA assumed | Public blockchain and market data |
| [Frankfurter](https://frankfurter.dev/) | Open-source public reference FX API; not a live trading rate | Optional AUD conversion |

No paid plans or billing changes were made. Existing account/database plan and billing status must remain Free/Hobby; do not upgrade or enable pay-as-you-go. Upstash explicitly says paid tiers are billed differently; its free allowance is not an allowance on paid databases. Hosting quotas and public provider outages can stop refresh/sync. The code caches market requests for one minute, FX for one hour, limits concurrency, and refreshes every two minutes only while signed in, visible, online and idle. Account requests use a distributed Redis rate limit. Public-data throttling and cache are per process, so they are not a complete abuse defence across serverless instances. Monitor free quotas. Unlimited use at $0 is not promised.

## Tests and verification

`npm test` covers random key generation, rejection of crypto key formats, independent-client key derivation, authenticated encryption/tamper protection, absence of plaintext/key in request payloads, API read/write/delete authorization, independent-device restoration through a storage contract, concurrency conflicts, storage outages, exact amount arithmetic, HEX maturity boundaries, pinned block reads, wrong-chain rejection and unknown prices. See `docs/VERIFICATION.md` for actual live results and remaining verification gaps.

`npm audit` is a known-vulnerability check, **not an independent security audit**.

## Limitations and threat model

- This app holds no cryptocurrency, signs nothing, cannot start/end stakes or move assets, and does not connect to browser signing wallets.
- A Kinko Access Key grants access to saved Kinko data; keep it private. No Access Key rotation is currently implemented.
- An unlocked/compromised browser, malicious extension, compromised host/frontend or an XSS vulnerability can access decrypted data. Encryption does not make the app anonymous or independently audited.
- Public wallet addresses go to our read-only data endpoint and public providers for queries. Saved associations and names are encrypted. Providers and hosting may observe request metadata; ephemeral server caches can contain public address results.
- BNB token discovery requires the server-side Alchemy configuration below. BNB activity indexing is unavailable; explorer links are provided.
- No NFTs, LP valuation, historical ended-stake index, reward/penalty projections, cost-basis/P&L or invented historical portfolio charts.
- Token discovery is bounded to five pages; truncated results are labelled incomplete. Up to 500 open HEX positions per wallet/network are supported; large wallets may encounter request timeouts.
- Readings are saved only in this browser and are not cloud-synchronized or included in watchlist backups. Old short Portfolio IDs are separate from Access Keys; import a JSON wallet backup.
- The earlier application sources and API code remain in Git history and `legacy-api/` for reference; legacy APIs are **not deployed** on this rebuild. They are not part of the supported runtime or the new test command.

### Token indexer for the test preview

Base, Polygon and BNB discovery uses Alchemy. Earlier deployments without its key fell back to blocked public explorers on Base/Polygon and manual-only discovery on BNB. A missing or blank **`ALCHEMY_API_KEY`** now produces an explicit provider-configuration notice and unavailable discovery, while native and manually tracked balances are still read. It never silently switches these networks to an explorer. The key must be a **sensitive, server-only Preview variable** in `kinko-wallet-v2-test`, including any `feature/kinko-reimagined` branch override; redeploy Preview after changes. No credential is accepted from the browser and the adapter is never included in frontend code. Do not upgrade plans or enable paid overages.

Holdings responses include a safe `discoveryProvider` identifier (`alchemy-token-api`, `alchemy-portfolio-api`, `blockscout`, or `unconfigured`), never an authenticated URL or credential. Discovery status is separate from market-price coverage. Missing market prices are labelled **Price unavailable**; use Show unpriced tokens in Assets to inspect retained quantities. A Portfolio HTTP 200 with failed-network data and no usable tokens is not a confirmed empty wallet: the working Token API route is retained, and successful fallback does not keep an obsolete Portfolio warning.

The adapter uses Alchemy's [Token API](https://www.alchemy.com/docs/data/token-api/token-api-endpoints/alchemy-get-token-balances), verifies the network's chain ID, validates the returned wallet address and integer quantities/decimals, deduplicates and reads at most five pages of 100 ERC-20 records. Native balances are separate. Up to four metadata calls run concurrently; successful metadata is cached in-process for 24 hours, with a 2,000-contract bound. Balances are always re-read. Current public explorer discovery remains in place for Ethereum and PulseChain. Native balances and manually tracked contracts continue through chain-verified RPCs. Indexer errors and quota limits remain visible; they do not become zero balances.

Alchemy documents a [Free tier with 30 million monthly compute units and Token API access](https://www.alchemy.com/docs/reference/pricing-plans). Balance pages currently cost 20 CUs and metadata calls 10 CUs; a finite free allowance may be exhausted by frequent refreshes. Enable Base, Polygon and BNB mainnets on the owner's Alchemy app. Only use an owner-controlled free account with a hard free-tier cap. The existing 60-second API cache remains per-process, not a distributed quota guarantee. The owner has configured the Preview secret, and live authenticated discovery has returned token balances on Base, Polygon and BNB. Metadata gaps, provider limits and timeouts can still leave partial coverage.

Explorer records missing usable decimals are retried directly on-chain (at most 12 contracts per wallet/read). Only verified precision and balances replace those records; unresolved metadata remains a notice. Price recovery now queries all missing or stale markets in batches of 30 on the correct chain, selecting only finite positive base-token USD prices from pools with at least $10,000 reported liquidity. Fresh DefiLlama prices remain preferred. Unpriced tokens stay visible and excluded from fiat totals; a market may have no usable price.

Holdings requests share a 45-second abort budget (inside the browser's 55-second limit). Native balance and price reads run concurrently with discovery so an indexer delay does not starve the native read. Price lookups use at most three concurrent batches per provider. Successful partial results remain visible when this budget expires.

Authenticated indexer requests are spaced at least 125 ms apart within each server process, and an HTTP/JSON-RPC 429 receives one retry after a one-second backoff. Discovery has its own 15-second budget to reserve time for market prices; the shared 45-second holdings deadline still applies to queued work and retries. Metadata read failures are marked retryable separately from invalid token records. Pacing and metadata caches are process-local, so this is not an account-wide or distributed quota guarantee.

## Spam filtering and discovery cost

The same contract-based filter covers Ethereum, PulseChain, Base, Polygon and BNB. Provider spam flags, website-only token names/symbols, shortened links, and promotional claim/airdrop URLs are quarantined before pricing and excluded from asset totals and unpriced notices. Unpriced tokens and low balances alone are never spam signals. The default Assets/top-assets display shows priced tokens, native balances and explicitly tracked contracts; Show unpriced tokens reveals retained unknown-price positions. This preference is encrypted with the watchlist and does not change balances, known fiat totals, history or warning eligibility. Price warnings independently apply the shared spam/manual-hide rules, count distinct affected tokens and wallets, and wait for refresh to finish. Failed or stale reads retain their data-read notice instead of an old price warning. Assets exposes a filtered-token review list; explicitly tracking a verified contract overrides automatic filtering. Manual hides are saved in the encrypted watchlist and keyed by network plus contract, with restore available even if the token disappears from the provider. Native assets cannot be hidden. The optional USD 0.01 dust checkbox changes only the Assets list, not financial totals.

On Alchemy-backed chains, large lists (30+ uncached positive-balance candidates) first try Tokens By Wallet with inline metadata and prices disabled, avoiding one metadata round trip per airdrop. Small lists and warm caches retain the cheaper Token API. Successful metadata and known spam classifications have bounded, process-local 24-hour caches; balances are always reread. Unsupported/denied batch requests fall back within the existing 15-second discovery budget, and later-page failures retain successful tokens with a notice. Explicitly hidden contracts skip individual metadata work. Spam filtering cannot remove upstream balance-page scanning, guarantee detection of every scam, or eliminate genuine provider timeouts.

[Alchemy Tokens By Wallet](https://www.alchemy.com/docs/data/portfolio-apis/portfolio-api-endpoints/portfolio-api-endpoints/get-tokens-by-address) supplies inline metadata. Its documented [compute-unit cost](https://github.com/alchemyplatform/docs/blob/main/content/api-reference/pricing-resources/pricing/compute-unit-costs.mdx) is 480 per requested network; the batching threshold avoids spending this on every small or warm wallet. Existing free quotas still apply. No plan upgrades or new paid services are required by this change.

## Portfolio history review

The new chart and encrypted multi-year history are documented in [implementation notes](docs/history/IMPLEMENTATION.md), the [five-network coverage matrix](docs/history/COVERAGE.md), and the [verification report](docs/history/VERIFICATION.md). Archive backfill is partial: see the live public-fixture evidence and unresolved discovery/staking/mobile-device checks. No owner portfolio completeness claim.
