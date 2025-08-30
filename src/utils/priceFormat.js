// src/utils/priceFormat.js

// Smart precision for token prices (keeps big prices tidy, adds detail for cheap tokens)
export function fmtPriceUSD(n) {
  const p = Number(n) || 0;
  let d;
  if (p >= 0.5)
    d = 2; // normal assets
  else if (p >= 0.1)
    d = 4; // 0.10 - 0.4999
  else if (p >= 0.01)
    d = 5; // 0.01 - 0.09999 (e.g., HEX)
  else if (p >= 0.001)
    d = 6; // 0.001 - 0.009999
  else if (p >= 0.0001)
    d = 7; // 0.0001 - 0.0009999 (PLSD/PLSX)
  else d = 8; // ultra small

  const s = p.toLocaleString(undefined, {
    minimumFractionDigits: d,
    maximumFractionDigits: d
  });
  return `USD $${s}`;
}
