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

// Chain logos: canonical TrustWallet assets (mirrored on GitHub CDN — cacheable & CORS-safe).
// Robinhood is not in TrustWallet's registry, so we hand-embed an SVG for it.
const TW_BASE = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains";

export const SUPPORTED_BURN_CHAINS = [
  {
    id: "robinhood",
    name: "Robinhood",
    ticker: "RBN",
    tint: "#d97706",
    logo: null, // rendered inline in <ChainPicker/> as SVG
  },
  {
    id: "ethereum",
    name: "Ethereum",
    ticker: "ETH",
    tint: "#627eea",
    logo: `${TW_BASE}/ethereum/info/logo.png`,
  },
  {
    id: "solana",
    name: "Solana",
    ticker: "SOL",
    tint: "#9945ff",
    logo: `${TW_BASE}/solana/info/logo.png`,
  },
  {
    id: "base",
    name: "Base",
    ticker: "BASE",
    tint: "#0052ff",
    logo: `${TW_BASE}/base/info/logo.png`,
  },
  {
    id: "bsc",
    name: "BNB Chain",
    ticker: "BNB",
    tint: "#f0b90b",
    logo: `${TW_BASE}/smartchain/info/logo.png`,
  },
  {
    id: "arbitrum",
    name: "Arbitrum",
    ticker: "ARB",
    tint: "#28a0f0",
    logo: `${TW_BASE}/arbitrum/info/logo.png`,
  },
] as const;

export type BurnChainId = typeof SUPPORTED_BURN_CHAINS[number]["id"];
