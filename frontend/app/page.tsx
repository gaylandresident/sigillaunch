"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function Landing() {
  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* ─── HERO ─── */}
      <section className="pt-24 pb-32">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="kicker mb-8"
        >
          A launchpad · An inscription · A rite
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.1 }}
          className="font-serif text-5xl leading-[1.05] tracking-tight text-bone md:text-7xl lg:text-8xl"
        >
          Feed the pyre.
          <br />
          <span className="text-ember">Own the ashes.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.25 }}
          className="mt-10 max-w-2xl font-sans text-lg text-bone-400 md:text-xl"
        >
          Burn any dead coin on any chain. Receive a certificate that pays{" "}
          <span className="text-bone">weth dividends</span> today, and will upgrade
          to a <span className="text-bone">Zcash Shielded Asset</span> the moment
          ZIP-227 activates.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.4 }}
          className="mt-12 flex flex-wrap items-center gap-4"
        >
          <Link href="/launch" className="btn-primary">
            Launch a token ↗
          </Link>
          <Link href="/explore" className="btn-ghost">
            Explore the pyre
          </Link>
        </motion.div>

        {/* subtle stat strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.7 }}
          className="mt-24 grid grid-cols-2 gap-8 border-t border-bone-600/30 pt-8 md:grid-cols-4"
        >
          <Stat kicker="Total burned" value="$—" />
          <Stat kicker="Certificates" value="—" />
          <Stat kicker="Vault APR" value="—" />
          <Stat kicker="Chains" value="5" />
        </motion.div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section className="border-t border-bone-600/30 pt-24">
        <p className="kicker mb-4">The rite</p>
        <h2 className="font-serif text-4xl tracking-tight text-bone md:text-5xl">
          Three motions. One certificate.
        </h2>

        <div className="mt-16 grid gap-16 md:grid-cols-3">
          <Step
            n="01"
            title="Burn"
            body="Send any token on Solana, Ethereum, Base, BSC, or Arbitrum to the canonical dead address. Real burn, no custody."
          />
          <Step
            n="02"
            title="Inscribe"
            body="A permanent inscription is written to Zcash mainnet — ZIP-227 aligned, ready to migrate 1:1 when ZSA activates."
          />
          <Step
            n="03"
            title="Earn"
            body="An ERC-721 certificate arrives on Robinhood Chain. Stake it to collect a share of weth dividends from every trade on SIGIL."
          />
        </div>
      </section>

      {/* ─── THE ENGINE ─── */}
      <section className="border-t border-bone-600/30 pt-24 mt-24">
        <p className="kicker mb-4">The engine</p>
        <h2 className="font-serif text-4xl tracking-tight text-bone md:text-5xl">
          A flywheel that eats itself.
        </h2>
        <p className="mt-6 max-w-2xl text-lg text-bone-400">
          100% of platform fees flow to the Dividend Router — a smart contract, not a wallet.
          Every 10 minutes it turns fees into <em className="text-bone italic">perpetual</em> buybacks and dividends.
        </p>

        <div className="mt-16 grid gap-px bg-bone-600/30 md:grid-cols-2">
          <EngineHalf
            pct="50%"
            label="Buyback → Protocol NFT"
            body="Router market-buys $SIGIL from the Pons pool, burns it via BurnRegistry, mints a permanent protocol-owned certificate and auto-stakes it. Supply falls, protocol stake grows."
            accent="ember"
          />
          <EngineHalf
            pct="50%"
            label="weth dividend"
            body="Deposited into the Reward Vault. All stakers — including the protocol's own certificates — earn pro-rata. Protocol's share compounds back into the next flush."
            accent="bone"
          />
        </div>

        <div className="mt-16 card p-8">
          <p className="kicker mb-4">The loop</p>
          <pre className="overflow-x-auto font-mono text-[0.72rem] leading-relaxed text-bone-400">
{`  Pons trade → fee (weth) → DividendRouter
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
       50% market-buy $SIGIL           50% → RewardVault
       burn → protocol NFT            (dividend to stakers)
       auto-stake in vault                    ▲
                    │                         │
                    └─── dividend earned ─────┘
                         flows back to Router
                         → amplifies next flush`}
          </pre>
        </div>

        <p className="mt-8 font-mono text-xs uppercase tracking-widest2 text-bone-600">
          Router · Vault · BurnRegistry · Certificate · Distributor · Zcash relayer — all open-source, all on-chain.
        </p>
      </section>
    </div>
  );
}

function EngineHalf({
  pct,
  label,
  body,
  accent,
}: {
  pct: string;
  label: string;
  body: string;
  accent: "ember" | "bone";
}) {
  return (
    <div className="bg-ink px-8 py-12">
      <p className={`font-serif text-6xl ${accent === "ember" ? "text-ember" : "text-bone"}`}>{pct}</p>
      <p className="kicker mt-4">{label}</p>
      <p className="mt-4 text-bone-400">{body}</p>
    </div>
  );
}

function Stat({ kicker, value }: { kicker: string; value: string }) {
  return (
    <div>
      <p className="kicker mb-2">{kicker}</p>
      <p className="font-mono text-2xl text-bone">{value}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <p className="font-serif text-6xl text-ember/70">{n}</p>
      <h3 className="mt-6 font-serif text-2xl text-bone">{title}</h3>
      <p className="mt-3 text-bone-400">{body}</p>
    </div>
  );
}

