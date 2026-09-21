"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useSignMessage,
  useSwitchChain,
  useWalletClient,
  useWriteContract,
} from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { parseEther, isAddress, parseUnits, erc20Abi as viemErc20Abi } from "viem";
import { ChainPicker } from "@/components/ChainPicker";
import { SUPPORTED_BURN_CHAINS, type BurnChainId } from "@/lib/chains";
import { requestAttestation, bindMessage } from "@/lib/api";
import { CONTRACTS, burnRegistryAbi } from "@/lib/contracts";
import { fmtUsd, shortAddr } from "@/lib/format";
import {
  createEmbeddedWallet,
  loadEmbeddedWallet,
  clearEmbeddedWallet,
  mnemonicRows,
  type EmbeddedWallet,
} from "@/lib/embeddedWallet";

const EVM_CHAIN_IDS: Record<Exclude<BurnChainId, "solana">, number> = {
  ethereum: 1,
  base: 8453,
  bsc: 56,
  arbitrum: 42161,
};
const EVM_DEAD = "0x000000000000000000000000000000000000dEaD" as const;

// MUST match SigilCertificate.SourceChain enum ordering — do NOT derive from
// SUPPORTED_BURN_CHAINS array order (that array is UI-ordered, not enum-ordered).
const SOURCE_CHAIN_ENUM: Record<BurnChainId, number> = {
  solana: 0,
  ethereum: 1,
  base: 2,
  bsc: 3,
  arbitrum: 4,
};

type Mode = "here" | "already";
type Step = "idle" | "burning" | "signing" | "attesting" | "attested" | "claiming" | "done" | "error";
type DestMode = "unset" | "generate" | "manual" | "connected";

export default function BurnPage() {
  const { address: connected, chainId: connectedChain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract();

  const [mode, setMode] = useState<Mode>("here");
  const [chain, setChain] = useState<BurnChainId>("ethereum");
  const [sourceToken, setSourceToken] = useState("");
  const [amount, setAmount] = useState("");
  const [decimals, setDecimals] = useState<number>(18);
  const [burnTxInput, setBurnTxInput] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [attestation, setAttestation] = useState<Awaited<
    ReturnType<typeof requestAttestation>
  > | null>(null);

  // Step 2: destination
  const [destMode, setDestMode] = useState<DestMode>("unset");
  const [embedded, setEmbedded] = useState<EmbeddedWallet | null>(null);
  const [manualAddr, setManualAddr] = useState("");
  const [savedAck, setSavedAck] = useState(false);

  useEffect(() => {
    const e = loadEmbeddedWallet();
    if (e) {
      setEmbedded(e);
      setDestMode("generate");
      setSavedAck(true);
    }
  }, []);

  const recipient: `0x${string}` | undefined = useMemo(() => {
    if (destMode === "connected") return connected;
    if (destMode === "generate") return embedded?.address;
    if (destMode === "manual" && isAddress(manualAddr)) return manualAddr as `0x${string}`;
    return undefined;
  }, [destMode, connected, embedded, manualAddr]);

  const chainMeta = SUPPORTED_BURN_CHAINS.find((c) => c.id === chain);

  function doCreateEmbedded() {
    const w = createEmbeddedWallet();
    setEmbedded(w);
    setDestMode("generate");
    setSavedAck(false);
  }

  // ── PRIMARY FLOW: burn directly from the site ───────────────────────────────
  async function handleBurnHere() {
    if (!connected || !walletClient || !recipient) return;
    if (chain === "solana") {
      setError("Solana in-site burn coming soon. Use 'I already burned' with your Solana wallet.");
      return;
    }
    if (!isAddress(sourceToken)) {
      setError("invalid token address");
      return;
    }
    setError(null);

    try {
      // 1. Switch to source chain
      const targetChainId = EVM_CHAIN_IDS[chain as Exclude<BurnChainId, "solana">];
      if (connectedChain !== targetChainId) {
        setStep("burning");
        await switchChainAsync({ chainId: targetChainId });
      }

      // 2. Do the burn: transfer to dead address
      setStep("burning");
      const rawAmount = parseUnits(amount, decimals);
      const burnHash = await walletClient.writeContract({
        address: sourceToken as `0x${string}`,
        abi: viemErc20Abi,
        functionName: "transfer",
        args: [EVM_DEAD, rawAmount],
        chain: undefined,
        account: connected,
      });
      setTxHash(burnHash);

      // 3. Sign the bind message
      setStep("signing");
      const msg = bindMessage({ sourceChain: chain, burnTxHash: burnHash, recipient });
      const bindSignature = await signMessageAsync({ message: msg });

      // 4. Ask backend for attestation
      setStep("attesting");
      const att = await requestAttestation({
        sourceChain: chain,
        sourceToken,
        burner: connected,
        recipient,
        amount: rawAmount.toString(),
        burnTxHash: burnHash,
        bindSignature,
      });
      setAttestation(att);
      setStep("attested");
      // Auto-trigger step 2 so user doesn't have to click again
      await claimWithAttestation(att);
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? String(e));
      setStep("error");
    }
  }

  // ── SECONDARY FLOW: user already burned, just wants the certificate ─────────
  async function handleAttestExisting() {
    if (!connected || !recipient) return;
    if (!burnTxInput.startsWith("0x") && chain !== "solana") {
      setError("expected 0x… tx hash");
      return;
    }
    setError(null);
    setTxHash(burnTxInput);

    try {
      const rawAmount = parseUnits(amount, decimals);
      setStep("signing");
      const msg = bindMessage({
        sourceChain: chain,
        burnTxHash: burnTxInput,
        recipient,
      });
      const bindSignature = await signMessageAsync({ message: msg });

      setStep("attesting");
      const att = await requestAttestation({
        sourceChain: chain,
        sourceToken,
        burner: connected,
        recipient,
        amount: rawAmount.toString(),
        burnTxHash: burnTxInput as `0x${string}`,
        bindSignature,
      });
      setAttestation(att);
      setStep("attested");
      // Auto-trigger step 2
      await claimWithAttestation(att);
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? String(e));
      setStep("error");
    }
  }

  async function claimWithAttestation(att: NonNullable<typeof attestation>) {
    setError(null);
    setStep("claiming");
    try {
      const targetChainId = 4663;
      if (connectedChain !== targetChainId) {
        await switchChainAsync({ chainId: targetChainId });
      }
      const empty = { issuer: "0x00", actions: [], issueAuthSig: "0x" } as const;
      const tx = await writeContractAsync({
        address: CONTRACTS.burnRegistry,
        abi: burnRegistryAbi,
        functionName: "claim",
        value: parseEther("0.0005"),
        args: [
          att.claim.recipient,
          SOURCE_CHAIN_ENUM[chain],
          att.claim.sourceToken.startsWith("0x")
            ? (att.claim.sourceToken as `0x${string}`)
            : (("0x" + att.claim.sourceToken.padStart(40, "0")) as `0x${string}`),
          BigInt(att.claim.amount),
          BigInt(att.claim.usdValueAtBurn),
          BigInt(att.claim.burnBlock),
          att.claim.burnTxHash,
          empty as any,
          att.attestation,
        ],
      });
      setStep("done");
      setTxHash(tx);
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? String(e));
      setStep("error");
    }
  }

  async function handleClaim() {
    if (!attestation) return;
    await claimWithAttestation(attestation);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 pt-12 pb-24">
      <p className="kicker mb-4">Burn a bag</p>
      <h1 className="font-serif text-5xl leading-tight tracking-tight text-bone md:text-6xl">
        Burn dead tokens on any chain.
        <br />
        <span className="text-ember">Keep a certificate on Robinhood Chain.</span>
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-bone-400">
        Burn from your wallet in one signature. Or paste a burn you did earlier and prove
        ownership with a signature — nobody else can steal a certificate for your burn.
      </p>

      {/* Mode tabs */}
      <div className="mt-12 inline-flex border border-bone-600/40">
        <ModeTab active={mode === "here"} onClick={() => setMode("here")}>
          Burn now
        </ModeTab>
        <ModeTab active={mode === "already"} onClick={() => setMode("already")}>
          I already burned
        </ModeTab>
      </div>

      {/* MAIN */}
      <section className="mt-12 grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-12">
          <Stepper n={1} title="Choose the source chain">
            <ChainPicker value={chain} onChange={setChain} />
          </Stepper>

          <Stepper n={2} title="Where the certificate goes">
            {destMode === "unset" && (
              <div className="grid gap-3 sm:grid-cols-3">
                <button className="dest-btn" onClick={doCreateEmbedded}>Create a wallet for me</button>
                {connected && (
                  <button className="dest-btn" onClick={() => setDestMode("connected")}>Use connected wallet</button>
                )}
                <button className="dest-btn" onClick={() => setDestMode("manual")}>I already have one</button>
              </div>
            )}
            {destMode === "generate" && embedded && (
              <div className="space-y-6">
                <div>
                  <p className="kicker mb-2">Your new address</p>
                  <p className="break-all font-mono text-sm text-bone">{embedded.address}</p>
                </div>
                <div className="card p-6">
                  <p className="kicker text-ember">Write these twelve words down</p>
                  <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                    {mnemonicRows(embedded.mnemonic).flat().map((w, i) => (
                      <div key={i} className="flex items-baseline gap-2">
                        <span className="font-mono text-[0.65rem] text-bone-600">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="font-mono text-sm text-bone">{w}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-xs text-bone-500">
                    These are the only way to reach your certificate. Nobody, including us, can recover them.
                    Any BIP-39 wallet (MetaMask, Rabby, Rainbow) can import them.
                  </p>
                </div>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={savedAck}
                    onChange={(e) => setSavedAck(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-ember"
                  />
                  <span className="text-sm text-bone-400">
                    I have saved them somewhere I will still have next year.
                  </span>
                </label>
                <button
                  className="font-mono text-xs uppercase tracking-widest2 text-bone-500 hover:text-bone"
                  onClick={() => { clearEmbeddedWallet(); setEmbedded(null); setDestMode("unset"); setSavedAck(false); }}
                >
                  ← Change
                </button>
              </div>
            )}
            {destMode === "connected" && connected && (
              <div>
                <p className="kicker mb-2">Connected wallet</p>
                <p className="break-all font-mono text-sm text-bone">{connected}</p>
                <button className="mt-4 font-mono text-xs uppercase tracking-widest2 text-bone-500 hover:text-bone" onClick={() => setDestMode("unset")}>
                  ← Change
                </button>
              </div>
            )}
            {destMode === "manual" && (
              <div className="space-y-3">
                <p className="kicker mb-2">Paste a Robinhood Chain address</p>
                <input
                  className="input font-mono text-xs"
                  value={manualAddr}
                  onChange={(e) => setManualAddr(e.target.value.trim())}
                  placeholder="0x…"
                />
                {manualAddr && !isAddress(manualAddr) && <p className="text-xs text-crimson">Invalid address.</p>}
                <button className="mt-2 font-mono text-xs uppercase tracking-widest2 text-bone-500 hover:text-bone" onClick={() => setDestMode("unset")}>
                  ← Change
                </button>
              </div>
            )}
            <style jsx>{`
              :global(.dest-btn) {
                border: 1px solid rgba(244, 241, 235, 0.25);
                padding: 1rem;
                text-align: center;
                font-family: theme("fontFamily.mono");
                font-size: 0.72rem;
                letter-spacing: 0.2em;
                text-transform: uppercase;
                color: #c9c4b8;
                transition: all 0.15s;
              }
              :global(.dest-btn:hover) { border-color: #d97706; color: #d97706; }
            `}</style>
          </Stepper>

          <Stepper n={3} title="Token & amount">
            <div className="space-y-8">
              <div>
                <p className="kicker mb-3">Token contract</p>
                <input
                  className="input"
                  value={sourceToken}
                  onChange={(e) => setSourceToken(e.target.value.trim())}
                  placeholder={chain === "solana" ? "So1anaMint…xyz" : "0x…"}
                />
              </div>
              <div className="grid gap-6 sm:grid-cols-[1fr_auto]">
                <div>
                  <p className="kicker mb-3">Amount (human units)</p>
                  <input
                    className="input font-mono"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="1000"
                  />
                </div>
                <div>
                  <p className="kicker mb-3">Decimals</p>
                  <input
                    className="input w-24 font-mono"
                    value={decimals}
                    onChange={(e) => setDecimals(Number(e.target.value || 18))}
                    inputMode="numeric"
                  />
                </div>
              </div>
              {mode === "already" && (
                <div>
                  <p className="kicker mb-3">Burn transaction hash</p>
                  <input
                    className="input font-mono text-xs"
                    value={burnTxInput}
                    onChange={(e) => setBurnTxInput(e.target.value.trim())}
                    placeholder="0x…"
                  />
                </div>
              )}
            </div>
          </Stepper>

          <div className="hairline" />

          {/* Action row */}
          <div className="flex flex-col gap-4 sm:flex-row">
            {mode === "here" && (
              <button
                className="btn-primary"
                disabled={
                  !connected ||
                  !recipient ||
                  (destMode === "generate" && !savedAck) ||
                  !sourceToken ||
                  !amount ||
                  step === "burning" ||
                  step === "signing" ||
                  step === "attesting"
                }
                onClick={handleBurnHere}
              >
                {step === "burning" && "Burning…"}
                {step === "signing" && "Signing…"}
                {step === "attesting" && "Verifying…"}
                {(step === "idle" || step === "error" || step === "done" || step === "attested") && "1. Burn & sign"}
              </button>
            )}
            {mode === "already" && (
              <button
                className="btn-ghost"
                disabled={
                  !connected ||
                  !recipient ||
                  (destMode === "generate" && !savedAck) ||
                  !burnTxInput ||
                  !sourceToken ||
                  !amount ||
                  step === "signing" ||
                  step === "attesting"
                }
                onClick={handleAttestExisting}
              >
                {step === "signing" && "Signing…"}
                {step === "attesting" && "Verifying…"}
                {(step === "idle" || step === "error" || step === "done" || step === "attested") && "1. Sign & verify"}
              </button>
            )}
            <button
              className="btn-primary"
              disabled={step !== "attested" || !attestation}
              onClick={handleClaim}
            >
              {step === "claiming" ? "Signing…" : "2. Issue certificate"}
            </button>
          </div>

          <p className="text-sm italic text-bone-500">
            Burning is permanent. Your signature over the recipient address is what proves this
            certificate is yours — nobody else can claim it.
          </p>

          <AnimatePresence>
            {(attestation || error || (step === "done" && txHash)) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="card p-6"
              >
                {error && (
                  <div>
                    <p className="kicker text-crimson">Error</p>
                    <p className="mt-2 font-mono text-xs text-bone">{error}</p>
                  </div>
                )}
                {attestation && !error && step === "attested" && (
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3 font-mono text-xs">
                    <p className="kicker">Burn tx</p>
                    <p className="text-right text-bone">{shortAddr(attestation.claim.burnTxHash, 6)}</p>
                    <p className="kicker">Burner</p>
                    <p className="text-right text-bone">{shortAddr(attestation.claim.burner)}</p>
                    <p className="kicker">Recipient</p>
                    <p className="text-right text-bone">{shortAddr(attestation.claim.recipient)}</p>
                    <p className="kicker">USD value at burn</p>
                    <p className="text-right text-bone">{fmtUsd(attestation.claim.usdValueAtBurn)}</p>
                  </div>
                )}
                {step === "done" && txHash && (
                  <div>
                    <p className="kicker text-ember">Certificate issued</p>
                    <p className="mt-2 break-all font-mono text-xs text-bone">tx: {txHash}</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <aside className="lg:sticky lg:top-8 h-fit">
          <CertificatePreview
            chain={chain}
            symbol={chainMeta?.ticker ?? "?"}
            amount={amount || "—"}
            recipient={recipient}
          />
        </aside>
      </section>

      {/* WARNINGS */}
      <section className="mt-32">
        <p className="kicker mb-4">Before you sign</p>
        <h2 className="font-serif text-3xl text-bone">Four things to know.</h2>
        <div className="mt-12 grid gap-px bg-bone-600/30 md:grid-cols-2">
          <Warning title="Burning is permanent" body="There is no undo, no reversal and no refund." />
          <Warning title="Only your wallet can claim" body="Your bind signature binds the certificate to the recipient. Nobody can steal a certificate for a burn you did — the signature can't be forged." />
          <Warning title="Certificates are public today" body="Robinhood Chain is transparent. Anyone can see who holds which certificates. Privacy comes when we bridge them to Zcash Shielded Assets." />
          <Warning title="Secondary market is thin" body="A certificate is worth what someone will pay. Early on, that means selling privately or holding for the dividend stream." />
        </div>
      </section>
    </div>
  );
}

// ─── Small components ────────────────────────────────────────────────────────

function ModeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-3 font-mono text-xs uppercase tracking-widest2 transition-colors ${
        active ? "bg-ember text-ink" : "text-bone-400 hover:text-bone"
      }`}
    >
      {children}
    </button>
  );
}

function Stepper({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-5 flex items-baseline gap-3 font-serif text-xl text-bone">
        <span className="font-mono text-sm text-ember-400">{String(n).padStart(2, "0")}</span>
        <span>{title}</span>
      </h3>
      {children}
      <style jsx>{`
        :global(.input) {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid rgba(244, 241, 235, 0.15);
          padding: 0.75rem 0;
          color: #f4f1eb;
          outline: none;
          font-size: 1rem;
        }
        :global(.input:focus) { border-bottom-color: #d97706; }
      `}</style>
    </div>
  );
}

function CertificatePreview({
  chain, symbol, amount, recipient,
}: { chain: BurnChainId; symbol: string; amount: string; recipient?: `0x${string}`; }) {
  const c = SUPPORTED_BURN_CHAINS.find((x) => x.id === chain);
  return (
    <div className="card relative overflow-hidden p-8">
      <div className="pointer-events-none absolute inset-3 border border-dashed border-bone-600/30" />
      <div className="pointer-events-none absolute left-3 top-3 h-4 w-4 border-l border-t border-ember/60" />
      <div className="pointer-events-none absolute right-3 top-3 h-4 w-4 border-r border-t border-ember/60" />
      <div className="pointer-events-none absolute left-3 bottom-3 h-4 w-4 border-l border-b border-ember/60" />
      <div className="pointer-events-none absolute right-3 bottom-3 h-4 w-4 border-r border-b border-ember/60" />
      <p className="kicker text-ember-400">SIGIL · Pending</p>
      <h2 className="mt-2 font-serif text-2xl italic text-bone">Certificate of Destruction</h2>
      <p className="mt-1 font-mono text-xs uppercase tracking-widest2 text-bone-600">No. — (assigned on issue)</p>
      <p className="mt-6 text-sm leading-relaxed text-bone-400">
        The quantity below was irreversibly destroyed on <span className="text-bone">{c?.name}</span>.
        This certificate records it on Robinhood Chain and cannot be reissued.
      </p>
      <div className="mt-8">
        <p className="kicker mb-2">Quantity destroyed</p>
        <p className="font-serif text-4xl text-bone">{amount}</p>
        <p className="mt-1 font-mono text-xs uppercase tracking-widest2 text-bone-500">{symbol}</p>
      </div>
      <div className="mt-6">
        <p className="kicker mb-2">Delivered to</p>
        <p className="break-all font-mono text-xs text-bone-400">{recipient ?? "— pick a destination —"}</p>
      </div>
      <div className="mt-8 border-t border-dashed border-bone-600/30 pt-4">
        <p className="font-mono text-[0.65rem] uppercase tracking-widest2 text-bone-600">Counterfoil</p>
        <p className="mt-2 font-serif text-xs italic text-bone-500">
          "The tokens stop existing; the certificate is the only thing left."
        </p>
      </div>
    </div>
  );
}

function Warning({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-ink px-8 py-8">
      <h4 className="font-serif text-lg text-bone">{title}</h4>
      <p className="mt-3 text-sm text-bone-400">{body}</p>
    </div>
  );
}
