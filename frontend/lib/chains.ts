import { defineChain } from "viem";

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL ??
          "https://robinhood-mainnet.g.alchemy.com/v2/alch_mkS7FTQnzPCIou3V7eI3c",
      ],
    },
  },
  blockExplorers: {
    default: { name: "Explorer", url: "https://explorer.robinhood.com" },
  },
});

export const SUPPORTED_BURN_CHAINS = [
  { id: "ethereum",  name: "Ethereum", ticker: "ETH", tint: "#8b93a7" },
  { id: "solana",    name: "Solana",   ticker: "SOL", tint: "#9945ff" },
  { id: "base",      name: "Base",     ticker: "BASE", tint: "#1652f0" },
  { id: "bsc",       name: "BNB Chain", ticker: "BNB", tint: "#f0b90b" },
  { id: "arbitrum",  name: "Arbitrum", ticker: "ARB", tint: "#28a0f0" },
] as const;

export type BurnChainId = typeof SUPPORTED_BURN_CHAINS[number]["id"];
