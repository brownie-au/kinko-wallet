// src/services/hexShared.js
import { ethers } from 'ethers';

export function cleanHexAddress(addr, label = 'address') {
  const cleaned = String(addr || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/[\u200B-\u200D\uFEFF\s]/g, '');
  const lower = cleaned.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(lower)) {
    throw new Error(`Invalid ${label}. Expected 20-byte hex. Got "${cleaned}".`);
  }
  return lower;
}

export function checksumUserAddress(addr) {
  try {
    return ethers.utils.getAddress(addr);
  } catch {
    throw new Error(`Invalid wallet address "${addr}". Please check and try again.`);
  }
}

export function isBenignStakeRevert(err) {
  const m = `${err?.reason || ''} ${err?.message || ''}`.toLowerCase();
  return /call_exception/i.test(m) || /missing revert data/i.test(m) || /execution reverted/i.test(m) || /revert/i.test(m);
}

export function isNetworkish(err) {
  const m = `${err?.code || ''} ${err?.message || ''}`.toLowerCase();
  return err?.code === 'NETWORK_ERROR' || /network|timeout|fetch|503|502|bad gateway|temporarily unavailable/i.test(m);
}

export function toNum(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  const s = v?.toString?.();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
