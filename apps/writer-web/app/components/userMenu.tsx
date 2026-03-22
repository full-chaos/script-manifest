"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, Settings, ShieldCheck, User } from "lucide-react";
import { refreshAuth, useAuth } from "../lib/AuthProvider";

export function UserMenu() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (!user) {
    return (
      <Link href="/signin" className="btn btn-primary no-underline">
        Sign in
      </Link>
    );
  }

  async function signOut() {
    setOpen(false);
    try {
      await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      refreshAuth();
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full border border-border/60 bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-background-secondary"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {user.displayName}
        <ChevronDown className="h-4 w-4 text-foreground-secondary" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-border/60 bg-surface shadow-lg z-50">
          <div className="border-b border-border/60 px-4 py-3">
            <p className="text-sm font-semibold text-foreground truncate">
              {user.displayName}
            </p>
            <p className="text-xs text-foreground-secondary truncate">
              {user.email}
            </p>
          </div>

          <div className="py-1">
            <Link
              href="/profile"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-background-secondary"
              onClick={() => setOpen(false)}
            >
              <User className="h-4 w-4 text-foreground-secondary" />
              Profile
            </Link>
            <Link
              href="/settings/account"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-background-secondary"
              onClick={() => setOpen(false)}
            >
              <Settings className="h-4 w-4 text-foreground-secondary" />
              Settings
            </Link>
            {user.role === "admin" && (
              <Link
                href="/admin"
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-background-secondary"
                onClick={() => setOpen(false)}
              >
                <ShieldCheck className="h-4 w-4 text-foreground-secondary" />
                Admin
              </Link>
            )}
          </div>

          <div className="border-t border-border/60 py-1">
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:bg-background-secondary"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
