import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/toast";
import PaymentMethodsPage from "./page";

function renderPage() {
  return render(
    <ToastProvider>
      <PaymentMethodsPage />
    </ToastProvider>
  );
}

function makePaymentMethodsResponse(paymentMethods: unknown[] = []) {
  return new Response(JSON.stringify({ paymentMethods }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function makeEmptyResponse(status = 204) {
  return new Response(null, {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("PaymentMethodsPage", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders empty state when no payment methods are found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => makePaymentMethodsResponse([]))
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("No saved payment methods")).toBeInTheDocument();
    });
  });

  it("renders saved cards", async () => {
    const method = {
      id: "pm_1",
      brand: "visa",
      last4: "4242",
      expMonth: 12,
      expYear: 2027
    };

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => makePaymentMethodsResponse([method]))
    );

    renderPage();

    expect(await screen.findByText("visa •••• 4242")).toBeInTheDocument();
    expect(screen.getByText("Expires 12/2027")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove visa ending in 4242" })).toBeInTheDocument();
  });

  it("removes a card successfully", async () => {
    const method = {
      id: "pm_1",
      brand: "visa",
      last4: "4242",
      expMonth: 12,
      expYear: 2027
    };

    let fetchCount = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input, init) => {
        const reqMethod = typeof input === "string" ? init?.method : (input as Request).method;

        if (reqMethod === "DELETE") {
          return makeEmptyResponse(204);
        }

        if (fetchCount === 0) {
          fetchCount++;
          return makePaymentMethodsResponse([method]);
        }
        
        return makePaymentMethodsResponse([]);
      })
    );

    renderPage();

    const removeBtn = await screen.findByRole("button", { name: "Remove visa ending in 4242" });
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.queryByText("visa •••• 4242")).not.toBeInTheDocument();
    });
  });
});