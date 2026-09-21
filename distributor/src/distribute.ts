import { createPublicClient, createWalletClient, http, defineChain, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";
import { erc20Abi, dividendRouterAbi, vaultAbi } from "./abi.js";

const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
});

const account = privateKeyToAccount(config.privateKey);

export const publicClient = createPublicClient({
  chain: robinhood,
  transport: http(config.rpcUrl),
});

export const walletClient = createWalletClient({
  account,
  chain: robinhood,
  transport: http(config.rpcUrl),
});

/// A single distribution tick:
///   1. Read the DividendRouter's pending weth balance (all platform fees
///      collected since the last flush).
///   2. Read RewardVault.totalShares — if zero, skip (no stakers yet).
///   3. If balance ≥ MIN_FLUSH_AMOUNT, call DividendRouter.flush().
///
///   DividendRouter.flush() atomically:
///     - swaps 50% of weth → SIGIL on the configured DEX
///     - sends bought SIGIL to 0x000...dEaD (permanent burn)
///     - deposits the other 50% into RewardVault as weth dividend
///       (updates accRewardPerShare; stakers see pendingRewards grow)
///
/// The bot doesn't hold the funds — the router does. The bot's private key
/// only needs enough native ETH for gas.
export async function distributeTick(): Promise<
  | { skipped: true; reason: string; balance: string }
  | {
      skipped: false;
      totalRSpy: string;
      sigilBought: string;
      txHash: string;
      gasUsed: string;
    }
> {
  const balance = (await publicClient.readContract({
    address: config.dividendRouter,
    abi: dividendRouterAbi,
    functionName: "pendingRSpy",
  })) as bigint;

  const totalShares = (await publicClient.readContract({
    address: config.rewardVault,
    abi: vaultAbi,
    functionName: "totalShares",
  })) as bigint;

  if (totalShares === 0n) {
    return { skipped: true, reason: "no stakers yet", balance: balance.toString() };
  }

  const minFlush = (await publicClient.readContract({
    address: config.dividendRouter,
    abi: dividendRouterAbi,
    functionName: "minFlushAmount",
  })) as bigint;

  if (balance < minFlush) {
    return {
      skipped: true,
      reason: `below min flush (${balance} < ${minFlush})`,
      balance: balance.toString(),
    };
  }

  // Simulate first so we get sigilBought back cleanly
  const { result, request } = await publicClient.simulateContract({
    account,
    address: config.dividendRouter,
    abi: dividendRouterAbi,
    functionName: "flush",
  });
  const [totalRSpy, sigilBought] = result as [bigint, bigint];

  const txHash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });

  return {
    skipped: false,
    totalRSpy: totalRSpy.toString(),
    sigilBought: sigilBought.toString(),
    txHash,
    gasUsed: receipt.gasUsed.toString(),
  };
}

export function botAddress() {
  return account.address;
}
