import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DisputeRefundPolicyPage from "./page";

describe("DisputeRefundPolicyPage", () => {
  it("renders the dispute and refund policy workflow", () => {
    render(<DisputeRefundPolicyPage />);

    expect(screen.getByRole("heading", { name: "Dispute & Refund Policy" })).toBeInTheDocument();
    expect(screen.getByText("Refund eligibility")).toBeInTheDocument();
    expect(screen.getByText(/disputes are reviewed by Script Manifest support/i)).toBeInTheDocument();
  });
});
