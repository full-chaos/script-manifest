"use client";

import type { AuthSessionResponse, AuthUser } from "@script-manifest/contracts";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import useSWR, { mutate } from "swr";

export const AUTH_CHANGED_EVENT = "auth-changed";
export const SESSION_CHANGED_EVENT = "script_manifest_session_changed";

export const AUTH_SESSION_KEY = "/api/v1/auth/me";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function sameUser(left: AuthUser | null, right: AuthUser | null): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.id === right.id &&
    left.email === right.email &&
    left.displayName === right.displayName &&
    left.role === right.role &&
    left.emailVerified === right.emailVerified
  );
}

export function refreshAuth(): void {
  if (typeof window === "undefined") {
    return;
  }

  void mutate(AUTH_SESSION_KEY);
}

// Returns null on 401/error so the global SWR 401 handler (in SWRProvider)
// never loops back into refreshAuth() through the auth session itself.
async function fetchSession(): Promise<AuthUser | null> {
  try {
    const response = await fetch(AUTH_SESSION_KEY, {
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as Pick<
      AuthSessionResponse,
      "user" | "expiresAt"
    >;
    return payload.user;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useSWR<AuthUser | null>(
    AUTH_SESSION_KEY,
    fetchSession,
    {
      shouldRetryOnError: false,
      keepPreviousData: true,
    },
  );

  const user = data ?? null;
  const previousUserRef = useRef<AuthUser | null>(null);

  // Dispatch the legacy SESSION_CHANGED_EVENT when user identity actually
  // changes. This keeps external listeners (analytics, integrations) working.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const previous = previousUserRef.current;
    if (!sameUser(previous, user)) {
      previousUserRef.current = user;
      window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT));
    }
  }, [user]);

  // Wire the legacy AUTH_CHANGED_EVENT into the SWR cache. Other code paths
  // (e.g. cross-component imperatives) may dispatch this event directly; we
  // translate it into a cache revalidation.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleAuthChanged = () => {
      void mutate(AUTH_SESSION_KEY);
    };

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading: isLoading,
    }),
    [isLoading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }

  return context;
}
