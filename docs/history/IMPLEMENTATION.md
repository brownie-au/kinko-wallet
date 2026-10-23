# Portfolio history implementation

This branch extends `feature/kinko-reimagined` at c80398b, the active head of draft PR #2, rather than rebuilding from main. No original owner images were accessible; the written chart specification was used. PR #3 is a bounded change against that active feature branch.

## Semantics and integrity

- The chart contains actual saved liquid valuations and explicitly **partial archive valuations**. There is no “today's holdings at yesterday's prices” series, extrapolation, averaging or synthetic continuity. Demo values are fictional and labelled.
- Assets use chain ID and exact contract identity, with an explicit native identity. Polygon native quotes use MATIC before 4 September 2024 and POL after the migration; the activation day is withheld until an exact transition block is configured. Native and wrapped assets are separately held balances, not an added underlying protocol exposure.
- Archive prices are multiplied by historical `eth_getBalance` / `balanceOf` at a checked historical block. Decimals are read at that block. Transfer records only seed contracts, including potentially sold holdings; transfers do not reconstruct balances, so rebasing, fee-on-transfer, burns and unusual token accounting are reflected by the contract's historical balance implementation when supported. Unreadable contracts are unknown.
- Snapshot dollar products and additions use exact decimal arithmetic, converting to Number at chart boundaries. Fixtures independently expect 2 × 100 + 1.234567 × 2 = 202.469134 USD; arithmetic assertions tolerate 1e-10 USD. Display rounds to two currency decimals. There is no investment-return claim.
- Missing prices/balances are null, never zero. A verified zero balance can contribute genuine zero without a price. All-unpriced positive balances do not become a complete zero portfolio. At least one balance must be valued for a partial snapshot.
- HEX stakes, ended stakes, NFTs, liquidity positions and other protocol positions are excluded. No claim of full portfolio coverage is made. The chart's scope is liquid assets only. Native/unwrapped protocol underlying balances are not fabricated or added.
- Readings retain provenance: chain/address, quantity, price/source/time, balance block/time when known, excluded counts, discovery limitations and method. Existing explorer-based observations can lack a balance block; their time is retrieval time, not a claimed pinned block. v1 records have limited provenance and show a legacy-source notice.

## Time windows and comparison

All timestamps are UTC milliseconds in storage and local time, including year, on the chart. Trailing windows are 1 hour, 24 hours, 7 days, 30 days, 365 days, or all retained history (MAX). MAX backfill begins with one year-old anchor; MAX display still includes every older saved reading. It does not promise genesis discovery.

A short range shows only actual readings and their availability date. One point is a dot. Changes always state the actual compared interval and are unavailable across any incompatible method/coverage/partial-state boundary or recording gap. Percentage is unavailable at a zero baseline. Deposits and withdrawals affect “Value change”. Portfolio membership, wallet/network reads, priced identities, source and timestamp-quality changes partition the series. There is no line across those changes. Downsampling keeps real points, never averages.

USD is the stored valuation currency. Existing AUD preference converts all points at the **current** reference FX rate, disclosed in information; it is not a reconstructed historical AUD valuation.

| Resolution | Archive price tolerance, absolute distance | Block tolerance |
| --- | --- | --- |
| 1H | 1 minute | at or before target, maximum 2 minutes |
| 1D | 5 minutes | same |
| 1W | 30 minutes | same |
| 1M | 2 hours | same |
| 1Y / MAX | 12 hours | same |

Prices need finite positive values, explicit timestamps and confidence ≥0.8. Provider search windows round up to whole hours, but acceptance uses the stricter table. No out-of-tolerance archive quote is used. Observed quotes inherit the existing six-hour live-price acceptance, **flagged partial** if timestamp unknown or outside five minutes; the information panel explains this. These flags/source changes enter comparability coverage. This is deliberately more conservative than the headline asset total.

## Providers, backfill and cost

Historical blocks: DefiLlama timestamp-to-block except PulseChain, which uses Blockscout's getblocknobytime; the RPC block's actual number/time is checked. A nearest block after the target is stepped back and checked. RPC chain IDs are checked before use. Price IDs are explicit chain/contracts or curated native IDs. DefiLlama is used for historical quotes. No DEX historical-price fallback is enabled: the live candle check does not establish historical liquidity/price quality for arbitrary pools. GeckoTerminal and Zerion are assessed in COVERAGE.md, not claimed as integrated providers.

Each selected scope/range requests one aligned earlier anchor, 95% of the selected duration before now (MAX: one year), up to eight wallet/network pairs, two at a time. Each pair reads native and up to 12 known/discovered contracts. The transfer endpoint seeds at most six contracts from one page; **sold discovery remains incomplete**. Hidden/spam contracts are filtered. Wider portfolios need narrower filters to backfill remaining pairs. Saved readings continue every two minutes while visible and online. No full rebuild on opening; later daily attempts incrementally add anchors. No interpolation across widely spaced anchors.

Public market/block caches are separate from wallet history: 24-hour bounded process cache, maximum 1,000 public queries. Concurrent identical public queries are coalesced. Private server snapshots are only coalesced while in flight and then discarded. Client attempts, including failed ones, are encrypted with a 24-hour retry lifetime (maximum 200 checkpoint keys); a different range/scope can be checked independently. These are process-local quotas, not a distributed abuse barrier. Endpoint: 12 history requests/IP/minute and at most two active history snapshots per process, in addition to the existing request cap. Balance reads have a 45-second budget and each provider call a 6.5-second timeout; 429/503 gets one retry, respecting Retry-After up to two seconds, otherwise fails for later retry. Live evidence demonstrates that public endpoint latency can still defeat a whole snapshot; saved history remains usable.

No service was purchased, key created, paid plan enabled or billing setting changed. Zerion is not called by the app. Existing server-only discovery configuration is left intact. DefiLlama terms do not grant unrestricted redistribution; this personal preview uses individual derived valuations, source attribution and limited caching. Commercial/public data republication rights remain an owner/provider issue before any broader release.

## Persistence, migration and privacy

The original browser cache key and AES-GCM purpose-separated AAD remain unchanged (`kinko:portfolio-history:v1:<derived account id>`); encrypted payload schema advances to version 2. Both payload versions are read. Reads do not rewrite or prune originals. The next successful save migrates by merging, and failed authentication never overwrites damaged encrypted history. There is no plaintext history fallback and no server history database. Existing records already deleted by previous 32-day builds cannot be recovered from this migration.

Unlock loads/decrypts history before starting provider refresh. React keeps it mounted during refresh/failure. Late range/wallet responses are cancelled at the state boundary; account-specific saves and scope/coverage partitioning prevent a newer selection being replaced. Saves are serialized with Web Locks, or a per-account queue in environments without locks. Explicit deletion invalidates in-flight saves. Concurrent backfill/readings merge under the same lock. Deduplication is exact scope+time+coverage, with direct observed provenance before archive before legacy, then newer equal-rank data; incompatible methods stay separate.

There is **no age-based deletion**. Each compatible/time-contiguous segment retains first, last, minimum and maximum per bucket:

| Age | Bucket |
| --- | --- |
| under 1 day | 2 minutes |
| 1–7 days | 15 minutes |
| 7–90 days | 1 hour |
| 90 days–2 years | 1 day |
| older | 1 week |

Both sides of coverage and meaningful time-gap boundaries are retained. A bucket with an extreme retains that actual observation. Browser quota failures preserve the last persisted ciphertext and show a save warning; unlimited storage is not promised.

Encrypted backup version 2 now includes a separately authenticated history envelope. Import authenticates it before merging. Old watchlist-only backups still work. History is browser-local and transfers through exports, **not automatic cross-device sync**; watchlist cloud revisions are unchanged. No access key, authentication credential or API secret is added to client assets, logs or evidence. The only address in live evidence is the repository's public provider fixture, not the owner's signed-in watchlist.
