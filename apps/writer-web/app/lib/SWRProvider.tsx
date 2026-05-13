"use client";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { fetcher, ApiError } from "./fetcher";
import { refreshAuth } from "./AuthProvider";

export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        keepPreviousData: true,
        shouldRetryOnError: (err: Error) =>
          err instanceof ApiError ? err.status >= 500 : true,
        onError: (err: Error) => {
          if (err instanceof ApiError && err.status === 401) {
            refreshAuth();
          }
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
