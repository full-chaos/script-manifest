import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it, afterEach } from "vitest";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";

describe("PasswordStrengthMeter", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders all default requirements with cross icons", () => {
    render(<PasswordStrengthMeter password="" />);

    expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
    expect(screen.getByText("One uppercase letter")).toBeInTheDocument();
    expect(screen.getByText("One number")).toBeInTheDocument();
    expect(screen.getByText("One special character")).toBeInTheDocument();

    expect(screen.getByTestId("icon-cross-length")).toBeInTheDocument();
    expect(screen.getByTestId("icon-cross-uppercase")).toBeInTheDocument();
    expect(screen.getByTestId("icon-cross-number")).toBeInTheDocument();
    expect(screen.getByTestId("icon-cross-special")).toBeInTheDocument();
  });

  it('shows weak (red) for "abc"', () => {
    render(<PasswordStrengthMeter password="abc" />);

    // 0 rules met because length < 8, no uppercase, no number, no special char
    const bar = screen.getByTestId("strength-bar");
    expect(bar).toHaveClass("bg-red-500");
  });

  it('shows strong (green) for "Str0ng!Pass"', () => {
    render(<PasswordStrengthMeter password="Str0ng!Pass" />);

    // 4 rules met
    const bar = screen.getByTestId("strength-bar");
    expect(bar).toHaveClass("bg-green-500");

    expect(screen.getByTestId("icon-check-length")).toBeInTheDocument();
    expect(screen.getByTestId("icon-check-uppercase")).toBeInTheDocument();
    expect(screen.getByTestId("icon-check-number")).toBeInTheDocument();
    expect(screen.getByTestId("icon-check-special")).toBeInTheDocument();
  });

  it("toggles requirements correctly", () => {
    const { rerender } = render(<PasswordStrengthMeter password="A" />);

    // 1 rule met: uppercase
    expect(screen.getByTestId("icon-check-uppercase")).toBeInTheDocument();
    expect(screen.getByTestId("icon-cross-length")).toBeInTheDocument();
    expect(screen.getByTestId("strength-bar")).toHaveClass("bg-yellow-500");

    // Add a number
    rerender(<PasswordStrengthMeter password="A1" />);
    expect(screen.getByTestId("icon-check-uppercase")).toBeInTheDocument();
    expect(screen.getByTestId("icon-check-number")).toBeInTheDocument();
    expect(screen.getByTestId("strength-bar")).toHaveClass("bg-yellow-500"); // 2 rules

    // Add a special char
    rerender(<PasswordStrengthMeter password="A1!" />);
    expect(screen.getByTestId("icon-check-special")).toBeInTheDocument();
    expect(screen.getByTestId("strength-bar")).toHaveClass("bg-green-500"); // 3 rules -> strong!

    // Add length
    rerender(<PasswordStrengthMeter password="A1!xxxxxx" />);
    expect(screen.getByTestId("icon-check-length")).toBeInTheDocument();
    expect(screen.getByTestId("strength-bar")).toHaveClass("bg-green-500"); // 4 rules -> strong!
  });
});
