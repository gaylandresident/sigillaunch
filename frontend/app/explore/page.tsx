"use client";

import Link from "next/link";
import { useReadContract, useReadContracts } from "wagmi";
import { motion } from "framer-motion";
import { formatEther } from "viem";
import { CONTRACTS, launchpadAbi } from "@/lib/contracts";

// Previous launchpad deploys — still queried so old tokens remain discoverable
const LEGACY_LAUNCHPADS: `0x${string}`[] = [
  "0xb82d1356e77e301041add2ef53bbcaf428b5be53", // v2 (no atomic dev-buy)
  "0x86c16a2b955be9c779f2691482d3a9af52089a73", // v1 (dev-buy went to router)
];

export default function ExplorePage() {
  // Read current + all legacy launchpads and merge
  const { data: countNew } = useReadContract({
    address: CONTRACTS.launchpad,
    abi: launchpadAbi,
    functionName: "launchCount",
  });
  const { data: countL0 } = useReadContract({
    address: LEGACY_LAUNCHPADS[0],
    abi: launchpadAbi,
    functionName: "launchCount",
  });
  const { data: countL1 } = useReadContract({
    address: LEGACY_LAUNCHPADS[1],
    abi: launchpadAbi,
    functionName: "launchCount",
  });

  const totalNew = Number(countNew ?? 0n);
  const totalL0 = Number(countL0 ?? 0n);
  const totalL1 = Number(countL1 ?? 0n);
  const total = totalNew + totalL0 + totalL1;

  const { data: idsNew } = useReadContract({
    address: CONTRACTS.launchpad,
    abi: launchpadAbi,
    functionName: "paginatedLaunches",
    args: [0n, 60n],
    query: { enabled: totalNew > 0 },
  });
  const { data: idsL0 } = useReadContract({
    address: LEGACY_LAUNCHPADS[0],
    abi: launchpadAbi,
    functionName: "paginatedLaunches",
    args: [0n, 60n],
    query: { enabled: totalL0 > 0 },
  });
  const { data: idsL1 } = useReadContract({
    address: LEGACY_LAUNCHPADS[1],
    abi: launchpadAbi,
    functionName: "paginatedLaunches",
    args: [0n, 60n],
    query: { enabled: totalL1 > 0 },
  });

  const merged: { id: `0x${string}`; pad: `0x${string}` }[] = [
    ...(((idsNew as `0x${string}`[] | undefined) ?? []).map((id) => ({ id, pad: CONTRACTS.launchpad }))),
    ...(((idsL0 as `0x${string}`[] | undefined) ?? []).map((id) => ({ id, pad: LEGACY_LAUNCHPADS[0] }))),
    ...(((idsL1 as `0x${string}`[] | undefined) ?? []).map((id) => ({ id, pad: LEGACY_LAUNCHPADS[1] }))),
  ];
  const launchIds = merged.map((m) => m.id);

  const { data: launchData } = useReadContracts({
    contracts: merged.map((m) => ({
      address: m.pad,
      abi: launchpadAbi,
      functionName: "launches" as const,
      args: [m.id] as const,
    })),
    query: { enabled: merged.length > 0 },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 pt-16 pb-24">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="kicker mb-4">The pyre floor</p>
          <h1 className="font-serif text-5xl tracking-tight text-bone md:text-6xl">
            Explore.
          </h1>
        </div>
        <Link href="/launch" className="btn-primary hidden md:inline-flex">
          Launch a token ↗
        </Link>
      </div>
      <p className="mt-6 max-w-xl text-lg text-bone-400">
        Every token on SIGIL trades against ETH on a permanent bonding curve. Every trade
        feeds the flywheel.
      </p>

      <div className="mt-16">
        {total === 0 && (
          <div className="card p-12 text-center">
            <p className="font-serif text-2xl italic text-bone-500">
              No launches yet. Be the first.
            </p>
            <Link href="/launch" className="btn-primary mt-8 inline-flex">
              Cast your sigil ↗
            </Link>
          </div>
        )}

        {total > 0 && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {launchIds.map((id, i) => {
              const raw = launchData?.[i]?.result as
                | readonly [
                    `0x${string}`,
                    `0x${string}`,
                    bigint,
                    bigint,
                    bigint,
                    bigint,
                    string
                  ]
                | undefined;
              if (!raw) return null;
              const [token, creator, tokenReserve, wethReserve, , createdAt, metadataURI] = raw;

              let meta = { name: "?", symbol: "?", description: "", image: "" };
              try {
                if (metadataURI.startsWith("data:application/json;base64,")) {
                  meta = JSON.parse(atob(metadataURI.split(",")[1]));
                }
              } catch {}

              const priceWei = tokenReserve > 0n ? (wethReserve * 10n ** 18n) / tokenReserve : 0n;
              const marketCapEth =
                tokenReserve > 0n
                  ? (wethReserve * 1_000_000_000n * 10n ** 18n) / tokenReserve / 10n ** 18n
                  : 0n;

              return (
                <motion.div
                  key={id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="card card-hover p-6"
                >
                  <div className="flex items-start gap-4">
                    {meta.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={meta.image}
                        alt={meta.name}
                        className="h-14 w-14 flex-none border border-bone-600/40 object-cover"
                      />
                    ) : (
                      <div className="h-14 w-14 flex-none border border-bone-600/40 bg-ink-700" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-xl truncate text-bone">{meta.name}</p>
                      <p className="kicker mt-1">${meta.symbol || "?"}</p>
                    </div>
                  </div>

                  {meta.description && (
                    <p className="mt-4 line-clamp-2 text-sm text-bone-400">
                      {meta.description}
                    </p>
                  )}

                  <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[0.7rem]">
                    <span className="kicker">Price</span>
                    <span className="text-right text-bone">
                      {formatEther(priceWei).slice(0, 10)} ETH
                    </span>
                    <span className="kicker">Cap</span>
                    <span className="text-right text-bone">
                      {Number(marketCapEth).toLocaleString()} ETH
                    </span>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Link
                      href={`/t/${token}`}
                      className="flex-1 border border-bone-600/40 py-2 text-center font-mono text-xs uppercase tracking-widest2 text-bone-400 transition-colors hover:border-ember hover:text-ember"
                    >
                      Trade
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
