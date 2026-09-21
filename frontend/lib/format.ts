export function shortAddr(addr: string, chars = 4): string {
  if (!addr) return "";
  if (addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}`;
}

export function fmtUsd(scaled1e8: string | bigint, decimals = 2): string {
  const v = typeof scaled1e8 === "string" ? BigInt(scaled1e8) : scaled1e8;
  const n = Number(v) / 1e8;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(decimals)}`;
}

export function fmtAmount(raw: string | bigint, decimals = 18): string {
  const v = typeof raw === "string" ? BigInt(raw) : raw;
  const whole = v / 10n ** BigInt(decimals);
  return whole.toLocaleString("en-US");
}

export function rarityLabel(r: 0 | 1 | 2 | 3): string {
  return ["Common", "Rare", "Epic", "Legendary"][r];
}

export function rarityColor(r: 0 | 1 | 2 | 3): string {
  return ["text-bone-500", "text-sky-400", "text-purple-400", "text-ember-400"][r];
}

export function fmtDate(unix: number): string {
  const d = new Date(unix * 1000);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
