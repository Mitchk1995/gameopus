// Small DOM helpers shared by the interface modules.

// A new element with an optional class and inner HTML.
export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

// A whole number with thousands separators.
export const fmt = (n) => n.toLocaleString('en-US');

// A stack size as item slots show it (100K, 10M), and the class that colours it.
export function qtyLabel(n) {
  if (n >= 10_000_000) return [`${Math.floor(n / 1_000_000)}M`, 'm'];
  if (n >= 100_000) return [`${Math.floor(n / 1000)}K`, 'k'];
  return [String(n), ''];
}
