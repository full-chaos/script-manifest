import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import "./globals.css";
import { Providers } from "./components/providers";
import { SiteHeader } from "./components/siteHeader";

const displayFont = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"]
});

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"]
});

export const metadata: Metadata = {
  title: "Script Manifest | Writer Hub",
  description: "A writer-first platform for profiles, scripts, competitions, and submissions.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/pwa/writer-hub-192.svg", type: "image/svg+xml" }],
    apple: [{ url: "/pwa/writer-hub-192.svg", type: "image/svg+xml" }]
  }
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  colorScheme: "light"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable} font-body`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold"
        >
          Skip to content
        </a>
        <Providers>
          <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
            <SiteHeader />
            <main id="main-content" className="pb-10">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
