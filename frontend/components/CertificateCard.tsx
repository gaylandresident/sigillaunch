"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { CertificateSummary } from "@/lib/api";
import { SUPPORTED_BURN_CHAINS } from "@/lib/chains";
import { fmtUsd, fmtDate, rarityLabel, rarityColor } from "@/lib/format";

export function CertificateCard({ cert }: { cert: CertificateSummary }) {
  const chain = SUPPORTED_BURN_CHAINS.find((c) => c.id === cert.sourceChain);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="card card-hover group aspect-[3/4] p-6 flex flex-col justify-between"
    >
      {/* Stamp corner marks */}
      <div className="pointer-events-none absolute inset-3 border border-dashed border-bone-600/30" />

      <div>
        <p className="kicker">SIGIL · No. {cert.tokenId.padStart(4, "0")}</p>
        <p className={`mt-1 font-serif text-lg italic ${rarityColor(cert.rarity)}`}>
          {rarityLabel(cert.rarity)}
        </p>
      </div>

      {/* Center medallion */}
      <div className="flex flex-col items-center justify-center">
        <div
          className="mb-4 h-16 w-16 rounded-full"
          style={{
            background: `radial-gradient(circle at 30% 30%, ${chain?.tint ?? "#666"}, ${chain?.tint}30)`,
            boxShadow: `0 0 60px ${chain?.tint ?? "#666"}30`,
          }}
        />
        <p className="font-mono text-xs uppercase tracking-widest2 text-bone-500">
          {chain?.name ?? "Unknown"}
        </p>
        <p className="mt-2 font-serif text-3xl text-bone">
          {fmtUsd(cert.usdValueAtBurn)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[0.65rem] uppercase tracking-widest2 text-bone-600">
        <span>Burned</span>
        <span className="text-right text-bone-400">{fmtDate(cert.burnedAt)}</span>
        <span>Zcash</span>
        <span className="text-right">
          {cert.zcashStatus === "confirmed" ? (
            <span className="text-ember">Inscribed</span>
          ) : cert.zcashStatus === "failed" ? (
            <span className="text-crimson">Failed</span>
          ) : (
            <span className="text-bone-500 animate-slow-pulse">Pending</span>
          )}
        </span>
      </div>
    </motion.div>
  );
}
