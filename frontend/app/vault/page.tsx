"use client";

import { useAccount, useWriteContract } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { fetchCertificates } from "@/lib/api";
import { CONTRACTS, vaultAbi, certificateAbi } from "@/lib/contracts";
import { SUPPORTED_BURN_CHAINS } from "@/lib/chains";
import { fmtUsd, rarityLabel, rarityColor } from "@/lib/format";

const RARITY_APR_HINTS = ["1x", "3x", "10x", "30x"];

export default function VaultPage() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { data: certs } = useQuery({
    queryKey: ["certs", address],
    queryFn: () => fetchCertificates(address!),
    enabled: !!address,
  });

  async function stake(tokenId: string) {
    await writeContractAsync({
      address: CONTRACTS.certificate,
      abi: certificateAbi,
      functionName: "approve",
      args: [CONTRACTS.vault, BigInt(tokenId)],
    });
    await writeContractAsync({
      address: CONTRACTS.vault,
      abi: vaultAbi,
      functionName: "stake",
      args: [BigInt(tokenId)],
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-6 pt-16 pb-24">
      <p className="kicker mb-4">The reliquary</p>
      <h1 className="font-serif text-5xl tracking-tight text-bone md:text-6xl">
        Vault.
      </h1>
      <p className="mt-6 max-w-xl text-lg text-bone-400">
        Stake your certificates. Earn a share of weth dividends from every trade
        on the SIGIL launchpad — weighted by rarity.
      </p>

      {/* Stat grid */}
      <div className="mt-16 grid grid-cols-2 gap-px bg-bone-600/30 md:grid-cols-4">
        <VaultStat kicker="Total staked" value="—" />
        <VaultStat kicker="Weekly weth" value="—" />
        <VaultStat kicker="Est. APR" value="—" />
        <VaultStat kicker="Legendary bonus" value="30×" />
      </div>

      {/* Your certificates */}
      <div className="mt-24">
        <p className="kicker mb-6">Your certificates</p>
        {!address && <p className="font-serif italic text-bone-500">Connect a wallet.</p>}
        {address && certs && certs.length === 0 && (
          <p className="font-serif italic text-bone-500">Nothing to stake yet.</p>
        )}
        {address && certs && certs.length > 0 && (
          <div className="hairline mb-8" />
        )}
        <ul className="divide-y divide-bone-600/20">
          {certs?.map((c) => {
            const chain = SUPPORTED_BURN_CHAINS.find((x) => x.id === c.sourceChain);
            return (
              <motion.li
                key={c.tokenId}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center justify-between py-6"
              >
                <div className="flex items-center gap-6">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ background: chain?.tint }}
                  />
                  <div>
                    <p className="font-mono text-xs uppercase tracking-widest2 text-bone-500">
                      No. {c.tokenId.padStart(4, "0")}
                    </p>
                    <p className={`font-serif italic ${rarityColor(c.rarity)}`}>
                      {rarityLabel(c.rarity)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <p className="kicker">Burn value</p>
                    <p className="font-mono text-lg text-bone">{fmtUsd(c.usdValueAtBurn)}</p>
                  </div>
                  <div className="text-right">
                    <p className="kicker">Multiplier</p>
                    <p className="font-mono text-lg text-ember">{RARITY_APR_HINTS[c.rarity]}</p>
                  </div>
                  <button className="btn-ghost" onClick={() => stake(c.tokenId)}>
                    Stake
                  </button>
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function VaultStat({ kicker, value }: { kicker: string; value: string }) {
  return (
    <div className="bg-ink px-6 py-10">
      <p className="kicker mb-3">{kicker}</p>
      <p className="font-mono text-3xl text-bone">{value}</p>
    </div>
  );
}
