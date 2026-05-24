import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CoverageSlaPolicyPage from "./page";

describe("CoverageSlaPolicyPage", () => {
  it("renders the coverage SLA policy commitments", () => {
    render(<CoverageSlaPolicyPage />);

    expect(screen.getByRole("heading", { name: "Coverage SLA Policy" })).toBeInTheDocument();
    expect(screen.getByText("Delivery commitments")).toBeInTheDocument();
    expect(screen.getByText(/providers must publish turnaround windows/i)).toBeInTheDocument();
  });
});
