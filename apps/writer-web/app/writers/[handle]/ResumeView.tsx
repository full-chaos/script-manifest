"use client";

import { useEffect } from "react";
import useSWRMutation from "swr/mutation";

async function recordResumeView(url: string): Promise<void> {
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
}

export function ResumeView({ writerId }: { writerId: string }) {
  const { trigger } = useSWRMutation(
    `/api/v1/writers/${encodeURIComponent(writerId)}/resume-views`,
    recordResumeView
  );

  useEffect(() => {
    void trigger();
  }, [trigger]);

  return null;
}
