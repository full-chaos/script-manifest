import { render, screen, act } from "@testing-library/react";
import { useSWRConfig } from "swr";
import type { SWRConfiguration } from "swr";
import { describe, it, expect, beforeEach } from "vitest";
import { SWRProvider } from "./SWRProvider";
import { mockRefreshAuth } from "../../vitest.setup";
import { ApiError } from "./fetcher";

// Helper: mounts inside SWRProvider and captures the merged SWR config.
function ConfigCapture({
  onCapture,
}: {
  onCapture: (cfg: SWRConfiguration) => void;
}) {
  const cfg = useSWRConfig();
  onCapture(cfg);
  return null;
}

function withCapture(fn: (cfg: SWRConfiguration) => void) {
  let config!: SWRConfiguration;
  render(
    <SWRProvider>
      <ConfigCapture onCapture={(c) => { config = c; }} />
    </SWRProvider>,
  );
  fn(config);
}

describe("SWRProvider", () => {
  beforeEach(() => {
    mockRefreshAuth.mockClear();
  });

  it("renders children", () => {
    render(
      <SWRProvider>
        <span>hello child</span>
      </SWRProvider>,
    );
    expect(screen.getByText("hello child")).toBeInTheDocument();
  });

  describe("onError", () => {
    it("calls refreshAuth exactly once when a 401 ApiError fires", () => {
      withCapture((config) => {
        const err = new ApiError("Unauthorized", { status: 401 });
        act(() => { config.onError?.(err, "key", config as never); });
        expect(mockRefreshAuth).toHaveBeenCalledTimes(1);
      });
    });

    it("does NOT call refreshAuth on a 500 ApiError", () => {
      withCapture((config) => {
        const err = new ApiError("Server Error", { status: 500 });
        act(() => { config.onError?.(err, "key", config as never); });
        expect(mockRefreshAuth).not.toHaveBeenCalled();
      });
    });

    it("does NOT call refreshAuth on a non-ApiError", () => {
      withCapture((config) => {
        const err = new Error("generic error");
        act(() => { config.onError?.(err, "key", config as never); });
        expect(mockRefreshAuth).not.toHaveBeenCalled();
      });
    });
  });

  describe("shouldRetryOnError", () => {
    function getShouldRetry(config: SWRConfiguration) {
      const fn = config.shouldRetryOnError;
      if (typeof fn !== "function") {
        throw new Error("Expected shouldRetryOnError to be a function");
      }
      return fn;
    }

    it("returns false for a 4xx ApiError", () => {
      withCapture((config) => {
        const shouldRetry = getShouldRetry(config);
        const err = new ApiError("Not Found", { status: 404 });
        expect(shouldRetry(err)).toBe(false);
      });
    });

    it("returns true for a 5xx ApiError", () => {
      withCapture((config) => {
        const shouldRetry = getShouldRetry(config);
        const err = new ApiError("Internal Server Error", { status: 500 });
        expect(shouldRetry(err)).toBe(true);
      });
    });

    it("returns true for a non-ApiError", () => {
      withCapture((config) => {
        const shouldRetry = getShouldRetry(config);
        const err = new Error("generic");
        expect(shouldRetry(err)).toBe(true);
      });
    });
  });
});
