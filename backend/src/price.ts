import { config } from "./config.js";

/// Return USD value scaled 1e8 of `amount` raw units of a token at a given time.
/// Uses CoinGecko historical price API. For unknown / dead tokens returns 0.

const COINGECKO = "https://api.coingecko.com/api/v3";

interface CoinIdCache {
  [contract: string]: { id: string; decimals: number } | null;
}
const cache: CoinIdCache = {};

const PLATFORM_BY_CHAIN: Record<string, string> = {
  ethereum: "ethereum",
  base: "base",
  bsc: "binance-smart-chain",
  arbitrum: "arbitrum-one",
  solana: "solana",
};

export async function priceUsdAtBlock(
  chain: keyof typeof PLATFORM_BY_CHAIN,
  contract: string,
  unixTs: number,
  rawAmount: bigint
): Promise<bigint> {
  const key = `${chain}:${contract}`;
  if (cache[key] === undefined) cache[key] = await resolveCoin(chain, contract);
  const meta = cache[key];
  if (!meta) return 0n;

  // Fetch historical price at date closest to burn time
  const date = new Date(unixTs * 1000);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  const url = `${COINGECKO}/coins/${meta.id}/history?date=${dd}-${mm}-${yyyy}&localization=false`;

  const res = await fetch(url, {
    headers: config.priceApiKey ? { "x-cg-pro-api-key": config.priceApiKey } : {},
  });
  if (!res.ok) return 0n;
  const json: any = await res.json();
  const usd = json?.market_data?.current_price?.usd ?? 0;

  // scale: (rawAmount / 10^decimals) * usd * 1e8
  const usdScaled = BigInt(Math.round(usd * 1e8));
  return (rawAmount * usdScaled) / BigInt(10 ** meta.decimals);
}

async function resolveCoin(chain: string, contract: string): Promise<{ id: string; decimals: number } | null> {
  const platform = PLATFORM_BY_CHAIN[chain];
  if (!platform) return null;
  const url = `${COINGECKO}/coins/${platform}/contract/${contract}`;
  const res = await fetch(url, {
    headers: config.priceApiKey ? { "x-cg-pro-api-key": config.priceApiKey } : {},
  });
  if (!res.ok) return null;
  const json: any = await res.json();
  return {
    id: json.id as string,
    decimals: (json.detail_platforms?.[platform]?.decimal_place ?? 18) as number,
  };
}
