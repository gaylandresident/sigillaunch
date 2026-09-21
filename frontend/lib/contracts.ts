export const CONTRACTS = {
  burnRegistry:  (process.env.NEXT_PUBLIC_BURN_REGISTRY   ?? "0x0e053063132b90b9a98efc4846968f24c11061cd") as `0x${string}`,
  certificate:   (process.env.NEXT_PUBLIC_CERTIFICATE     ?? "0xf6f842d392dd776ba7e8f6c46804aff9fe05e4af") as `0x${string}`,
  launchpad:     (process.env.NEXT_PUBLIC_LAUNCHPAD       ?? "0x194ae80ea162f2b2c2bd39dc80ac610d830d77c9") as `0x${string}`,
  vault:         (process.env.NEXT_PUBLIC_VAULT           ?? "0x46ab4f6ad1bfda11385cda92adee20d1d5dbc751") as `0x${string}`,
  weth:          (process.env.NEXT_PUBLIC_WETH            ?? "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73") as `0x${string}`,
  dividendRouter:(process.env.NEXT_PUBLIC_DIVIDEND_ROUTER ?? "0x820d755f4ab29125324df01d7aecedf7adf1c98d") as `0x${string}`,
  sigilToken:    (process.env.NEXT_PUBLIC_SIGIL_TOKEN     ?? "0xfb14980438acc1cdfc45f7de6420c27ef4cc846f") as `0x${string}`,
};

export const EXPLORER_BASE = process.env.NEXT_PUBLIC_EXPLORER_BASE ?? "https://explorer.robinhood.com";

export const launchpadAbi = [
  {
    type: "function",
    name: "createLaunch",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "metadataURI", type: "string" },
      { name: "phantomWethReserve", type: "uint256" },
      { name: "zsaAssetBase", type: "bytes32" },
      { name: "zsaDescHash", type: "bytes32" },
      { name: "zsaIssuer", type: "bytes" },
      { name: "zsaAuthSig", type: "bytes" },
    ],
    outputs: [
      { name: "launchId", type: "bytes32" },
      { name: "token", type: "address" },
    ],
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "payable",
    inputs: [{ name: "launchId", type: "bytes32" }, { name: "minTokenOut", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "sell",
    stateMutability: "nonpayable",
    inputs: [
      { name: "launchId", type: "bytes32" },
      { name: "tokenIn", type: "uint256" },
      { name: "minEthOut", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "launches",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [
      { name: "token", type: "address" },
      { name: "creator", type: "address" },
      { name: "tokenReserve", type: "uint256" },
      { name: "wethReserve", type: "uint256" },
      { name: "k", type: "uint256" },
      { name: "createdAt", type: "uint64" },
      { name: "metadataURI", type: "string" },
    ],
  },
  {
    type: "function",
    name: "priceWeth",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "launchCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "paginatedLaunches",
    stateMutability: "view",
    inputs: [{ name: "offset", type: "uint256" }, { name: "limit", type: "uint256" }],
    outputs: [{ type: "bytes32[]" }],
  },
  {
    type: "function",
    name: "launchFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "wethRaised",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "GRADUATION_THRESHOLD",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "Traded",
    inputs: [
      { name: "launchId", type: "bytes32", indexed: true },
      { name: "trader", type: "address", indexed: true },
      { name: "isBuy", type: "bool", indexed: false },
      { name: "wethAmount", type: "uint256", indexed: false },
      { name: "tokenAmount", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
    ],
  },
] as const;

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  (typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? "https://sigil-api.fly.dev"
    : "http://localhost:3001");

export const burnRegistryAbi = [
  {
    type: "function",
    name: "claim",
    stateMutability: "payable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "sourceChain", type: "uint8" },
      { name: "sourceToken", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "usdValueAtBurn", type: "uint256" },
      { name: "burnBlock", type: "uint256" },
      { name: "burnTxHash", type: "bytes32" },
      {
        name: "zsaBundle",
        type: "tuple",
        components: [
          { name: "issuer", type: "bytes" },
          {
            name: "actions",
            type: "tuple[]",
            components: [
              { name: "assetDescHash", type: "bytes32" },
              { name: "amount", type: "uint256" },
              { name: "finalize", type: "bool" },
            ],
          },
          { name: "issueAuthSig", type: "bytes" },
        ],
      },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "feeInWei",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const certificateAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "tokenOfOwnerByIndex", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  {
    type: "function",
    name: "getBurnRecord",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "sourceChain", type: "uint8" },
        { name: "sourceToken", type: "address" },
        { name: "burner", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "usdValueAtBurn", type: "uint256" },
        { name: "burnBlock", type: "uint256" },
        { name: "burnTxHash", type: "bytes32" },
        { name: "burnedAt", type: "uint64" },
        { name: "rarity", type: "uint8" },
        {
          name: "zsaBundle",
          type: "tuple",
          components: [
            { name: "issuer", type: "bytes" },
            {
              name: "actions",
              type: "tuple[]",
              components: [
                { name: "assetDescHash", type: "bytes32" },
                { name: "amount", type: "uint256" },
                { name: "finalize", type: "bool" },
              ],
            },
            { name: "issueAuthSig", type: "bytes" },
          ],
        },
      ],
    }],
  },
] as const;

export const vaultAbi = [
  { type: "function", name: "stake", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "unstake", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "pendingRewards", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalShares", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;
