import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProviderVerificationBadge } from "./ProviderVerificationBadge";

const verifiedBadge = {
  kind: "verified_provider" as const,
  label: "Verified provider",
  description: "Script Manifest reviewed this provider's identity and coverage history.",
  verifiedAt: "2026-05-24T12:00:00.000Z"
};

describe("ProviderVerificationBadge", () => {
  it("renders a compact verified badge with accessible description", () => {
    render(<ProviderVerificationBadge badge={verifiedBadge} variant="compact" />);

    expect(screen.getByText("Verified provider")).toBeInTheDocument();
    expect(screen.getByLabelText(/Verified provider/)).toHaveAttribute(
      "title",
      "Script Manifest reviewed this provider's identity and coverage history."
    );
  });

  it("renders full unverified copy", () => {
    render(
      <ProviderVerificationBadge
        badge={{
          kind: "unverified_provider",
          label: "Unverified provider",
          description: "This provider has not completed Script Manifest verification yet.",
          verifiedAt: null
        }}
        variant="full"
      />
    );

    expect(screen.getByText("Unverified provider")).toBeInTheDocument();
    expect(screen.getByText("This provider has not completed Script Manifest verification yet.")).toBeInTheDocument();
  });

  it("renders rejected and suspended admin-only copy", () => {
    const { rerender } = render(
      <ProviderVerificationBadge
        badge={{
          kind: "verification_rejected",
          label: "Verification rejected",
          description: "This provider does not currently meet Script Manifest verification requirements.",
          verifiedAt: null
        }}
        variant="full"
      />
    );
    expect(screen.getByText("Verification rejected")).toBeInTheDocument();

    rerender(
      <ProviderVerificationBadge
        badge={{
          kind: "provider_suspended",
          label: "Verification suspended",
          description: "This provider's verification is suspended while Script Manifest reviews their account.",
          verifiedAt: null
        }}
        variant="full"
      />
    );
    expect(screen.getByText("Verification suspended")).toBeInTheDocument();
  });

  it("renders nothing when badge is missing", () => {
    const { container } = render(<ProviderVerificationBadge badge={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
