import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { PaymentForm } from "./PaymentForm";

const mockConfirmPayment = vi.fn();
const mockStripe = {
  confirmPayment: mockConfirmPayment,
};
const mockElements = {};

vi.mock("@stripe/react-stripe-js", () => ({
  useStripe: () => mockStripe,
  useElements: () => mockElements,
  PaymentElement: () => <div data-testid="payment-element">Payment Element</div>,
}));

describe("PaymentForm", () => {
  const defaultProps = {
    clientSecret: "pi_test_secret_abc123",
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    defaultProps.onSuccess = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the payment element and submit button", () => {
    render(<PaymentForm {...defaultProps} />);

    expect(screen.getByTestId("payment-element")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Payment" })).toBeInTheDocument();
  });

  it("shows processing state during confirmation", async () => {
    mockConfirmPayment.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ error: undefined }), 100))
    );

    render(<PaymentForm {...defaultProps} />);

    const button = screen.getByRole("button", { name: "Confirm Payment" });
    fireEvent.click(button);

    expect(screen.getByRole("button", { name: "Processing payment..." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Processing payment..." })).toBeDisabled();

    await waitFor(() => {
      expect(defaultProps.onSuccess).toHaveBeenCalled();
    });
  });

  it("calls onSuccess after successful payment confirmation", async () => {
    mockConfirmPayment.mockResolvedValue({ error: undefined });

    render(<PaymentForm {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Confirm Payment" }));

    await waitFor(() => {
      expect(defaultProps.onSuccess).toHaveBeenCalledTimes(1);
    });

    expect(mockConfirmPayment).toHaveBeenCalledWith({
      elements: mockElements,
      clientSecret: defaultProps.clientSecret,
      confirmParams: {
        return_url: expect.stringContaining("/coverage/orders"),
      },
      redirect: "if_required",
    });
  });

  it("displays error message when payment fails", async () => {
    mockConfirmPayment.mockResolvedValue({
      error: { message: "Your card was declined." },
    });

    render(<PaymentForm {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Confirm Payment" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Your card was declined.")).toBeInTheDocument();
    });

    expect(defaultProps.onSuccess).not.toHaveBeenCalled();
  });

  it("displays fallback error message when error has no message", async () => {
    mockConfirmPayment.mockResolvedValue({
      error: {},
    });

    render(<PaymentForm {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Confirm Payment" }));

    await waitFor(() => {
      expect(screen.getByText("An unexpected error occurred.")).toBeInTheDocument();
    });
  });

  it("re-enables submit button after error", async () => {
    mockConfirmPayment.mockResolvedValue({
      error: { message: "Card declined" },
    });

    render(<PaymentForm {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Confirm Payment" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Confirm Payment" })).not.toBeDisabled();
    });
  });
});
