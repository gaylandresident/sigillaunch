"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAccount, useBalance, useReadContract, useWriteContract } from "wagmi";
import { useMemo, useState } from "react";
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

// Legacy launchpad kept live so tokens launched before 2026-09-21 remain tradable.
const LEGACY_LAUNCHPAD = "0x86c16a2b955be9c779f2691482d3a9af52089a73" as `0x${string}`;

export default function TokenPage() {
  const params = useParams<{ token: string }>();
  const tokenParam = params?.token ?? "";
  const token = tokenParam.toLowerCase() as `0x${string}`;

  const { address, chainId } = useAccount();
  const { data: ethBal } = useBalance({ address });
  const { data: tokBal } = useBalance({ address, token: isAddress(token) ? token : undefined });
  const { writeContractAsync, isPending } = useWriteContract();

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

  // Try new launchpad first
  const { data: launchNew } = useReadContract({
    address: CONTRACTS.launchpad,
    abi: launchpadAbi,
    functionName: "launches",
    args: launchId ? [launchId] : undefined,
    query: { enabled: !!launchId },
  });
  // Fallback: legacy launchpad
  const { data: launchLegacy } = useReadContract({
    address: LEGACY_LAUNCHPAD,
    abi: launchpadAbi,
    functionName: "launches",
    args: launchId ? [launchId] : undefined,
    query: { enabled: !!launchId },
  });

  const rawNew = launchNew as readonly [`0x${string}`, `0x${string}`, bigint, bigint, bigint, bigint, string] | undefined;
  const rawLegacy = launchLegacy as readonly [`0x${string}`, `0x${string}`, bigint, bigint, bigint, bigint, string] | undefined;
  const useLegacy = (!rawNew || rawNew[0] === "0x0000000000000000000000000000000000000000") &&
                    rawLegacy && rawLegacy[0] !== "0x0000000000000000000000000000000000000000";
  const raw = useLegacy ? rawLegacy : rawNew;
  const activeLaunchpad = useLegacy ? LEGACY_LAUNCHPAD : CONTRACTS.launchpad;

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

  // Live quote for the amount entered
  const quote = useMemo(() => {
    try {
      const inputWei = parseEther(amount || "0");
      if (inputWei === 0n) return null;
      // constant product k = tokenReserve * wethReserve
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
  }, [amount, mode, tokenReserve, wethReserve, meta.symbol]);

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
            <p className="mt-8 max-w-2xl text-lg text-bone-400">{meta.description}</p>
          )}

          <dl className="mt-12 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            <Stat k="Price" v={`${formatEther(priceWei).slice(0, 10)} ETH`} />
            <Stat k="Market cap" v={`${Number(marketCapEth).toLocaleString()} ETH`} />
            <Stat k="Liquidity" v={`${formatEther(wethReserve).slice(0, 8)} ETH`} />
            <Stat k="Created" v={new Date(Number(createdAt) * 1000).toLocaleDateString()} />
          </dl>

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

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="kicker">{k}</p>
      <p className="mt-1 font-mono text-sm text-bone">{v}</p>
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
