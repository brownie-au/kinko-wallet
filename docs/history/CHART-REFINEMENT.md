# Portfolio history refinement — 23 October 2026

The renderer previously disconnected every sampling gap over 30 minutes and every price-source/timestamp-quality change. Automatic archive loading fetched one anchor, so it could not create an archive trend. A lone older partial anchor compressed recent observed readings into the chart edge.

Changes:
- One inspection value, initially a dash, follows pointer/touch/keyboard selection. The Overview net liquid value is unchanged.
- Solid lines retain measured segments; dashed connections show approximate trends between comparable readings. Different membership, valued assets, unavailable networks, explicit boundaries and valuation methods remain disconnected. Existing strict period comparisons are unchanged.
- New observations retain stable valued-position/read membership so provider or quote-age changes alone can have approximate connections.
- Isolated archive subsets remain available in information but do not compress a saved trend with two or more observations.
- Up to four archive anchors, bounded to eight wallet/network requests, concurrency two. Each result is retained progressively. Stop after an unavailable anchor; abort client requests on selection change. Successful attempts cool down 24 hours, unsuccessful/interrupted attempts 15 minutes.
- Empty provider price responses are not cached for 24 hours. Block lookup respects the request deadline. Zero native balance plus unknown token balances/prices cannot produce a zero backfill portfolio.
- Pointer lookup uses binary search; smaller readout, quieter metadata/footer, no additional chart dependency.

Live source checks (not synthetic test evidence): DefiLlama day-old native quotes returned for Ethereum/Base, Polygon and BNB. Tested PulseChain native and HEX quotes were unavailable. Local block probes timed out; those timeouts alone do not prove provider outages. Existing deployed API checks completed on PulseChain (HTTP 200, about 17 seconds, no valued positions) and Base (HTTP 200, about 9 seconds, zero native subset plus an unavailable token). No complete portfolio-history claim follows from HTTP 200. No account or paid provider was added. Complete five-network historical coverage remains unavailable from these checks.

Validation: 119 automated tests passed, including existing encrypted storage/remount/refresh tests, pointer and keyboard readout, coverage boundaries, bounded sampling, zero-subset rejection and empty-price retry. Vite release build passed. Browser preview uses illustrative demo holdings; it does not inspect the owner's signed-in account.
