"use client";

import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { fetchCertificates } from "@/lib/api";
import { CertificateCard } from "@/components/CertificateCard";

export default function CertificatesPage() {
  const { address } = useAccount();
  const { data, isLoading } = useQuery({
    queryKey: ["certs", address],
    queryFn: () => fetchCertificates(address!),
    enabled: !!address,
  });

  return (
    <div className="mx-auto max-w-6xl px-6 pt-16 pb-24">
      <p className="kicker mb-4">Your holdings</p>
      <h1 className="font-serif text-5xl tracking-tight text-bone md:text-6xl">
        Certificates.
      </h1>
      <p className="mt-6 max-w-xl text-lg text-bone-400">
        Each one records a burn — permanently, on Robinhood Chain and on Zcash.
        Stake them in the vault to earn weth dividends.
      </p>

      <div className="mt-16">
        {!address && (
          <p className="font-serif text-2xl italic text-bone-500">
            Connect a wallet to see your certificates.
          </p>
        )}
        {address && isLoading && (
          <p className="font-mono text-sm text-bone-500 animate-slow-pulse">
            Loading…
          </p>
        )}
        {address && data && data.length === 0 && (
          <div className="card p-12 text-center">
            <p className="font-serif text-2xl italic text-bone-500">
              No certificates yet.
            </p>
            <Link href="/burn" className="btn-primary mt-8">
              Burn your first bag ↗
            </Link>
          </div>
        )}
        {address && data && data.length > 0 && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((c) => (
              <CertificateCard key={c.tokenId} cert={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
