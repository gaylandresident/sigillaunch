import "dotenv/config";

function req(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  logLevel: process.env.LOG_LEVEL ?? "info",
  databaseUrl: process.env.DATABASE_URL ?? "postgres://noop:noop@127.0.0.1:5432/noop",

  robinhood: {
    rpcUrl: req("ROBINHOOD_RPC_URL"),
    burnRegistry: req("BURN_REGISTRY_ADDRESS") as `0x${string}`,
    certificate: req("CERTIFICATE_ADDRESS") as `0x${string}`,
    launchpad: req("LAUNCHPAD_ADDRESS") as `0x${string}`,
    vault: req("REWARD_VAULT_ADDRESS") as `0x${string}`,
  },

  attesterPrivateKey: req("ATTESTER_PRIVATE_KEY") as `0x${string}`,

  /// ZIP-227 issuer identity — derives m/227'/133'/0'/0 from this mnemonic.
  /// All SIGIL certificates share this one canonical issuer so future ZSA
  /// mainnet migration can happen with a single issuance key.
  zsaIssuerMnemonic: req("ZSA_ISSUER_MNEMONIC"),
  zsaIssuerAccount: Number(process.env.ZSA_ISSUER_ACCOUNT ?? 0),

  chains: {
    ethereum:  { rpcUrl: req("ETHEREUM_RPC_URL"), dead: req("EVM_DEAD_ADDRESS") as `0x${string}` },
    base:      { rpcUrl: req("BASE_RPC_URL"),     dead: req("EVM_DEAD_ADDRESS") as `0x${string}` },
    bsc:       { rpcUrl: req("BSC_RPC_URL"),      dead: req("EVM_DEAD_ADDRESS") as `0x${string}` },
    arbitrum:  { rpcUrl: req("ARBITRUM_RPC_URL"), dead: req("EVM_DEAD_ADDRESS") as `0x${string}` },
    solana:    { rpcUrl: req("SOLANA_RPC_URL"),   dead: req("SOLANA_DEAD_ADDRESS") },
    robinhood: { rpcUrl: req("ROBINHOOD_RPC_URL"), dead: req("EVM_DEAD_ADDRESS") as `0x${string}` },
  },

  priceApiKey: process.env.COINGECKO_API_KEY ?? "",
};

export const SOURCE_CHAIN_IDS = {
  solana: 0,
  ethereum: 1,
  base: 2,
  bsc: 3,
  arbitrum: 4,
  // PROTOCOL = 5 (contract-only, never signed by attester)
  robinhood: 6,
} as const;
