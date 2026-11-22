export function formatYen(value: number): string {
  const rounded = Math.round(value);
  return `${rounded < 0 ? "−" : ""}¥${Math.abs(rounded).toLocaleString("ja-JP")}`;
}

/** 率。分母が0なら「—」 */
export function formatRate(numerator: number, denominator: number): string {
  if (denominator <= 0) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}
