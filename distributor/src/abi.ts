export const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

export const dividendRouterAbi = [
  {
    type: "function",
    name: "flush",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [
      { name: "totalRSpy", type: "uint256" },
      { name: "sigilBought", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "pendingRSpy",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "minFlushAmount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const vaultAbi = [
  { type: "function", name: "totalShares", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;
