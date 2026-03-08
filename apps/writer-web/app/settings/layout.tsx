"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const settingsNav = [
  { href: "/settings/account" as Route, label: "Account" },
  { href: "/settings/security" as Route, label: "Security" }
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <nav className="mb-6 flex gap-4 border-b border-border/50 pb-3">
        {settingsNav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm font-medium pb-2 -mb-[13px] border-b-2 transition-colors ${
                active
                  ? "border-ember-500 text-foreground"
                  : "border-transparent text-foreground-secondary hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
