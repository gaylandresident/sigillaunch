"use client";

import { useState, useRef } from "react";
import { useAccount, useBalance, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { encodeAbiParameters, keccak256, parseEther, formatEther } from "viem";
import { CONTRACTS, launchpadAbi } from "@/lib/contracts";
import { prepareLaunch } from "@/lib/api";

// Bonding-curve phantom reserve — chosen so the curve graduates once real ETH
// raised hits 4.2 ETH with ~80% of supply sold. Matches Pons V2 defaults.
const PHANTOM_WETH = parseEther("1.05");
const LAUNCH_FEE = parseEther("0.0005");
const SUPPLY = 1_000_000_000n * 10n ** 18n;

export default function LaunchPage() {
  const { address } = useAccount();
  const { data: bal } = useBalance({ address });
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [imageDataUri, setImageDataUri] = useState<string>("");
  const [imageName, setImageName] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [tgHandle, setTgHandle] = useState("");
  const [devBuy, setDevBuy] = useState("0.00");
  const [result, setResult] = useState<{ tx: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: launchFeeOnchain } = useReadContract({
    address: CONTRACTS.launchpad,
    abi: launchpadAbi,
    functionName: "launchFee",
  });
  const launchFee = (launchFeeOnchain as bigint | undefined) ?? LAUNCH_FEE;

  async function handleFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 500_000) {
      setError("image too large (max 500 KB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUri(reader.result as string);
      setImageName(f.name);
    };
    reader.readAsDataURL(f);
  }

  const availableEth = bal ? Number(bal.value) / 1e18 - 0.001 : 0;
  const devBuyWei = (() => {
    try {
      return parseEther(devBuy || "0");
    } catch {
      return 0n;
    }
  })();

  async function submit() {
    if (!address) return;
    setError(null);
    setResult(null);
    try {
      // Pre-flight: check user has enough ETH for launchFee + devBuy + gas headroom
      const gasHeadroom = parseEther("0.001"); // ~ 2 txs worth on L2
      const required = launchFee + devBuyWei + gasHeadroom;
      if (bal && bal.value < required) {
        const need = Number(required) / 1e18;
        const have = Number(bal.value) / 1e18;
        throw new Error(
          `Insufficient ETH: need ~${need.toFixed(4)} (fee ${formatEther(launchFee)} + dev buy ${devBuy} + gas), wallet has ${have.toFixed(4)}. Lower "Developer buy" or top up.`,
        );
      }

      const supply = SUPPLY.toString();
      const prep = await prepareLaunch({ creator: address, name, symbol, supply });

      const metadata = {
        name,
        symbol,
        description,
        image: imageDataUri,
        socials: { x: xHandle || null, telegram: tgHandle || null },
        chain: "robinhood-4663",
        launched: prep.timestampMs,
        zsa: {
          assetBase: prep.zsa.assetBase,
          issuer: prep.zsa.issuer,
        },
      };
      const metaJson = JSON.stringify(metadata);
      const metadataURI = `data:application/json;base64,${btoa(unescape(encodeURIComponent(metaJson)))}`;

      const descHash = prep.zsa.actions[0]?.assetDescHash;
      if (!descHash) throw new Error("descHash missing");

      // ── STEP 1: createLaunch (pays launchFee only) ──
      // ALL msg.value here becomes creator fee sent to DividendRouter.
      // Do NOT include devBuy in this value — it would be lost.
      const tx = await writeContractAsync({
        address: CONTRACTS.launchpad,
        abi: launchpadAbi,
        functionName: "createLaunch",
        value: launchFee,
        args: [
          name,
          symbol,
          metadataURI,
          PHANTOM_WETH,
          prep.zsa.assetBase,
          descHash,
          prep.zsa.issuer,
          prep.zsa.issueAuthSig,
        ],
      });
      setResult({ tx });

      // ── STEP 2: if devBuy > 0, wait for launch tx then buy() as separate tx ──
      if (devBuyWei > 0n && publicClient) {
        try {
          const receipt = await publicClient.waitForTransactionReceipt({ hash: tx as `0x${string}` });
          // Recover token address from launchId (deterministic from contract logic)
          // launchId = keccak256(abi.encode(token, chainid)) — we need token from receipt logs
          // Easier: derive launchId by scanning LaunchCreated event topics
          // But wagmi ABI parsing gets ugly; simplest is to read paginatedLaunches after tx
          const launchCount = await publicClient.readContract({
            address: CONTRACTS.launchpad,
            abi: launchpadAbi,
            functionName: "launchCount",
          }) as bigint;
          const ids = await publicClient.readContract({
            address: CONTRACTS.launchpad,
            abi: launchpadAbi,
            functionName: "paginatedLaunches",
            args: [launchCount - 1n, 1n],
          }) as `0x${string}`[];
          if (ids.length > 0) {
            const buyTx = await writeContractAsync({
              address: CONTRACTS.launchpad,
              abi: launchpadAbi,
              functionName: "buy",
              value: devBuyWei,
              args: [ids[0], 0n],
            });
            setResult({ tx: `${tx} | dev-buy: ${buyTx}` });
          }
        } catch (buyErr: any) {
          // Launch succeeded; devBuy failed. Show as warning, not error.
          setError(
            `Launch OK (${tx.slice(0, 12)}…) but dev-buy failed: ${buyErr?.shortMessage ?? buyErr?.message}. You can buy manually on the token page.`,
          );
        }
      }
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? String(e));
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 pt-12 pb-24">
      <p className="kicker mb-4">Launch token</p>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* ─── FORM ─── */}
        <div className="space-y-8">
          <Field label="Name">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Token name"
            />
          </Field>

          <Field label="Ticker">
            <input
              className="input font-mono uppercase"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
              placeholder="symbol"
            />
          </Field>

          <Field label="Description">
            <textarea
              className="input min-h-[80px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short description of the token"
            />
          </Field>

          <Field label="Token image">
            <div
              onClick={() => fileRef.current?.click()}
              className="flex cursor-pointer items-center gap-4 border border-dashed border-bone-600/40 bg-ink-800/50 px-4 py-4 transition-colors hover:border-ember/60"
            >
              {imageDataUri ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageDataUri} alt="preview" className="h-14 w-14 border border-bone-600/40 object-cover" />
              ) : (
                <div className="h-14 w-14 border border-bone-600/40 bg-ink-700" />
              )}
              <div className="flex-1">
                <p className="font-mono text-xs uppercase tracking-widest2 text-bone-400">
                  {imageName || "No file chosen"}
                </p>
                <p className="mt-1 text-[0.7rem] text-bone-600">
                  Click to upload · PNG / JPG / GIF · max 500 KB
                </p>
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </Field>

          <div className="grid gap-8 sm:grid-cols-2">
            <Field label="X profile">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xs text-bone-600">x.com/</span>
                <input
                  className="input flex-1"
                  value={xHandle}
                  onChange={(e) => setXHandle(e.target.value.replace(/^@/, ""))}
                  placeholder="handle"
                />
              </div>
            </Field>
            <Field label="Telegram">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xs text-bone-600">t.me/</span>
                <input
                  className="input flex-1"
                  value={tgHandle}
                  onChange={(e) => setTgHandle(e.target.value.replace(/^@/, ""))}
                  placeholder="community"
                />
              </div>
            </Field>
          </div>

          <div className="grid gap-8 sm:grid-cols-2">
            <Field label="Paired asset">
              <div className="flex items-center gap-3 border border-bone-600/40 bg-ink-800/50 px-4 py-3">
                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-bone-500 to-bone-600" />
                <span className="font-mono text-sm text-bone">ETH</span>
              </div>
              <p className="mt-2 text-[0.7rem] text-bone-600">
                Graduates once the curve raises 4.2 ETH.
              </p>
            </Field>

            <Field label="Developer buy">
              <div className="flex items-baseline gap-2">
                <input
                  className="input flex-1 font-mono"
                  value={devBuy}
                  onChange={(e) => setDevBuy(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="0.00"
                />
                <span className="font-mono text-xs text-bone-500">ETH</span>
                <button
                  className="font-mono text-[0.65rem] uppercase tracking-widest2 text-ember hover:text-ember-400"
                  onClick={() => setDevBuy(availableEth.toFixed(4))}
                >
                  Max
                </button>
              </div>
              <p className="mt-2 text-[0.7rem] text-bone-600">
                {availableEth.toFixed(4)} available · bought in the launch transaction
              </p>
            </Field>
          </div>

          <details className="group border-t border-bone-600/30 pt-6">
            <summary className="flex cursor-pointer items-baseline justify-between font-mono text-xs uppercase tracking-widest2 text-bone-500 hover:text-bone">
              <span>Advanced</span>
              <span className="text-bone-600 group-open:hidden">＋</span>
              <span className="hidden text-bone-600 group-open:inline">−</span>
            </summary>
            <div className="mt-4 space-y-2 text-[0.7rem] text-bone-500">
              <p>ETH pair · {formatEther(launchFee)} ETH due</p>
              <p>Phantom reserve: {formatEther(PHANTOM_WETH)} ETH (curve start)</p>
              <p>Fixed supply: 1,000,000,000</p>
            </div>
          </details>

          <div className="pt-4">
            <button
              className="btn-primary w-full justify-center py-4"
              disabled={!address || !name || !symbol || isPending}
              onClick={submit}
            >
              {isPending ? "Signing…" : "Launch"}
            </button>
          </div>

          <AnimatePresence>
            {(result || error) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="card p-6"
              >
                {error && (
                  <>
                    <p className="kicker text-crimson">Error</p>
                    <p className="mt-2 font-mono text-xs text-bone">{error}</p>
                  </>
                )}
                {result && (
                  <>
                    <p className="kicker text-ember">Launched</p>
                    <p className="mt-2 break-all font-mono text-xs text-bone">{result.tx}</p>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ─── SIDEBAR (sticky summary) ─── */}
        <aside className="lg:sticky lg:top-8 h-fit">
          <div className="card p-6">
            <p className="kicker mb-6">Summary</p>

            <div className="flex items-center gap-4 border-b border-bone-600/30 pb-4">
              {imageDataUri ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageDataUri} alt="" className="h-14 w-14 border border-bone-600/40 object-cover" />
              ) : (
                <div className="h-14 w-14 border border-bone-600/40 bg-ink-700" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-serif text-lg text-bone">
                  {name || <span className="text-bone-600 italic">Your token</span>}
                </p>
                <p className="kicker mt-1">${symbol || "ticker"}</p>
              </div>
            </div>

            <dl className="mt-6 space-y-3">
              <Row k="Launch fee" v={`${formatEther(launchFee)} ETH`} />
              <Row k="Paired with" v="ETH" />
              <Row k="Trade fee" v="1.00 %" />
              <Row k="Launch window" v="99% snipe tax · 3 s" />
              <Row k="Graduation" v="4.2 ETH" />
              <Row k="Liquidity" v="Permanent" />
              <Row k="Supply" v="1,000,000,000" />
            </dl>

            <div className="hairline my-6" />

            <p className="font-mono text-[0.65rem] uppercase tracking-widest2 text-bone-600">
              Fees route:
            </p>
            <p className="mt-2 text-xs text-bone-400">
              30% creator · 70% Dividend Router (buyback + ETH dividend)
            </p>
          </div>
        </aside>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid rgba(244, 241, 235, 0.15);
          padding: 0.75rem 0;
          color: #f4f1eb;
          outline: none;
          font-size: 1rem;
        }
        .input:focus {
          border-bottom-color: #d97706;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="kicker mb-3">{label}</p>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="font-mono text-[0.7rem] uppercase tracking-widest2 text-bone-500">{k}</dt>
      <dd className="font-mono text-xs text-bone">{v}</dd>
    </div>
  );
}
