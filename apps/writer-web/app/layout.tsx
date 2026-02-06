import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Script Manifest | Writer Hub",
  description: "Phase 1 MVP shell for writer profiles, projects, and competition tracking."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>
          <header>
            <h1>Script Manifest</h1>
            <p>Phase 1 MVP Writer Hub</p>
            <nav aria-label="Primary">
              <ul>
                <li>
                  <Link href="/profile">Profile</Link>
                </li>
                <li>
                  <Link href="/projects">Projects</Link>
                </li>
                <li>
                  <Link href="/competitions">Competitions</Link>
                </li>
                <li>
                  <Link href="/signin">Sign In</Link>
                </li>
              </ul>
            </nav>
          </header>
          {children}
        </main>
      </body>
    </html>
  );
}
