"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAccount, useBalance, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { useEffect, useMemo, useState } from "react";
import {
  encodeAbiParameters,
  keccak256,
  parseEther,
  formatEther,
  isAddress,
  erc20Abi,
} from "viem";
import { CONTRACTS, launchpadAbi, EXPLORER_BASE } from "@/lib/contracts";
import { motion, AnimatePresence } from "framer-motion";

const ROBINHOOD_CHAIN_ID = 4663n;

// Previous launchpads still tradable (kept for continuity after each redeploy)
const LEGACY_LAUNCHPADS: `0x${string}`[] = [
  "0xb82d1356e77e301041add2ef53bbcaf428b5be53",
  "0x86c16a2b955be9c779f2691482d3a9af52089a73",
];

export default function TokenPage() {
  const params = useParams<{ token: string }>();
  const tokenParam = params?.token ?? "";
  const token = tokenParam.toLowerCase() as `0x${string}`;

  const { address, chainId } = useAccount();
  const { data: ethBal } = useBalance({ address });
  const { data: tokBal } = useBalance({ address, token: isAddress(token) ? token : undefined });
  const { writeContractAsync, isPending } = useWriteContract();
  const publicClient = usePublicClient();
  const [trades, setTrades] = useState<{ ts: number; price: number; isBuy: boolean }[]>([]);

  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const launchId = useMemo(() => {
    if (!isAddress(token)) return undefined;
    return keccak256(
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        [token, ROBINHOOD_CHAIN_ID],
      ),
    );
  }, [token]);

  // Try current launchpad first, then legacies
  const { data: launchNew } = useReadContract({
    address: CONTRACTS.launchpad,
    abi: launchpadAbi,
    functionName: "launches",
    args: launchId ? [launchId] : undefined,
    query: { enabled: !!launchId },
  });
  const { data: launchL0 } = useReadContract({
    address: LEGACY_LAUNCHPADS[0],
    abi: launchpadAbi,
    functionName: "launches",
    args: launchId ? [launchId] : undefined,
    query: { enabled: !!launchId },
  });
  const { data: launchL1 } = useReadContract({
    address: LEGACY_LAUNCHPADS[1],
    abi: launchpadAbi,
    functionName: "launches",
    args: launchId ? [launchId] : undefined,
    query: { enabled: !!launchId },
  });

  type Raw = readonly [`0x${string}`, `0x${string}`, bigint, bigint, bigint, bigint, string] | undefined;
  const zero = "0x0000000000000000000000000000000000000000";
  const candidates: { pad: `0x${string}`; raw: Raw }[] = [
    { pad: CONTRACTS.launchpad, raw: launchNew as Raw },
    { pad: LEGACY_LAUNCHPADS[0], raw: launchL0 as Raw },
    { pad: LEGACY_LAUNCHPADS[1], raw: launchL1 as Raw },
  ];
  const found = candidates.find((c) => c.raw && c.raw[0].toLowerCase() !== zero);
  const raw = found?.raw;
  const activeLaunchpad = found?.pad ?? CONTRACTS.launchpad;

  const { data: wethRaised } = useReadContract({
    address: activeLaunchpad,
    abi: launchpadAbi,
    functionName: "wethRaised",
    args: launchId ? [launchId] : undefined,
    query: { enabled: !!launchId && !!found, refetchInterval: 15_000 },
  });

  // Fetch recent Traded events to render the price chart
  useEffect(() => {
    if (!publicClient || !launchId || !found) return;
    let cancelled = false;
    (async () => {
      try {
        const latest = await publicClient.getBlockNumber();
        // Robinhood Chain's block time is ~2s → 50k blocks ≈ 28 hours of history.
        // Keep small to stay under Alchemy's log-range cap.
        const fromBlock = latest > 50_000n ? latest - 50_000n : 0n;
        const logs = await publicClient.getLogs({
          address: activeLaunchpad,
          event: {
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
          args: { launchId },
          fromBlock,
          toBlock: "latest",
        });
        const rows: { ts: number; price: number; isBuy: boolean }[] = [];
        // Batch-fetch block timestamps
        const blockNums = [...new Set(logs.map((l) => l.blockNumber))];
        const blocks = await Promise.all(blockNums.map((n) => publicClient.getBlock({ blockNumber: n })));
        const tsByBlock = new Map(blocks.map((b) => [b.number, Number(b.timestamp)]));
        for (const log of logs) {
          const { wethAmount, tokenAmount, isBuy } = log.args as any;
          if (!wethAmount || !tokenAmount) continue;
          // tick price in ETH per token
          const price = Number(wethAmount) / Number(tokenAmount);
          rows.push({ ts: tsByBlock.get(log.blockNumber) ?? 0, price, isBuy: !!isBuy });
        }
        rows.sort((a, b) => a.ts - b.ts);
        if (!cancelled) setTrades(rows.slice(-100));
      } catch (e) {
        // silent fail — chart is optional
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, launchId?.toString(), activeLaunchpad]);

  if (!isAddress(token)) {
    return (
      <div className="mx-auto max-w-3xl px-6 pt-24 text-center">
        <p className="kicker mb-4 text-crimson">Bad address</p>
        <p className="font-serif text-3xl text-bone">Not a valid token.</p>
        <Link href="/explore" className="btn-ghost mt-8 inline-flex">
          ← Back to explore
        </Link>
      </div>
    );
  }

  if (!raw || raw[0] === "0x0000000000000000000000000000000000000000") {
    return (
      <div className="mx-auto max-w-3xl px-6 pt-24 text-center">
        <p className="kicker mb-4">Loading…</p>
        <p className="font-mono text-xs text-bone-500 break-all">{token}</p>
        <p className="mt-4 text-sm text-bone-400">
          If this stays empty, the token is not a SIGIL launch or the RPC is slow.
        </p>
        <Link href="/explore" className="btn-ghost mt-8 inline-flex">
          ← Back to explore
        </Link>
      </div>
    );
  }

  const [, creator, tokenReserve, wethReserve, , createdAt, metadataURI] = raw;

  let meta: { name: string; symbol: string; description?: string; image?: string; socials?: any } = {
    name: "?",
    symbol: "?",
  };
  try {
    if (metadataURI.startsWith("data:application/json;base64,")) {
      meta = JSON.parse(atob(metadataURI.split(",")[1]));
    }
  } catch {}

  const priceWei = tokenReserve > 0n ? (wethReserve * 10n ** 18n) / tokenReserve : 0n;
  const marketCapEth =
    tokenReserve > 0n ? (wethReserve * 1_000_000_000n * 10n ** 18n) / tokenReserve / 10n ** 18n : 0n;

  // Live quote for the amount entered — plain function, no hooks (we're past early returns)
  const quote = (() => {
    try {
      const inputWei = parseEther(amount || "0");
      if (inputWei === 0n) return null;
      const k = tokenReserve * wethReserve;
      if (mode === "buy") {
        const fee = (inputWei * 100n) / 10000n; // 1% fee
        const wethIn = inputWei - fee;
        const newWeth = wethReserve + wethIn;
        const newTok = k / newWeth;
        const tokOut = tokenReserve - newTok;
        return { out: tokOut, unit: meta.symbol, feeWei: fee };
      } else {
        const newTok = tokenReserve + inputWei;
        const newWeth = k / newTok;
        const wethOutGross = wethReserve - newWeth;
        const fee = (wethOutGross * 100n) / 10000n;
        return { out: wethOutGross - fee, unit: "ETH", feeWei: fee };
      }
    } catch {
      return null;
    }
  })();

  async function submit() {
    if (!address || !launchId) return;
    setError(null);
    setTxHash(null);
    try {
      if (chainId !== 4663) {
        throw new Error("Switch wallet to Robinhood Chain (4663) first.");
      }
      const inputWei = parseEther(amount);
      if (inputWei === 0n) throw new Error("Enter an amount");

      if (mode === "buy") {
        const tx = await writeContractAsync({
          address: activeLaunchpad,
          abi: launchpadAbi,
          functionName: "buy",
          value: inputWei,
          args: [launchId, 0n],
        });
        setTxHash(tx);
      } else {
        // approve token → sell
        await writeContractAsync({
          address: token,
          abi: erc20Abi,
          functionName: "approve",
          args: [activeLaunchpad, inputWei],
        });
        const tx = await writeContractAsync({
          address: activeLaunchpad,
          abi: launchpadAbi,
          functionName: "sell",
          args: [launchId, inputWei, 0n],
        });
        setTxHash(tx);
      }
      setAmount("");
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? String(e));
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 pt-12 pb-24">
      <Link href="/explore" className="font-mono text-xs uppercase tracking-widest2 text-bone-500 hover:text-bone">
        ← Explore
      </Link>

      <div className="mt-8 flex flex-col gap-8 lg:flex-row">
        {/* HEADER */}
        <div className="flex-1">
          <div className="flex items-start gap-6">
            {meta.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={meta.image}
                alt={meta.name}
                className="h-24 w-24 border border-bone-600/40 object-cover"
              />
            ) : (
              <div className="h-24 w-24 border border-bone-600/40 bg-ink-700" />
            )}
            <div>
              <p className="kicker mb-2">${meta.symbol}</p>
              <h1 className="font-serif text-4xl text-bone">{meta.name}</h1>
              <p className="mt-2 break-all font-mono text-xs text-bone-500">{token}</p>
            </div>
          </div>

          {meta.description && (
            <p className="mt-6 max-w-2xl text-bone-400">{meta.description}</p>
          )}

          {/* Big price + FDV row */}
          <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-3">
            <div>
              <p className="kicker">Price</p>
              <p className="mt-1 font-mono text-3xl text-bone">
                {formatEther(priceWei).slice(0, 10)}
              </p>
              <p className="font-mono text-xs text-bone-500">ETH per {meta.symbol}</p>
            </div>
            <div>
              <p className="kicker">Market cap (FDV)</p>
              <p className="mt-1 font-mono text-3xl text-ember">
                {Number(marketCapEth).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
              <p className="font-mono text-xs text-bone-500">ETH</p>
            </div>
            <div>
              <p className="kicker">Liquidity</p>
              <p className="mt-1 font-mono text-3xl text-bone">
                {formatEther(wethReserve).slice(0, 6)}
              </p>
              <p className="font-mono text-xs text-bone-500">ETH in curve</p>
            </div>
          </div>

          {/* Graduation progress */}
          <div className="mt-10">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="kicker">Graduation progress</p>
              <p className="font-mono text-xs text-bone-500">
                {formatEther((wethRaised as bigint) ?? 0n).slice(0, 6)} / 4.2 ETH
              </p>
            </div>
            <div className="relative h-2 w-full overflow-hidden bg-ink-700">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-ember to-ember-400 transition-all"
                style={{
                  width: `${Math.min(100, (Number(((wethRaised as bigint) ?? 0n) * 10000n / parseEther("4.2")) / 100))}%`,
                }}
              />
            </div>
            <p className="mt-2 font-mono text-[0.65rem] uppercase tracking-widest2 text-bone-600">
              At 4.2 ETH raised, liquidity graduates & becomes permanent
            </p>
          </div>

          {/* Price chart */}
          <div className="mt-10">
            <p className="kicker mb-4">Price (last {trades.length} trades)</p>
            <PriceChart trades={trades} />
          </div>

          <p className="mt-6 font-mono text-[0.65rem] uppercase tracking-widest2 text-bone-600">
            Created {new Date(Number(createdAt) * 1000).toLocaleString()}
          </p>

          <div className="mt-8 flex gap-4 font-mono text-xs">
            <a
              href={`${EXPLORER_BASE}/token/${token}`}
              target="_blank"
              rel="noopener"
              className="uppercase tracking-widest2 text-bone-500 hover:text-ember"
            >
              Explorer ↗
            </a>
            {meta.socials?.x && (
              <a
                href={`https://x.com/${meta.socials.x}`}
                target="_blank"
                rel="noopener"
                className="uppercase tracking-widest2 text-bone-500 hover:text-ember"
              >
                @{meta.socials.x} ↗
              </a>
            )}
            {meta.socials?.telegram && (
              <a
                href={`https://t.me/${meta.socials.telegram}`}
                target="_blank"
                rel="noopener"
                className="uppercase tracking-widest2 text-bone-500 hover:text-ember"
              >
                t.me/{meta.socials.telegram} ↗
              </a>
            )}
          </div>

          <p className="mt-8 font-mono text-[0.65rem] uppercase tracking-widest2 text-bone-600">
            Creator: {creator}
          </p>
        </div>

        {/* TRADE PANEL */}
        <aside className="w-full lg:w-[380px] lg:sticky lg:top-8 h-fit">
          <div className="card p-6">
            <div className="inline-flex border border-bone-600/40">
              <TabBtn active={mode === "buy"} onClick={() => setMode("buy")}>
                Buy
              </TabBtn>
              <TabBtn active={mode === "sell"} onClick={() => setMode("sell")}>
                Sell
              </TabBtn>
            </div>

            <div className="mt-6">
              <p className="kicker mb-3">You pay</p>
              <div className="flex items-baseline gap-3 border-b border-bone-600/30 pb-2">
                <input
                  className="flex-1 bg-transparent font-mono text-2xl text-bone outline-none"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="0.00"
                />
                <span className="font-mono text-sm text-bone-500">
                  {mode === "buy" ? "ETH" : meta.symbol}
                </span>
              </div>
              <div className="mt-2 flex justify-between font-mono text-[0.7rem] text-bone-600">
                <span>
                  Balance:{" "}
                  {mode === "buy"
                    ? ethBal
                      ? Number(formatEther(ethBal.value)).toFixed(4)
                      : "—"
                    : tokBal
                    ? Number(formatEther(tokBal.value)).toFixed(2)
                    : "—"}
                </span>
                <button
                  className="text-ember hover:text-ember-400"
                  onClick={() => {
                    if (mode === "buy" && ethBal) {
                      const avail = ethBal.value - parseEther("0.001");
                      setAmount(avail > 0n ? formatEther(avail) : "0");
                    } else if (mode === "sell" && tokBal) {
                      setAmount(formatEther(tokBal.value));
                    }
                  }}
                >
                  Max
                </button>
              </div>
            </div>

            <div className="mt-6">
              <p className="kicker mb-3">You get (est.)</p>
              <p className="font-mono text-xl text-bone">
                {quote
                  ? `${Number(formatEther(quote.out)).toFixed(quote.unit === "ETH" ? 6 : 2)} ${quote.unit}`
                  : "—"}
              </p>
              {quote && (
                <p className="mt-1 font-mono text-[0.65rem] text-bone-600">
                  Fee: {formatEther(quote.feeWei).slice(0, 8)} ETH (1%)
                </p>
              )}
            </div>

            <button
              className="btn-primary mt-8 w-full justify-center py-3"
              disabled={!address || isPending || !amount}
              onClick={submit}
            >
              {isPending ? "Signing…" : mode === "buy" ? "Buy" : "Sell"}
            </button>

            <AnimatePresence>
              {(txHash || error) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-6"
                >
                  {error && (
                    <>
                      <p className="kicker text-crimson">Error</p>
                      <p className="mt-2 font-mono text-xs text-bone break-all">{error}</p>
                    </>
                  )}
                  {txHash && (
                    <>
                      <p className="kicker text-ember">Sent</p>
                      <a
                        className="mt-2 block break-all font-mono text-xs text-bone underline"
                        href={`${EXPLORER_BASE}/tx/${txHash}`}
                        target="_blank"
                        rel="noopener"
                      >
                        {txHash}
                      </a>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <p className="mt-6 font-mono text-[0.65rem] leading-relaxed text-bone-600">
              1% trade fee · 30% to creator · 70% to Dividend Router (buyback + certificate
              dividends). Graduates at 4.2 ETH raised.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PriceChart({ trades }: { trades: { ts: number; price: number; isBuy: boolean }[] }) {
  if (trades.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center border border-bone-600/30">
        <p className="font-serif text-sm italic text-bone-500">No trades yet — be the first.</p>
      </div>
    );
  }
  const W = 800;
  const H = 200;
  const pad = { l: 8, r: 8, t: 12, b: 20 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const prices = trades.map((t) => t.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || max || 1;
  const t0 = trades[0].ts;
  const tN = trades[trades.length - 1].ts;
  const tSpan = tN - t0 || 1;
  const xy = (t: { ts: number; price: number }) => ({
    x: pad.l + ((t.ts - t0) / tSpan) * iw,
    y: pad.t + ih - ((t.price - min) / range) * ih,
  });
  const line = trades
    .map((t, i) => {
      const p = xy(t);
      return `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    })
    .join(" ");
  const area = `M ${pad.l} ${pad.t + ih} ` +
    trades.map((t) => { const p = xy(t); return `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`; }).join(" ") +
    ` L ${pad.l + iw} ${pad.t + ih} Z`;
  const first = trades[0].price;
  const last = trades[trades.length - 1].price;
  const changePct = ((last - first) / (first || 1)) * 100;
  const up = changePct >= 0;
  return (
    <div className="border border-bone-600/30 bg-ink-800/40 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="font-mono text-xs text-bone-500">
          {trades.length} trades · {new Date(t0 * 1000).toLocaleDateString()} → now
        </p>
        <p className={`font-mono text-sm ${up ? "text-ember" : "text-crimson"}`}>
          {up ? "▲" : "▼"} {changePct.toFixed(2)}%
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-40 w-full">
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={up ? "#d97706" : "#ef4444"} stopOpacity="0.35" />
            <stop offset="100%" stopColor={up ? "#d97706" : "#ef4444"} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#grad)" />
        <path d={line} stroke={up ? "#d97706" : "#ef4444"} strokeWidth="1.5" fill="none" />
        {trades.map((t, i) => {
          const p = xy(t);
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={1.5}
              fill={t.isBuy ? "#d97706" : "#ef4444"}
            />
          );
        })}
      </svg>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-2 font-mono text-xs uppercase tracking-widest2 transition-colors ${
        active ? "bg-ember text-ink" : "text-bone-400 hover:text-bone"
      }`}
    >
      {children}
    </button>
  );
}
