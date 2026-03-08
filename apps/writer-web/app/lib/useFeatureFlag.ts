"use client";
import { useEffect, useState } from "react";
import { getAuthHeaders } from "./authSession";

export function useFeatureFlag(key: string): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    fetch("/api/v1/feature-flags", { headers: getAuthHeaders() })
      .then(r => r.json())
      .then((data: { flags?: Record<string, boolean> }) => {
        setEnabled(data.flags?.[key] ?? false);
      })
      .catch(() => setEnabled(false));
  }, [key]);
  return enabled;
}
