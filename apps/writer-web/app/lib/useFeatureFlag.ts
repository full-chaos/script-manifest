"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";

type FeatureFlagsResponse = { flags?: Record<string, boolean> };

export function useFeatureFlag(key: string): boolean {
  const { data } = useSWR<FeatureFlagsResponse>("/api/v1/feature-flags", fetcher, {
    shouldRetryOnError: false,
  });
  return data?.flags?.[key] ?? false;
}
