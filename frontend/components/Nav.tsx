"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const links = [
  { href: "/launch", label: "Launch" },
  { href: "/explore", label: "Explore" },
  { href: "/burn", label: "Burn" },
  { href: "/vault", label: "Vault" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-8">
      <Link href="/" className="group flex items-baseline gap-3">
        <span className="font-serif text-2xl tracking-widest2 text-bone">SIGIL</span>
        <span className="kicker hidden sm:inline">on Robinhood Chain</span>
      </Link>
      <nav className="hidden items-center gap-8 md:flex">
        {links.map((l) => {
          const active = path === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`font-mono text-xs uppercase tracking-widest2 transition-colors ${
                active ? "text-ember" : "text-bone-500 hover:text-bone"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="scale-90 origin-right">
        <ConnectButton
          accountStatus="address"
          chainStatus="none"
          showBalance={false}
        />
      </div>
    </header>
  );
}
