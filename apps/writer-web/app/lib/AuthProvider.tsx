"use client";

import type { AuthSessionResponse, AuthUser } from "@script-manifest/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export const AUTH_CHANGED_EVENT = "auth-changed";
export const SESSION_CHANGED_EVENT = "script_manifest_session_changed";

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

  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const setUserWithCompatEvent = useCallback((nextUser: AuthUser | null) => {
    setUser((currentUser: AuthUser | null) => {
      if (sameUser(currentUser, nextUser)) {
        return currentUser;
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT));
      }

      return nextUser;
    });
  }, []);

  const loadAuth = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/v1/auth/me", {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        if (!mountedRef.current) {
          return;
        }

        setUserWithCompatEvent(null);
        return;
      }

      const payload = (await response.json()) as Pick<AuthSessionResponse, "user" | "expiresAt">;

      if (!mountedRef.current) {
        return;
      }

      setUserWithCompatEvent(payload.user);
    } catch {
      if (!mountedRef.current) {
        return;
      }

      setUserWithCompatEvent(null);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [setUserWithCompatEvent]);

  useEffect(() => {
    mountedRef.current = true;
    void loadAuth();

    const handleAuthChanged = () => {
      void loadAuth();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadAuth();
      }
    };

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
    window.addEventListener("focus", handleAuthChanged);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mountedRef.current = false;
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
      window.removeEventListener("focus", handleAuthChanged);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadAuth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
    }),
    [loading, user],
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
