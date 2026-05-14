import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

describe("StripeProvider", () => {
  it("renders children inside Elements when key is set", async () => {
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_abc123";

    vi.resetModules();

    vi.doMock("@stripe/stripe-js", () => ({
      loadStripe: vi.fn(() => Promise.resolve({})),
    }));

    vi.doMock("@stripe/react-stripe-js", () => ({
      Elements: ({ children }: { children: React.ReactNode }) =>
        React.createElement("div", { "data-testid": "stripe-elements" }, children),
    }));

    const { StripeProvider } = await import("./StripeProvider");
    // Widen children to optional so React.createElement accepts it as a child arg
    const StripeProviderComp = StripeProvider as React.ComponentType<{ clientSecret: string; children?: React.ReactNode }>;

    render(
      React.createElement(
        StripeProviderComp,
        { clientSecret: "pi_test_secret_abc123" },
        React.createElement("div", { "data-testid": "child-content" }, "Payment Form")
      )
    );

    expect(screen.getByTestId("stripe-elements")).toBeInTheDocument();
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
  });

  it("shows configuration error when publishable key is missing", async () => {
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

    vi.resetModules();

    vi.doMock("@stripe/stripe-js", () => ({
      loadStripe: vi.fn(() => Promise.resolve({})),
    }));

    vi.doMock("@stripe/react-stripe-js", () => ({
      Elements: ({ children }: { children: React.ReactNode }) =>
        React.createElement("div", { "data-testid": "stripe-elements" }, children),
    }));

    const { StripeProvider } = await import("./StripeProvider");
    const StripeProviderComp = StripeProvider as React.ComponentType<{ clientSecret: string; children?: React.ReactNode }>;

    render(
      React.createElement(
        StripeProviderComp,
        { clientSecret: "pi_test_secret_abc123" },
        React.createElement("div", { "data-testid": "child-content" }, "Payment Form")
      )
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/)).toBeInTheDocument();
    expect(screen.queryByTestId("child-content")).not.toBeInTheDocument();
  });
});
