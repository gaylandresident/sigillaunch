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
    <div className="grid grid-cols-3 gap-px bg-bone-600/30 sm:grid-cols-6">
      {SUPPORTED_BURN_CHAINS.map((c) => {
        const active = value === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            className={`group flex flex-col items-center justify-center bg-ink-800 px-4 py-6 text-center transition-colors ${
              active ? "bg-ink-600" : "hover:bg-ink-700"
            }`}
            title={c.name}
          >
            <div
              className="mb-3 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full transition-transform group-hover:scale-110"
              style={{
                boxShadow: active ? `0 0 24px ${c.tint}80` : "none",
                background: c.logo ? "transparent" : c.tint,
              }}
            >
              {c.id === "robinhood" ? (
                <RobinhoodMark />
              ) : c.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.logo}
                  alt={c.name}
                  className="h-8 w-8 object-contain"
                  loading="lazy"
                />
              ) : null}
            </div>
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

/** Robinhood mark — no TrustWallet entry, so we hand-draw the arrow-feather glyph. */
function RobinhoodMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#00c805" />
      <path
        d="M9 22 L14 10 L18 18 L23 12"
        stroke="#000"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
