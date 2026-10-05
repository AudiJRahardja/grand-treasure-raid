import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Pirata_One } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const body = Geist({ variable: "--font-body", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono-face", subsets: ["latin"] });
const pirate = Pirata_One({ variable: "--font-pirate", weight: "400", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "The Grand Treasure Raid", template: "%s · Grand Treasure Raid" },
  description: "Solve the checkpoints, race the clock, claim the treasure.",
};

export const viewport: Viewport = {
  themeColor: "#0b1820",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${mono.variable} ${pirate.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 btn btn-primary">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
          {children}
        </main>
        <footer className="px-4 py-6 text-center text-xs text-muted">
          The Grand Treasure Raid · All times in WIB (Asia/Jakarta)
        </footer>
      </body>
    </html>
  );
}
