/* src/components/TokenLogo.jsx */
/* eslint-disable import/no-relative-parent-imports */
import { useEffect, useMemo, useState } from 'react';

/* --------------------- Utils --------------------- */
const DEX_SLUG = {
  369: 'pulsechain',
  1: 'ethereum',
  8453: 'base',
  56: 'bsc',
  137: 'polygon',
  42161: 'arbitrum',
  10: 'optimism'
};

const LLAMA_SLUG = {
  369: 'pulsechain',
  1: 'ethereum',
  8453: 'base',
  56: 'bsc',
  137: 'polygon',
  42161: 'arbitrum',
  10: 'optimism'
};

/** Chain icons (native) – TrustWallet fallback if Llama chain icon fails */
const NATIVE_TW = {
  1: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
  8453: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png',
  56: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png',
  137: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png',
  42161: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
  10: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png',
  369: 'https://raw.githubusercontent.com/pulselorian/assets/main/blockchains/pulsechain/info/logo.png'
};

function trustWalletPath(chainId, address) {
  const slug = { 1: 'ethereum', 56: 'smartchain', 137: 'polygon', 10: 'optimism', 42161: 'arbitrum', 8453: 'base' }[chainId];
  if (!slug || chainId === 369 || !address) return null; // PulseChain not in TW repo
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${slug}/assets/${address}/logo.png`;
}

/** Community PulseChain icon sources */
const PULSE_FLAT_CDN = 'https://cdn.jsdelivr.net/gh/PLS369/pulsechain-tokens-flat@main/pulsechain';
const PULSE_FLAT_RAW = 'https://raw.githubusercontent.com/PLS369/pulsechain-tokens-flat/main/pulsechain';
const PULSE_COMMUNITY = 'https://raw.githubusercontent.com/pulselorian/assets/main';

function pulseFlatCandidates(address) {
  if (!address) return [];
  const a = String(address).trim();
  const lc = a.toLowerCase();
  const list = a === lc ? [a] : [a, lc];
  const urls = [];
  list.forEach((addr) => {
    urls.push(`${PULSE_FLAT_CDN}/${addr}.png`);
    urls.push(`${PULSE_FLAT_RAW}/${addr}.png`);
  });
  return urls;
}

function pulseCommunityCandidates(address) {
  if (!address) return [];
  return [
    `${PULSE_COMMUNITY}/blockchains/pulsechain/assets/${address}/logo.png`,
    `${PULSE_COMMUNITY}/blockchains/pulsechain/assets/${address}/logo.svg`
  ];
}

/* ----------- Known overrides (fast path) ----------- */
const KNOWN_TOKEN_LOGOS = {
  369: {
    '0x6b32022693210cd2cfc466b9ac0085de8fc34ea6': `${PULSE_FLAT_CDN}/0x6b32022693210cd2cfc466b9ac0085de8fc34ea6.png`,
    '0x8854bc985fb5725f872c8856bea11b917caeb2fe': `${PULSE_FLAT_CDN}/0x8854bc985fb5725f872c8856bea11b917caeb2fe.png`,
    '0x3819f64f282bf135d62168c1e513280daf905e06': `${PULSE_FLAT_CDN}/0x3819f64f282bf135d62168c1e513280daf905e06.png`,
    '0x9663c2d75ffd5f4017310405fce61720af45b829': `${PULSE_FLAT_CDN}/0x9663c2d75ffd5f4017310405fce61720af45b829.png`
  },
  1: {
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48':
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png'
  },
  8453: {
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913':
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913/logo.png'
  }
};

/* -------- DexScreener API with localStorage cache -------- */
const DEX_CACHE = 'kw:dexlogo:';
const DEX_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

const dexKey = (a) => DEX_CACHE + String(a || '').toLowerCase();
function readDexCache(a) {
  try {
    const raw = localStorage.getItem(dexKey(a));
    if (!raw) return null;
    const j = JSON.parse(raw);
    return Date.now() - (j.ts || 0) < DEX_TTL ? j.url : null;
  } catch {
    return null;
  }
}
function writeDexCache(a, u) {
  try {
    localStorage.setItem(dexKey(a), JSON.stringify({ url: u, ts: Date.now() }));
  } catch {}
}

async function fetchDexLogo(addr, chainId) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`, { signal: ctrl.signal, credentials: 'omit' });
    clearTimeout(timer);
    if (!res.ok) return null;

    const { pairs = [] } = await res.json();
    if (!pairs.length) return null;

    const eq = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
    const chainSlug = (DEX_SLUG[chainId] || '').toLowerCase();

    const onChain = (p) => eq(p?.chainId, chainSlug);
    const hasAddr = (p) => eq(p?.baseToken?.address, addr) || eq(p?.quoteToken?.address, addr);

    const pick = pairs.find((p) => onChain(p) && hasAddr(p)) || pairs.find((p) => hasAddr(p)) || pairs.find((p) => onChain(p)) || pairs[0];

    const urls = [
      pick?.info?.imageUrl,
      pick?.baseToken?.imageUrl,
      pick?.baseToken?.logoUrl,
      pick?.baseToken?.logoURI,
      pick?.baseToken?.logo,
      pick?.quoteToken?.imageUrl,
      pick?.quoteToken?.logoUrl,
      pick?.quoteToken?.logoURI,
      pick?.quoteToken?.logo
    ].filter(Boolean);

    return urls[0] || null;
  } catch {
    return null;
  }
}

/* ---------------- Letter badge fallback ---------------- */
function badgeSvg(text, size) {
  const label =
    String(text || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 3) || '•';
  const seed = [...label].reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = seed % 360;
  const bg1 = `hsl(${hue} 70% 35%)`;
  const bg2 = `hsl(${(hue + 25) % 360} 70% 45%)`;
  const fg = '#fff';
  const fontSize = Math.max(10, Math.floor(size * 0.44));

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg1}" />
      <stop offset="100%" stop-color="${bg2}" />
    </linearGradient>
  </defs>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 0.5}" fill="url(#g)" />
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
        font-family="system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial"
        font-size="${fontSize}" font-weight="700" fill="${fg}">
    ${label}
  </text>
</svg>`.trim();
}

/* ---------------- Candidate builders ---------------- */
function buildStaticCandidates({ chainId, address, logoURI, size }) {
  const urls = [];
  const addrLC = (address || '').toLowerCase();
  const dexSlug = DEX_SLUG[chainId];
  const llamaSlug = LLAMA_SLUG[chainId];

  // 0) caller-provided URI
  if (logoURI) urls.push(logoURI);

  // 0.5) pinned overrides
  const pinned = KNOWN_TOKEN_LOGOS[chainId]?.[addrLC];
  if (pinned) urls.push(pinned);

  if (address) {
    // Addressed tokens:
    // 1) DexScreener CDN
    if (dexSlug) urls.push(`https://cdn.dexscreener.com/token-icons/${dexSlug}/${addrLC}.png`);
    // 2) DeFiLlama token icon (size-aware)
    if (llamaSlug) {
      const s = Math.max(32, Math.min(128, Math.round(size * 2)));
      urls.push(`https://icons.llamao.fi/icons/tokens/${llamaSlug}/${addrLC}?w=${s}&h=${s}`);
    }
    // 3) TrustWallet (checksum usually)
    const tw = trustWalletPath(chainId, address);
    if (tw) urls.push(tw);
    // 4) PulseChain repos
    if (chainId === 369) {
      urls.push(...pulseFlatCandidates(address));
      urls.push(...pulseCommunityCandidates(address));
    }
  } else {
    // Natives: ONLY chain icons (no DexScreener!)
    if (llamaSlug) urls.push(`https://icons.llamao.fi/icons/chains/rsz_${llamaSlug}.jpg`);
    if (NATIVE_TW[chainId]) urls.push(NATIVE_TW[chainId]);
  }

  // Dedup
  return Array.from(new Set(urls.filter(Boolean)));
}

/* ---------------- Component ---------------- */
export default function TokenLogo({
  chainId,
  address, // checksum if you have it; undefined/null for natives
  symbol = '',
  name = '',
  logoURI, // optional from data source
  size = 18,
  className = ''
}) {
  const [dexUrl, setDexUrl] = useState(null);
  const [idx, setIdx] = useState(0);

  // ✅ DexScreener API ONLY for contract tokens (addressed).
  // This avoids WETH icons appearing for native ETH.
  useEffect(() => {
    if (!address) {
      setDexUrl(null);
      return;
    } // natives skip Dex entirely
    let cancelled = false;
    (async () => {
      const cached = readDexCache(address);
      if (cached) {
        setDexUrl(cached);
        return;
      }
      const found = await fetchDexLogo(address, chainId);
      if (!cancelled && found) {
        writeDexCache(address, found);
        setDexUrl(found);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, chainId]);

  const fallbacks = useMemo(() => buildStaticCandidates({ chainId, address, logoURI, size }), [chainId, address, logoURI, size]);

  const candidates = useMemo(() => (dexUrl ? [dexUrl, ...fallbacks] : fallbacks), [dexUrl, fallbacks]);

  useEffect(() => {
    setIdx(0);
  }, [chainId, address, symbol, name, logoURI, dexUrl]);

  const aria = (name || symbol || 'Token') + (address ? ` (${String(address).slice(0, 8)}…)` : '');

  // All sources failed → pretty letter badge
  if (idx >= candidates.length) {
    return (
      <span
        className={className}
        aria-label={aria}
        title={aria}
        style={{ display: 'inline-flex', width: size, height: size }}
        dangerouslySetInnerHTML={{ __html: badgeSvg(symbol || name || '•', size) }}
      />
    );
  }

  const src = candidates[idx];

  return (
    <img
      src={src}
      alt={aria}
      width={size}
      height={size}
      onError={() => setIdx((i) => i + 1)}
      className={`rounded-circle ${className || ''}`}
      style={{
        display: 'block',
        width: size,
        height: size,
        objectFit: 'cover',
        imageRendering: '-webkit-optimize-contrast',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.06) inset'
      }}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
    />
  );
}
