import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./toast";

function TestTrigger({ variant, message }: { variant: "success" | "error" | "info"; message: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => toast[variant](message)}
    >
      Trigger
    </button>
  );
}

function renderWithProvider(variant: "success" | "error" | "info", message: string) {
  return render(
    <ToastProvider>
      <TestTrigger variant={variant} message={message} />
    </ToastProvider>
  );
}

describe("ToastProvider / useToast", () => {
  beforeEach(() => {
    cleanup();
    vi.useFakeTimers();
  });

  it("renders a success toast with the correct message", () => {
    renderWithProvider("success", "Script saved!");

    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));

    expect(screen.getByText("Script saved!")).toBeInTheDocument();
    expect(screen.getByText("Success:")).toBeInTheDocument();
  });

  it("renders an error toast with the correct message", () => {
    renderWithProvider("error", "Something went wrong.");

    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));

    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
    expect(screen.getByText("Error:")).toBeInTheDocument();
  });

  it("dismisses a toast when the dismiss button is clicked", () => {
    renderWithProvider("info", "Hello world");

    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));
    expect(screen.getByText("Hello world")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryByText("Hello world")).not.toBeInTheDocument();
  });

  it("auto-dismisses after 5 seconds", () => {
    renderWithProvider("success", "Auto gone");

    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));
    expect(screen.getByText("Auto gone")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000 + 300);
    });

    expect(screen.queryByText("Auto gone")).not.toBeInTheDocument();
  });

  it("throws when useToast is used outside ToastProvider", () => {
    function BadComponent() {
      useToast();
      return null;
    }

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<BadComponent />)).toThrow("useToast must be used within a ToastProvider");
    consoleError.mockRestore();
  });
});
