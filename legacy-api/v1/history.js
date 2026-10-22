// api/v1/history.js
// Multi-chain transaction history aggregator using Etherscan-compatible APIs.
// - Supports chains: eth, pulse, bsc, polygon, base
// - Endpoints used: account/txlist, account/tokentx, (optionally) account/txlistinternal
// - Caches responses in Upstash Redis per chain:wallet:range for ~15 minutes
// - Basic classification: transfer (native/ERC-20), buy/sell (DEX router), stake/unstake (HEX/eHEX)

const crypto = require('crypto');

// Cache settings
const CACHE_TTL_SECONDS = 15 * 60; // 15 minutes
const LOCK_TTL_MS = 10000;
const UPSTREAM_TIMEOUT_MS = 6000;

// single-flight (per instance)
const inFlight = new Map(); // key -> Promise

function sha1(str) { return crypto.createHash('sha1').update(str).digest('hex'); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Upstash helpers
function requireUpstashEnv() {
  const URL = process.env.KV_REST_API_URL;
  const TOKEN = process.env.KV_REST_API_TOKEN;
  if (!URL || !TOKEN) throw new Error('Missing Upstash env vars (KV_REST_API_URL, KV_REST_API_TOKEN)');
  return { URL, TOKEN };
}

async function kvPipeline(commands) {
  const { URL, TOKEN } = requireUpstashEnv();
  const r = await fetch(`${URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  });
  if (!r.ok) throw new Error(`Upstash pipeline error: ${r.status}`);
  return r.json();
}

async function kvGet(key) {
  const resp = await kvPipeline([["GET", key]]);
  const out = resp && resp[0] ? resp[0].result : null;
  if (!out) return null;
  try { return JSON.parse(out); } catch { return null; }
}

async function kvSetEx(key, value, ttlSeconds) {
  await kvPipeline([["SET", key, JSON.stringify(value), "EX", String(ttlSeconds)]]);
}

async function kvAcquireLock(key, ttlMs) {
  const resp = await kvPipeline([["SET", key, Date.now().toString(), "NX", "PX", String(ttlMs)]]);
  const r = resp && resp[0] ? resp[0].result : null; return r === 'OK';
}
async function kvReleaseLock(key) { try { await kvPipeline([["DEL", key]]); } catch { } }

// Fetch with timeout
async function fetchWithTimeout(url, opts = {}, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...opts, signal: controller.signal }); }
  finally { clearTimeout(id); }
}

// Basic chain metadata
const CHAIN_META = {
  eth: {
    label: 'Ethereum',
    api: 'https://api.etherscan.io/api',
    keyEnv: 'ETHERSCAN_KEY',
    explorerscan: 'https://etherscan.io'
  },
  pulse: {
    label: 'PulseChain',
    api: 'https://api.scan.pulsechain.com/api', // Blockscout v1 (Etherscan-compatible subset)
    keyEnv: 'PLSSCAN_KEY',
    explorerscan: 'https://scan.pulsechain.com'
  },
  bsc: {
    label: 'BSC',
    api: 'https://api.bscscan.com/api',
    keyEnv: 'BSCSCAN_KEY',
    explorerscan: 'https://bscscan.com'
  },
  polygon: {
    label: 'Polygon',
    api: 'https://api.polygonscan.com/api',
    keyEnv: 'POLYGONSCAN_KEY',
    explorerscan: 'https://polygonscan.com'
  },
  base: {
    label: 'Base',
    api: 'https://api.basescan.org/api',
    keyEnv: 'BASESCAN_KEY',
    explorerscan: 'https://basescan.org'
  }
};

function isHexAddress(addr) { return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr); }

// Known DEX routers (extend as needed)
const ROUTERS = {
  eth: new Set([
    '0x7a250d5630b4cf539739df2c5dacb4c659f2488d', // Uniswap V2
    '0xe592427a0aece92de3edee1f18e0157c05861564'  // Uniswap V3
  ]),
  bsc: new Set([
    '0x10ed43c718714eb63d5aa57b78b54704e256024e' // Pancake V2
  ]),
  polygon: new Set([
    '0xa5e0829caCEd8fFDD4De3c43696c57F7D7A678ff' // QuickSwap V2
  ].map((x) => x.toLowerCase())),
  base: new Set([
    '0x2626664c2603336e57b271c5c0b26f421741e481' // BaseSwap
  ]),
  pulse: new Set([
    '0x1715a3dbe3d5f0a91f8e67cbb6b34bfecb4d6d5a' // PulseX Router V2 (example)
  ])
};

// HEX contract addresses for classification (can be overridden via env)
const HEX_ADDR = {
  eth: (process.env.ETH_HEX_ADDRESS || process.env.VITE_ETH_HEX_ADDRESS || '').toLowerCase(),
  pulse: (process.env.PLS_HEX_ADDRESS || process.env.VITE_PLS_HEX_ADDRESS || '').toLowerCase()
};

// Minimal function selectors for HEX stake methods
const HEX_METHODS = {
  stakeStart: '0x2f7a3c5d', // stakeStart(uint256,uint256) - known signature
  stakeEnd: '0xe39a8be6'    // stakeEnd(uint256,uint256)
};

function pickApiKey(chain, userKeyParam) {
  if (userKeyParam && typeof userKeyParam === 'string' && userKeyParam.trim()) return userKeyParam.trim();
  const envName = CHAIN_META[chain]?.keyEnv;
  return envName ? (process.env[envName] || '') : '';
}

function toInt(x) { const n = Number(x); return Number.isFinite(n) ? Math.floor(n) : 0; }

function classifyTx({ chain, wallet, tx, tokenTransfersForHash }) {
  const w = (wallet || '').toLowerCase();
  const to = (tx.to || '').toLowerCase();
  const from = (tx.from || '').toLowerCase();
  const input = String(tx.input || '');
  const routers = ROUTERS[chain] || new Set();
  const isToRouter = to && routers.has(to);

  // HEX stake/unstake by method selector
  const hexAddr = HEX_ADDR[chain];
  if (hexAddr && to === hexAddr) {
    if (input.startsWith(HEX_METHODS.stakeStart)) return 'stake';
    if (input.startsWith(HEX_METHODS.stakeEnd)) return 'unstake';
  }

  if (isToRouter) {
    // infer buy/sell direction from ERC-20 transfers in same tx hash if available
    const rows = tokenTransfersForHash || [];
    const anyIn = rows.some((r) => (r.to || '').toLowerCase() === w);
    const anyOut = rows.some((r) => (r.from || '').toLowerCase() === w);
    if (anyIn && !anyOut) return 'buy';
    if (anyOut && !anyIn) return 'sell';
    return 'swap';
  }

  // Native transfer
  const val = toInt(tx.value);
  if (val > 0) return 'transfer';

  // Fallback
  return 'contract';
}

function normalizeErc20Row(chain, wallet, r) {
  const dec = toInt(r.tokenDecimal || r.decimals || 0);
  const amount = (() => {
    const v = r.value || r.amount || '0';
    try { return Number(BigInt(v) / (BigInt(10) ** BigInt(dec))) + (Number(v) % 1); }
    catch { return Number(v) / Math.pow(10, dec); }
  })();
  const direction = (r.to || '').toLowerCase() === (wallet || '').toLowerCase() ? 'in' : 'out';
  return {
    type: 'erc20',
    chain,
    wallet,
    hash: r.hash,
    blockNumber: toInt(r.blockNumber),
    timeStamp: toInt(r.timeStamp),
    from: r.from,
    to: r.to,
    tokenSymbol: r.tokenSymbol,
    tokenName: r.tokenName,
    tokenAddress: r.contractAddress || r.tokenAddress,
    amount,
    direction
  };
}

function normalizeTxRow(chain, wallet, tx, tokenTransfersMap) {
  const fee = (() => {
    const gasUsed = toInt(tx.gasUsed);
    const gasPrice = toInt(tx.gasPrice);
    const eff = toInt(tx.effectiveGasPrice);
    const gp = eff > 0 ? eff : gasPrice;
    return gasUsed > 0 && gp > 0 ? String(BigInt(gasUsed) * BigInt(gp)) : '0';
  })();
  const tokenTransfersForHash = tokenTransfersMap.get(tx.hash) || [];
  const kind = classifyTx({ chain, wallet, tx, tokenTransfersForHash });
  return {
    type: 'tx',
    chain,
    wallet,
    hash: tx.hash,
    blockNumber: toInt(tx.blockNumber),
    timeStamp: toInt(tx.timeStamp),
    from: tx.from,
    to: tx.to,
    valueWei: String(tx.value || '0'),
    gasUsed: toInt(tx.gasUsed),
    gasPrice: toInt(tx.gasPrice),
    effectiveGasPrice: toInt(tx.effectiveGasPrice),
    feeWei: fee,
    methodId: (tx.input || '').slice(0, 10),
    class: kind
  };
}

async function fetchEtherscanLike({ chain, wallet, startBlock = 0, page = 1, offset = 100, sort = 'desc', apiKey }) {
  const meta = CHAIN_META[chain];
  if (!meta) throw new Error(`unsupported chain: ${chain}`);
  const base = meta.api;
  const keyParam = apiKey ? `&apikey=${encodeURIComponent(apiKey)}` : '';

  const common = `module=account&address=${encodeURIComponent(wallet)}&page=${page}&offset=${offset}&sort=${sort}`;
  const txUrl = `${base}?action=txlist&${common}&startblock=${startBlock}${keyParam}`;
  const tokUrl = `${base}?action=tokentx&${common}&startblock=${startBlock}${keyParam}`;
  // internal (optional): const intUrl = `${base}?action=txlistinternal&${common}&startblock=${startBlock}${keyParam}`;

  const [txR, tokR] = await Promise.all([
    fetchWithTimeout(txUrl),
    fetchWithTimeout(tokUrl)
  ]);
  if (!txR.ok) throw new Error(`upstream txlist ${txR.status}`);
  if (!tokR.ok) throw new Error(`upstream tokentx ${tokR.status}`);
  const txJ = await txR.json();
  const tokJ = await tokR.json();

  const txRows = Array.isArray(txJ?.result) ? txJ.result : [];
  const tokRows = Array.isArray(tokJ?.result) ? tokJ.result : [];

  // Build map: hash -> erc20 transfers
  const tokMap = new Map();
  for (const r of tokRows) {
    const h = r.hash;
    if (!h) continue;
    const arr = tokMap.get(h) || [];
    arr.push(r);
    tokMap.set(h, arr);
  }

  // Normalize
  const transfers = tokRows.map((r) => normalizeErc20Row(chain, wallet, r));
  const txs = txRows.map((r) => normalizeTxRow(chain, wallet, r, tokMap));

  return { txs, transfers };
}

function parseDateLike(v, def) {
  if (v == null || v === '') return def;
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const d = new Date(String(v));
  const t = Math.floor(d.getTime() / 1000);
  return Number.isFinite(t) ? t : def;
}

function buildCacheKey({ chain, wallet, fromTs, toTs, page }) {
  const range = `${fromTs || 0}-${toTs || 0}`;
  return `kw:history:v1:${chain}:${wallet.toLowerCase()}:${range}:p${page || 1}`;
}

module.exports = async (req, res) => {
  const t0 = Date.now();
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

    // env check
    try { requireUpstashEnv(); } catch (e) { return res.status(500).json({ error: e.message }); }

    const chain = String(req.query.chain || 'eth').toLowerCase();
    const wallet = String(req.query.wallet || '').toLowerCase();
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const days = Math.max(1, Math.min(180, parseInt(req.query.days || '30', 10))); // default 30 days, max 180
    const nowTs = Math.floor(Date.now() / 1000);
    const toTs = parseDateLike(req.query.to, nowTs);
    const fromTs = parseDateLike(req.query.from, toTs - days * 86400);
    const userKey = (req.query.key || '').toString();

    if (!CHAIN_META[chain]) return res.status(400).json({ error: 'unsupported chain' });
    if (!isHexAddress(wallet)) return res.status(400).json({ error: 'invalid wallet' });

    const cacheKey = buildCacheKey({ chain, wallet, fromTs, toTs, page });
    const cached = await kvGet(cacheKey);
    if (cached && Array.isArray(cached.items)) {
      return res.status(200).json({ cached: true, ...cached, tookMs: Date.now() - t0 });
    }

    // single-flight lock (cross-instance via Upstash)
    const lockKey = `lock:${sha1(cacheKey)}`;
    const haveLock = await kvAcquireLock(lockKey, LOCK_TTL_MS);
    if (!haveLock) {
      // wait a bit for the other request to populate cache
      await sleep(300);
      const retry = await kvGet(cacheKey);
      if (retry && Array.isArray(retry.items)) return res.status(200).json({ cached: true, ...retry, tookMs: Date.now() - t0 });
    }

    // in-process single-flight too
    if (inFlight.has(cacheKey)) {
      const result = await inFlight.get(cacheKey);
      return res.status(200).json({ cached: true, ...result, tookMs: Date.now() - t0 });
    }

    const apiKey = pickApiKey(chain, userKey);
    const p = (async () => {
      const { txs, transfers } = await fetchEtherscanLike({ chain, wallet, startBlock: 0, page, offset: 100, sort: 'desc', apiKey });

      // Filter by date range
      const within = (ts) => ts >= fromTs && ts <= toTs;
      const txsF = txs.filter((r) => within(r.timeStamp));
      const transfersF = transfers.filter((r) => within(r.timeStamp));

      // Build explorer URL + fee in native units can be computed client-side; include helpers
      const explorerBase = CHAIN_META[chain].explorerscan;
      const items = [];

      // Map token decimals per contract for client convenience
      const tokenMeta = {};
      for (const r of transfersF) {
        if (r.tokenAddress && !tokenMeta[r.tokenAddress.toLowerCase()]) {
          // We don't have decimals here reliably; the row includes tokenDecimal originally, but stripped in normalize.
          // Leave empty; client can enrich via metadata services if needed.
          tokenMeta[r.tokenAddress.toLowerCase()] = { symbol: r.tokenSymbol || '', name: r.tokenName || '' };
        }
      }

      for (const r of txsF) {
        items.push({
          kind: 'tx',
          chain,
          wallet,
          hash: r.hash,
          timeStamp: r.timeStamp,
          from: r.from,
          to: r.to,
          valueWei: r.valueWei,
          feeWei: r.feeWei,
          class: r.class,
          explorer: `${explorerBase}/tx/${r.hash}`
        });
      }
      for (const r of transfersF) {
        items.push({
          kind: 'erc20',
          chain,
          wallet,
          hash: r.hash,
          timeStamp: r.timeStamp,
          from: r.from,
          to: r.to,
          token: {
            address: r.tokenAddress,
            symbol: r.tokenSymbol,
            name: r.tokenName
          },
          amount: r.amount,
          direction: r.direction,
          explorer: `${explorerBase}/tx/${r.hash}`
        });
      }

      // Sort newest first
      items.sort((a, b) => b.timeStamp - a.timeStamp);

      const payload = { chain, wallet, fromTs, toTs, page, items, tokenMeta };
      await kvSetEx(cacheKey, payload, CACHE_TTL_SECONDS);
      return payload;
    })();

    inFlight.set(cacheKey, p);
    try {
      const payload = await p;
      return res.status(200).json({ cached: false, ...payload, tookMs: Date.now() - t0 });
    } finally {
      inFlight.delete(cacheKey);
      await kvReleaseLock(lockKey);
    }
  } catch (e) {
    return res.status(500).json({ error: e.message || 'server error' });
  }
};

