import "dotenv/config";

function req(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

export const config = {
  rpcUrl: req("ROBINHOOD_RPC_URL"),
  privateKey: req("BOT_PRIVATE_KEY") as `0x${string}`,
  weth: req("WETH_ADDRESS") as `0x${string}`,
  dividendRouter: req("DIVIDEND_ROUTER_ADDRESS") as `0x${string}`,
  rewardVault: req("REWARD_VAULT_ADDRESS") as `0x${string}`,
  tickIntervalMs: Number(process.env.TICK_INTERVAL_MS ?? 600_000),
  minFlushAmount: BigInt(process.env.MIN_FLUSH_AMOUNT ?? "1000000"),
  logLevel: process.env.LOG_LEVEL ?? "info",
};
