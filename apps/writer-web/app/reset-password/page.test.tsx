import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SWRConfig } from "swr";
import type { ReactElement } from "react";
import { fetcher } from "../lib/fetcher";
import ResetPasswordPage from "./page";

function renderWithSWR(ui: ReactElement) {
  return render(
    <SWRConfig
      value={{
        fetcher,
        provider: () => new Map(),
        dedupingInterval: 0,
        shouldRetryOnError: false,
      }}
    >
      {ui}
    </SWRConfig>
  );
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
    window.history.replaceState({}, "", "/reset-password");
  });

  afterEach(() => {
    cleanup();
  });

  it("shows invalid link state without token", () => {
    renderWithSWR(<ResetPasswordPage />);

    expect(screen.getByText("Reset your password")).toBeInTheDocument();
    expect(screen.getByText(/Invalid reset link/i)).toBeInTheDocument();
  });
});
