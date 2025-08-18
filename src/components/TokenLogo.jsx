// src/components/TokenLogo.jsx
/* eslint-disable import/no-relative-parent-imports */
import { useEffect, useMemo, useState } from 'react';

/* ---------------- Identicon fallback (no deps) ---------------- */
function hashCode(str = '') { let h = 0; for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i); return Math.abs(h); }
function Identicon({ seed = '', size = 18 }) {
  const n = 5, cell = Math.ceil(size / n), pad = Math.max(0, Math.floor((size - n * cell) / 2));
  const h = hashCode(seed), hue = h % 360, bg = `hsl(${(hue + 180) % 360} 30% 16%)`, fg = `hsl(${hue} 70% 55%)`, s2 = (h >> 8) & 0xffffffff;
  const bits = Array.from({ length: n * Math.ceil(n / 2) }, (_, i) => ((s2 >> (i % 31)) & 1) === 1);
  const rows = Array.from({ length: n }, (_, r) => {
    const row = bits.slice(r * Math.ceil(n / 2), (r + 1) * Math.ceil(n / 2));
    return [...row, ...row.slice(0, n - Math.ceil(n / 2)).reverse()];
  });
  return (
    <svg width={size} height={size} style={{ display: 'block', borderRadius: size / 2, background: bg }}>
      {rows.map((cols, r) => cols.map((on, c) =>
        on ? <rect key={`${r}-${c}`} x={pad + c * cell} y={pad + r * cell} width={cell} height={cell} rx={2} ry={2} fill={fg} /> : null
      ))}
    </svg>
  );
}

/* ---------------- Sources & helpers ---------------- */
const DEX_SLUG = { 369: 'pulsechain', 1: 'ethereum', 8453: 'base', 56: 'bsc', 137: 'polygon', 42161: 'arbitrum', 10: 'optimism' };

/* When there is NO token address (native coin), use a proxy address so DexScreener returns a logo. */
const NATIVE_DEX_PROXY = {
  1:    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH (Ethereum)
  8453: '0x4200000000000000000000000000000000000006', // WETH (Base)
  10:   '0x4200000000000000000000000000000000000006', // WETH (Optimism)
  42161:'0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH (Arbitrum)
  137: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', // WETH (Polygon)
  56:  '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB (BSC)
  369: '0xa1077a294DdE1B09bB078844dF40758A5D0F9A27', // WPLS (PulseChain)
};

const PULSE_FLAT_CDN = 'https://cdn.jsdelivr.net/gh/PLS369/pulsechain-tokens-flat@main/pulsechain';
const PULSE_FLAT_RAW = 'https://raw.githubusercontent.com/PLS369/pulsechain-tokens-flat/main/pulsechain';
const PULSE_COMMUNITY = 'https://raw.githubusercontent.com/pulselorian/assets/main';

const NATIVE_LOGOS = {
  1: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
  8453: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png',
  56: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png',
  137: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png',
  42161: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
  10: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png',
  369: `${PULSE_COMMUNITY}/blockchains/pulsechain/info/logo.png`,
};

function trustWalletPath(chainId, address) {
  const slug = ({ 1: 'ethereum', 56: 'smartchain', 137: 'polygon', 10: 'optimism', 42161: 'arbitrum', 8453: 'base' })[chainId];
  if (!slug || chainId === 369 || !address) return null;
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${slug}/assets/${address}/logo.png`;
}
function pulseFlatCandidates(address) {
  if (!address) return [];
  const a = address.trim(); const lc = a.toLowerCase();
  const list = a === lc ? [a] : [a, lc];
  const urls = [];
  list.forEach((addr) => { urls.push(`${PULSE_FLAT_CDN}/${addr}.png`); urls.push(`${PULSE_FLAT_RAW}/${addr}.png`); });
  return urls;
}
function pulseCommunityCandidates(address) {
  if (!address) return [];
  return [
    `${PULSE_COMMUNITY}/blockchains/pulsechain/assets/${address}/logo.png`,
    `${PULSE_COMMUNITY}/blockchains/pulsechain/assets/${address}/logo.svg`,
  ];
}

/* ---------- Known overrides (always succeed fast if present) ---------- */
const KNOWN_TOKEN_LOGOS = {
  369: {
    // DECI (Maximus Decimus)
    '0x6b32022693210cd2cfc466b9ac0085de8fc34ea6': `${PULSE_FLAT_CDN}/0x6b32022693210cd2cfc466b9ac0085de8fc34ea6.png`,
    // PHAME
    '0x8854bc985fb5725f872c8856bea11b917caeb2fe': `${PULSE_FLAT_CDN}/0x8854bc985fb5725f872c8856bea11b917caeb2fe.png`,
    // HDRN (Hedron)
    '0x3819f64f282bf135d62168c1e513280daf905e06': `${PULSE_FLAT_CDN}/0x3819f64f282bf135d62168c1e513280daf905e06.png`,
    // PHUX
    '0x9663c2d75ffd5f4017310405fce61720af45b829': `${PULSE_FLAT_CDN}/0x9663c2d75ffd5f4017310405fce61720af45b829.png`,
  },
  // Ethereum — USDC
  1: {
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48':
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
  },
  // Base — USDC (native)
  8453: {
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913':
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913/logo.png',
  },
};

/* ---------------- DexScreener fetch + cache ---------------- */
const DEX_CACHE = 'kw:dexlogo:'; const DEX_TTL = 7 * 24 * 60 * 60 * 1000;
const getKey = (a) => DEX_CACHE + String(a || '').toLowerCase();
function readDexCache(a){ try{ const raw=localStorage.getItem(getKey(a)); if(!raw) return null; const j=JSON.parse(raw); return Date.now()-(j.ts||0)<DEX_TTL ? j.url : null; }catch{return null;} }
function writeDexCache(a,u){ try{ localStorage.setItem(getKey(a), JSON.stringify({url:u, ts:Date.now()})); }catch{} }

async function fetchDexLogo(addr, chainId) {
  const chain = (DEX_SLUG[chainId] || '').toLowerCase();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`, { signal: ctrl.signal, credentials: 'omit' });
    clearTimeout(timer);
    if (!res.ok) return null;
    const { pairs = [] } = await res.json();
    if (!pairs.length) return null;

    const eq = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
    const onChain = (p) => eq(p?.chainId, chain);
    const hasAddr = (p) => eq(p?.baseToken?.address, addr) || eq(p?.quoteToken?.address, addr);

    const pick =
      pairs.find((p) => onChain(p) && hasAddr(p)) ||
      pairs.find((p) => hasAddr(p)) ||
      pairs.find((p) => onChain(p)) ||
      pairs[0];

    const urls = [
      pick?.info?.imageUrl,
      pick?.baseToken?.imageUrl, pick?.baseToken?.logoUrl, pick?.baseToken?.logoURI, pick?.baseToken?.logo,
      pick?.quoteToken?.imageUrl, pick?.quoteToken?.logoUrl, pick?.quoteToken?.logoURI, pick?.quoteToken?.logo,
    ].filter(Boolean);

    return urls[0] || null;
  } catch { return null; }
}

/* ---------------- Build candidate list ---------------- */
function buildStaticCandidates({ chainId, address, logoURI }) {
  const urls = [];

  // 0) caller-provided URI
  if (logoURI) urls.push(logoURI);

  // 0.5) hard overrides
  const addrLC = (address || '').toLowerCase();
  const pinned = KNOWN_TOKEN_LOGOS[chainId]?.[addrLC];
  if (pinned) urls.push(pinned);

  // 1) native logo (when no contract address)
  if ((!address || address.length === 0) && NATIVE_LOGOS[chainId]) urls.push(NATIVE_LOGOS[chainId]);

  // 2) PulseChain repos
  if (chainId === 369 && address) { urls.push(...pulseFlatCandidates(address)); urls.push(...pulseCommunityCandidates(address)); }

  // 3) Non-Pulse: TrustWallet layout
  if (chainId !== 369 && address) { const tw = trustWalletPath(chainId, address); if (tw) urls.push(tw); }

  // 4) final native fallback
  if (NATIVE_LOGOS[chainId]) urls.push(NATIVE_LOGOS[chainId]);

  return Array.from(new Set(urls.filter(Boolean)));
}

/* ---------------- Component ---------------- */
export default function TokenLogo({
  chainId,
  address,           // checksum if you have it; undefined/null for natives
  symbol = '',
  logoURI,           // optional: if your data source already has one
  size = 18,
  className = '',
}) {
  const [dexUrl, setDexUrl] = useState(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // If no address, try DexScreener via a native proxy (e.g., WETH/WPLS)
      const addrForDex = address || NATIVE_DEX_PROXY[chainId] || null;
      if (!addrForDex) return;
      const cached = readDexCache(addrForDex);
      if (cached) { setDexUrl(cached); return; }
      const found = await fetchDexLogo(addrForDex, chainId);
      if (!cancelled && found) { writeDexCache(addrForDex, found); setDexUrl(found); }
    })();
    return () => { cancelled = true; };
  }, [address, chainId]);

  const fallbacks = useMemo(() => buildStaticCandidates({ chainId, address, logoURI }), [chainId, address, logoURI]);
  const candidates = useMemo(() => dexUrl ? [dexUrl, ...fallbacks] : fallbacks, [dexUrl, fallbacks]);

  useEffect(() => { setIdx(0); }, [chainId, address, symbol, dexUrl, logoURI]);

  const onError = () => setIdx((i) => i + 1);

  if (idx >= candidates.length) {
    return <Identicon seed={`${chainId}:${address || symbol}`} size={size} />;
  }

  const src = candidates[idx];

  return (
    <img
      src={src}
      alt={symbol || 'token'}
      width={size}
      height={size}
      onError={onError}
      className={`rounded-circle ${className || ''}`}
      style={{ display: 'block', width: size, height: size, objectFit: 'cover', imageRendering: '-webkit-optimize-contrast' }}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
    />
  );
}
