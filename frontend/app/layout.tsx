import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SIGIL — Feed the pyre. Own the ashes.",
  description:
    "Burn dead coins on any chain. Mint a certificate on Robinhood Chain that pays weth dividends today and upgrades to a Zcash Shielded Asset tomorrow.",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
  openGraph: {
    title: "SIGIL",
    description: "Feed the pyre. Own the ashes.",
    images: ["/header.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SIGIL",
    description: "Feed the pyre. Own the ashes.",
    images: ["/header.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Nav />
          <main className="relative z-10">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
