// One read-only balance pipeline shared by portfolio and cache consumers.
import { getEthTokensFromBlockscout } from './ethBlockscoutService.js';
import { getBaseTokensFromBlockscout } from './baseBlockscoutService.js';
import { getPolygonTokensFromBlockscout } from './polygonBlockscoutService.js';
import { getEthNativeBalanceExact as getEthNativeBalance } from './ethRpcService.js';
import { getBaseNativeBalanceExact as getBaseNativeBalance } from './baseRpcService.js';
import { getPolygonNativeBalanceExact as getPolygonNativeBalance } from './polygonRpcService.js';
import { getBscNativeBalanceExact as getBscNativeBalance } from './bscRpcService.js';
import { fetchPulsechainTokens } from './pulsechainService.js';
import * as prices from './priceService.js';
import { formatTokenUnits, multiplyDecimal } from '../utils/tokenMath.js';
import { isWalletAddress } from '../utils/walletRecords.js';
import { readManualTokens } from './manualTokenService.js';

const config = {
  eth: { discover: getEthTokensFromBlockscout, native: getEthNativeBalance, symbol: 'ETH', price: 'Eth' },
  base: { discover: getBaseTokensFromBlockscout, native: getBaseNativeBalance, symbol: 'ETH', price: 'Base' },
  polygon: { discover: getPolygonTokensFromBlockscout, native: getPolygonNativeBalance, symbol: 'POL', price: 'Polygon' },
  bsc: {
    discover: async () => {
      throw new Error('Automatic BSC discovery is unavailable. Add token contracts in Manage Wallets.');
    },
    native: getBscNativeBalance,
    symbol: 'BNB',
    price: 'Bsc'
  }
};
const inflight = new Map();
const TTL = 300000;
const cached = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
};

export async function getChainHoldings(chain, address, { force = false } = {}) {
  if (!isWalletAddress(address)) throw new Error('Invalid public wallet address');
  if (chain !== 'pulse' && !config[chain]) throw new Error('Unsupported network');
  const key = `kw:holdings:v2:${chain}:${address.toLowerCase()}`;
  const prior = cached(key);
  if (!force && prior && Date.now() - prior.asOf < TTL) return prior;
  if (inflight.has(key)) return inflight.get(key);
  const job = (async () => {
    const issues = [];
    let rows = [];
    if (chain === 'pulse') {
      try {
        rows = await fetchPulsechainTokens(address, { force: true });
        rows = rows.map((t) => ({
          ...t,
          amount: t.balance,
          amountExact: t.amountExact || String(t.balance),
          priceUsd: t.price,
          valueUsd: t.value
        }));
      } catch {
        issues.push('PulseChain balance discovery unavailable.');
        rows = (prior?.rows || []).map((t) => ({ ...t, stale: true }));
      }
    } else {
      const c = config[chain];
      const [native, discovered, manual] = await Promise.allSettled([
        c.native(address),
        c.discover(address, { force }),
        readManualTokens(chain, address)
      ]);
      if (native.status === 'fulfilled')
        rows.push({
          address: null,
          symbol: c.symbol,
          name: c.symbol,
          amount: Number(native.value),
          amountExact: String(native.value),
          decimals: 18
        });
      else {
        issues.push('Native balance unavailable.');
        rows.push(...(prior?.rows || []).filter((t) => !t.address || t.address === 'native').map((t) => ({ ...t, stale: true })));
      }
      const contracts = new Map();
      if (discovered.status === 'fulfilled') for (const t of discovered.value) contracts.set(t.address.toLowerCase(), t);
      else {
        issues.push(
          chain === 'bsc'
            ? 'Automatic BSC discovery unavailable; manual contracts only.'
            : 'Automatic token discovery unavailable; coverage is incomplete.'
        );
        for (const t of prior?.rows || []) if (t.address && t.address !== 'native') rows.push({ ...t, stale: true });
      }
      if (manual.status === 'fulfilled') for (const t of manual.value.tokens) contracts.set(t.address.toLowerCase(), t);
      else issues.push('One or more manual token balances are unavailable.');
      if (manual.status === 'fulfilled' && manual.value.failed.length) {
        issues.push('One or more manual token balances are unavailable.');
        for (const t of prior?.rows || [])
          if (manual.value.failed.includes(t.address) && !rows.some((r) => r.address === t.address)) rows.push({ ...t, stale: true });
      }
      for (const t of contracts.values()) {
        const amountExact = formatTokenUnits(t.balanceRaw, t.decimals);
        rows = rows.filter((r) => r.address !== t.address);
        rows.push({ ...t, amountExact, amount: Number(amountExact) });
      }
      const [nativePrice, tokenPrices] = await Promise.allSettled([
        prices[`get${c.price}UsdPriceLlama`](),
        prices[`get${c.price}TokenPricesLlama`]([...contracts.keys()])
      ]);
      if (nativePrice.status === 'rejected' || tokenPrices.status === 'rejected') issues.push('Some market prices are unavailable.');
      const priceMap = tokenPrices.status === 'fulfilled' ? tokenPrices.value : new Map();
      rows = rows.map((t) => {
        if (t.stale) return t;
        const meta = !t.address ? (nativePrice.status === 'fulfilled' ? nativePrice.value : null) : priceMap.get(t.address);
        const value = typeof meta === 'object' ? meta?.price : meta;
        const priceUsd = Number(value) > 0 && Number.isFinite(Number(value)) ? Number(value) : null;
        const valueExact = priceUsd == null ? null : multiplyDecimal(t.amountExact, String(priceUsd));
        return {
          ...t,
          priceUsd,
          priceSource: priceUsd == null ? 'none' : 'defillama',
          valueExact,
          valueUsd: valueExact == null ? null : Number(valueExact),
          change24hPct: meta?.change24hPct ?? null
        };
      });
    }
    if (chain === 'pulse') {
      try {
        const manual = await readManualTokens(chain, address);
        if (manual.failed.length) {
          issues.push('One or more manual PulseChain token balances are unavailable.');
          for (const t of prior?.rows || [])
            if (manual.failed.includes(t.address) && !rows.some((r) => r.address === t.address)) rows.push({ ...t, stale: true });
        }
        for (const t of manual.tokens)
          if (!rows.some((r) => r.address?.toLowerCase() === t.address.toLowerCase())) {
            const amountExact = formatTokenUnits(t.balanceRaw, t.decimals);
            rows.push({ ...t, amountExact, amount: Number(amountExact), priceUsd: null, valueUsd: null });
          }
      } catch {
        issues.push('One or more manual PulseChain token balances are unavailable.');
      }
    }
    rows = rows.map((t) => ({
      ...t,
      chain,
      wallet: address.toLowerCase(),
      address: t.address === 'native' ? null : t.address?.toLowerCase() || null,
      stale: !!t.stale,
      fetchedAt: t.stale ? t.fetchedAt : Date.now()
    }));
    const result = { rows, issues, asOf: Date.now(), discoveryComplete: issues.length === 0 };
    try {
      localStorage.setItem(key, JSON.stringify(result));
    } catch {
      /* Storage is optional for balances. */
    }
    return result;
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}
