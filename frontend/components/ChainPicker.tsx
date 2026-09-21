"use client";

import { SUPPORTED_BURN_CHAINS, type BurnChainId } from "@/lib/chains";

export function ChainPicker({
  value,
  onChange,
}: {
  value: BurnChainId;
  onChange: (id: BurnChainId) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-px bg-bone-600/30">
      {SUPPORTED_BURN_CHAINS.map((c) => {
        const active = value === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            className={`group bg-ink-800 px-4 py-6 text-center transition-colors ${
              active ? "bg-ink-600" : "hover:bg-ink-700"
            }`}
          >
            <div
              className="mx-auto mb-3 h-6 w-6 rounded-full transition-transform group-hover:scale-110"
              style={{ background: c.tint, boxShadow: active ? `0 0 24px ${c.tint}80` : "none" }}
            />
            <p
              className={`font-mono text-xs uppercase tracking-widest2 ${
                active ? "text-bone" : "text-bone-500"
              }`}
            >
              {c.ticker}
            </p>
          </button>
        );
      })}
    </div>
  );
}
