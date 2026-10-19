# Product research · 19 October 2026

Primary sources and design implications, not a claim to have tested competitors' authenticated apps.

| Product/source | Strength observed in public material | Opportunity for Kinko |
| --- | --- | --- |
| [Zerion](https://zerion.io/) | Consolidated multichain asset and activity perspective; accessible product language | One coherent overview; separate per-network token identities. Kinko excludes its trading/signing flows. |
| [DeBank](https://debank.com/) / [DeBank OpenAPI](https://open.debank.com/) | Address-centric EVM portfolio and protocol positions | Wallet scope filters and clear asset/network breakdowns; no critical dependency on a paid portfolio API. The JavaScript-heavy page limited direct inspection. |
| [Zapper](https://zapper.xyz/) | Candidate researched, but source could not be retrieved reliably | No unverified feature claims or copied UI. |
| [NAB](https://www.nab.com.au/) | Clear primary actions, task-based navigation, disciplined banking hierarchy | Calm financial presentation, useful density, explicit ownership and security copy; original forest/ivory identity. |
| [HEX contract identity](https://hex.com/links/) | Canonical address published by HEX | Both chains use the verified contract identity and checked chain IDs. |
| [PulseChain verified contract](https://api.scan.pulsechain.com/api/v2/smart-contracts/0x2b591e99afe9f32eaa6214f7b7629768c40eeb39) | Verified source retrieved directly, including LAUNCH_TIME/currentDay/stakeStart and stakeLists fields | UTC maturity math, principal/share precision, separate good-accounting state. |

The resulting design prioritizes watchlists and staking rather than exchange activity, social feeds, ads, news widgets or trading controls. Introductory text explains ownership; a separately labelled demo allows exploration without inventing live balances. Core financial screens use direct reads and explicit missing/stale states.

Free-tier sources, verified limits and provider constraints are recorded in the README. Competitor product pages are inspiration, not substitutes for verified on-chain data.
