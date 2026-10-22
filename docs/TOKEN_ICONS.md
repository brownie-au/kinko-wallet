# Token and native coin icons

Identity is the network plus contract address, never the symbol. A `null` address
explicitly denotes a native coin; missing/invalid addresses use initials.
Base's native currency is ETH, so it uses Ethereum's coin logo with Base's network
indicator. Contract tokens use their own network's repository, including on
PulseChain; there is no cross-chain contract fallback.

Eight small PNGs (about 58 KB total) ship under `public/assets/tokens`. The seed
registry covers all five networks' native coins, HEX on Ethereum/PulseChain,
PulseX and INC on PulseChain, and native USDC contracts on Ethereum/Base/Polygon.
The PulseChain native logo comes from PLS369's WPLS entry (the PulseChain mark).
These are source artwork, not generated replacements. Sources and SHA-256 hashes
are recorded in `token-icon-sources.json`.

Other contracts request `/api/token-icon?chain=...&address=...` on the same origin.
The endpoint constructs checksummed paths to Trust Wallet's assets repository
(Ethereum, Base, Polygon, smartchain) or PLS369's PulseChain repository. It accepts
only those five chain IDs and full EVM contract addresses. It never accepts a URL,
uses credentials, follows redirects, or forwards wallet addresses. Responses must
be PNGs with a valid header, dimensions at most 2048×2048 and at most 512 KiB.
Upstream requests time out after six seconds. Browser and CDN caches store good
images; missing logos are cached briefly. A bounded in-process cache coalesces
lookups, including misses. Outages return an uncached error.

The reusable TokenIcon is used by overview/assets tables, staking lists, and asset
and stake details. Images are decorative because adjacent text identifies the
asset. They have fixed dimensions, lazy loading, async decoding, and no referrer.
Initials remain visible while loading and after an error; failures are remembered
for five minutes in a bounded browser-session cache. No API keys or browser-side
GitHub tree scans are needed. The existing self-only image CSP is unchanged.

To refresh bundled artwork, run `node scripts/sync-token-icons.mjs`, inspect the
images and source receipt, then commit both. Add future local overrides to
`scripts/token-icon-seeds.json` and the network/address registry in
`src/reimagined/tokenIcons.js`. Do not add symbol-only aliases. Repository coverage
is incomplete: an unknown icon is expected and does not imply a pricing problem
or that the token is safe. Icons do not affect balances, spam filters or valuation.

Sources:
- https://github.com/trustwallet/assets
- https://developer.trustwallet.com/developer/new-asset/repository_details
- https://github.com/PLS369/pulsechain-assets
