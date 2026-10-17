// Integer balances remain exact until the final display conversion.
export function formatTokenUnits(raw, decimals = 18) {
  const d = Number(decimals);
  if (!Number.isInteger(d) || d < 0 || d > 255) throw new Error('Invalid token decimals');
  const value = BigInt(raw);
  if (value < 0n) throw new Error('Negative balance');
  if (d === 0) return value.toString();
  const digits = value.toString().padStart(d + 1, '0');
  return `${digits.slice(0, -d)}.${digits.slice(-d)}`.replace(/\.?0+$/, '');
}

export function toUnits(raw, decimals = 18) {
  return Number(formatTokenUnits(raw, decimals));
}

// Decimal multiplication/addition for valuations, without Number arithmetic.
function decimalParts(value) {
  const text = String(value);
  if (!/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) throw new Error('Invalid decimal');
  const [mantissa, exp = '0'] = text.toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  let integer = BigInt((whole || '0') + fraction);
  let scale = fraction.length - Number(exp);
  if (Math.abs(scale) > 1000) throw new Error('Decimal out of range');
  if (scale < 0) {
    integer *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return { integer, scale };
}
function render({ integer, scale }) {
  if (!scale) return integer.toString();
  const digits = integer.toString().padStart(scale + 1, '0');
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, '');
}
export function multiplyDecimal(a, b) {
  const x = decimalParts(a),
    y = decimalParts(b);
  return render({ integer: x.integer * y.integer, scale: x.scale + y.scale });
}
export function addDecimal(a, b) {
  const x = decimalParts(a),
    y = decimalParts(b),
    scale = Math.max(x.scale, y.scale);
  return render({ integer: x.integer * 10n ** BigInt(scale - x.scale) + y.integer * 10n ** BigInt(scale - y.scale), scale });
}
