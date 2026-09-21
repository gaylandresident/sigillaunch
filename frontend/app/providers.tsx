"use client";

import { RainbowKitProvider, getDefaultConfig, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { robinhoodChain } from "@/lib/chains";
import type { ReactNode } from "react";

const config = getDefaultConfig({
  appName: "SIGIL",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "sigil-dev",
  chains: [robinhoodChain],
  ssr: true,
});

const qc = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={qc}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#d97706",
            accentColorForeground: "#0a0908",
            borderRadius: "none",
            fontStack: "system",
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
