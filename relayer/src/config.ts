import "dotenv/config";

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

export const config = {
  robinhoodRpcUrl: required("ROBINHOOD_RPC_URL"),
  burnRegistryAddress: required("BURN_REGISTRY_ADDRESS") as `0x${string}`,
  startBlock: BigInt(process.env.START_BLOCK ?? "0"),

  lightwalletd: {
    host: required("LIGHTWALLETD_HOST"),
    port: Number(process.env.LIGHTWALLETD_PORT ?? 9067),
    network: (process.env.ZCASH_NETWORK ?? "testnet") as "testnet" | "mainnet",
  },

  zcash: {
    mnemonic: required("ZCASH_SEED_MNEMONIC"),
    accountIndex: Number(process.env.ZCASH_ACCOUNT_INDEX ?? 0),
  },

  databaseUrl: required("DATABASE_URL"),
  logLevel: process.env.LOG_LEVEL ?? "info",
};
