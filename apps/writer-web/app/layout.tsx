import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import "./globals.css";
import { Providers } from "./components/providers";
import { SiteHeader } from "./components/siteHeader";
import { BugReportWidget } from "./components/bugReportWidget";
import { WebVitals } from "./components/WebVitals";

const displayFont = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display-face",
  weight: ["500", "600", "700"]
});

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body-face",
  weight: ["400", "500", "600", "700"]
});

const siteTitle = "Script Manifest | Writer Hub";
const siteDescription =
  "A writer-first platform for profiles, scripts, competitions, and submissions.";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://scriptmanifest.com"
  ),
  title: {
    default: siteTitle,
    template: "%s | Script Manifest"
  },
  description: siteDescription,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon.ico", type: "image/x-icon" }],
    apple: [{ url: "/favicon.ico", type: "image/x-icon" }]
  },
  openGraph: {
    type: "website",
    siteName: "Script Manifest",
    title: siteTitle,
    description: siteDescription,
    locale: "en_US",
    images: [
      {
        url: "/script-manifest.png",
        width: 1140,
        height: 911,
        alt: "Script Manifest logo"
      }
    ]
  },
  twitter: {
    card: "summary",
    title: siteTitle,
    description: siteDescription,
    images: ["/script-manifest.png"]
  },
  robots: {
    index: true,
    follow: true
  },
  alternates: {
    canonical: "/"
  }
};

export const viewport: Viewport = {
  themeColor: "#0f172a"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${displayFont.variable} ${bodyFont.variable} font-body`}>
        <WebVitals />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-semibold"
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
          <BugReportWidget />
        </Providers>
      </body>
    </html>
  );
}
