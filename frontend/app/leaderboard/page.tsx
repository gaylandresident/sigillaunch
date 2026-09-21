"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { fetchLeaderboard } from "@/lib/api";
import { fmtUsd, shortAddr } from "@/lib/format";

export default function LeaderboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: fetchLeaderboard,
    refetchInterval: 30_000,
  });

  return (
    <div className="mx-auto max-w-4xl px-6 pt-16 pb-24">
      <p className="kicker mb-4">Hall of ashes</p>
      <h1 className="font-serif text-5xl tracking-tight text-bone md:text-6xl">
        Leaderboard.
      </h1>
      <p className="mt-6 max-w-xl text-lg text-bone-400">
        Every legendary certificate is a monument. Who has burned the most?
      </p>

      <div className="mt-16">
        {isLoading && (
          <p className="font-mono text-sm text-bone-500 animate-slow-pulse">
            Loading…
          </p>
        )}
        {data && data.length === 0 && (
          <p className="font-serif italic text-bone-500">
            Nobody has burned anything yet. Be the first.
          </p>
        )}
        {data && data.length > 0 && (
          <div>
            <div className="hairline mb-4" />
            <div className="grid grid-cols-12 gap-4 pb-4">
              <p className="kicker col-span-1">#</p>
              <p className="kicker col-span-5">Burner</p>
              <p className="kicker col-span-2 text-right">Legendary</p>
              <p className="kicker col-span-2 text-right">Burns</p>
              <p className="kicker col-span-2 text-right">USD</p>
            </div>
            <div className="hairline mb-6" />
            <ul className="space-y-0">
              {data.map((row) => (
                <motion.li
                  key={row.address}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                  className="grid grid-cols-12 items-center gap-4 border-b border-bone-600/20 py-5"
                >
                  <p className={`col-span-1 font-serif text-xl ${row.rank <= 3 ? "text-ember" : "text-bone-500"}`}>
                    {row.rank.toString().padStart(2, "0")}
                  </p>
                  <p className="col-span-5 font-mono text-sm text-bone">
                    {shortAddr(row.address, 6)}
                  </p>
                  <p className="col-span-2 text-right font-mono text-sm text-ember-400">
                    {row.legendaryCount || "—"}
                  </p>
                  <p className="col-span-2 text-right font-mono text-sm text-bone-400">
                    {row.totalBurns}
                  </p>
                  <p className="col-span-2 text-right font-mono text-sm text-bone">
                    {fmtUsd(row.totalUsdBurned)}
                  </p>
                </motion.li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
