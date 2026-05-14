import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SWRConfig } from "swr";
import type { ReactElement } from "react";
import { mockUseAuth } from "../../../vitest.setup";
import { fetcher } from "../../lib/fetcher";
import SecuritySettingsPage from "./page";

function renderWithSWR(ui: ReactElement) {
  return render(
    <SWRConfig
      value={{
        fetcher,
        provider: () => new Map(),
        dedupingInterval: 0,
        shouldRetryOnError: false,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      }}
    >
      {ui}
    </SWRConfig>
  );
}

describe("SecuritySettingsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows sign-in prompt without active session", () => {
    renderWithSWR(<SecuritySettingsPage />);

    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "sign in" })).toHaveAttribute("href", "/signin");
  });
});
