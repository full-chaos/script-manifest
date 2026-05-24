import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockRefreshAuth, mockUseAuth } from "../../../vitest.setup";
import AccountSettingsPage from "./page";

describe("AccountSettingsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    globalThis.fetch = vi.fn();
  });

  it("shows sign-in prompt without active session", () => {
    render(<AccountSettingsPage />);

    expect(screen.getByText("Account Settings")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "sign in" })).toHaveAttribute("href", "/signin");
  });

  it("makes export, portability, and deletion controls discoverable to signed-in writers", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One", role: "writer" },
      loading: false,
    });

    render(<AccountSettingsPage />);

    expect(screen.getByText("Data Rights & Portability")).toBeInTheDocument();
    expect(screen.getByText(/download CSV or ZIP copies/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Export your data" })).toHaveAttribute("href", "/profile#data-export");
    expect(screen.getByRole("link", { name: "Import recovered history" })).toHaveAttribute("href", "/profile/import");
    expect(screen.getByRole("button", { name: "Delete Account" })).toBeInTheDocument();
  });
});

const signedInUser = {
  user: {
    id: "writer_01",
    email: "writer@example.com",
    displayName: "Writer One",
    role: "writer",
  },
  loading: false,
};

function mockFetchWith(impl: () => Partial<Response>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => impl() as Response);
}

describe("AccountSettingsPage — interactive account deletion flow", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mockUseAuth.mockReset();
    mockRefreshAuth.mockReset();
    mockUseAuth.mockReturnValue(signedInUser);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the signed-in user's email and display name", () => {
    render(<AccountSettingsPage />);
    expect(screen.getByText("writer@example.com")).toBeInTheDocument();
    expect(screen.getByText("Writer One")).toBeInTheDocument();
  });

  it("reveals the confirmation form when 'Delete Account' is clicked", () => {
    render(<AccountSettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));

    expect(screen.getByRole("button", { name: "Delete my account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm your password")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Account" })).not.toBeInTheDocument();
  });

  it("keeps the destructive submit disabled until a password is entered", () => {
    render(<AccountSettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));

    const submit = screen.getByRole("button", { name: "Delete my account" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Confirm your password"), { target: { value: "supersecret" } });
    expect(submit).not.toBeDisabled();
  });

  it("cancels back to the danger-zone summary and clears the password field", () => {
    render(<AccountSettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    fireEvent.change(screen.getByLabelText("Confirm your password"), { target: { value: "supersecret" } });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Delete Account" })).toBeInTheDocument();

    // Re-opening should present an empty password input again.
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    const pw = screen.getByLabelText("Confirm your password") as HTMLInputElement;
    expect(pw.value).toBe("");
  });

  it("renders the deletion-success view after a successful delete and triggers refreshAuth", async () => {
    const fetchSpy = mockFetchWith(() => ({ ok: true, json: async () => ({}) }));

    render(<AccountSettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    fireEvent.change(screen.getByLabelText("Confirm your password"), { target: { value: "correct" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    await waitFor(() => {
      expect(screen.getByText("Account Deleted")).toBeInTheDocument();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/auth/account",
      expect.objectContaining({
        method: "DELETE",
        credentials: "include",
        body: JSON.stringify({ password: "correct" }),
      }),
    );
    expect(mockRefreshAuth).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Go to homepage" })).toHaveAttribute("href", "/");
  });

  it("surfaces the friendly invalid_password message", async () => {
    mockFetchWith(() => ({ ok: false, json: async () => ({ error: "invalid_password" }) }));

    render(<AccountSettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    fireEvent.change(screen.getByLabelText("Confirm your password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(await screen.findByText("Incorrect password. Please try again.")).toBeInTheDocument();
    expect(mockRefreshAuth).not.toHaveBeenCalled();
    // Still on the confirmation form (not deleted view).
    expect(screen.getByRole("button", { name: "Delete my account" })).toBeInTheDocument();
  });

  it("renders the raw API error code when one is provided", async () => {
    mockFetchWith(() => ({ ok: false, json: async () => ({ error: "rate_limited" }) }));

    render(<AccountSettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    fireEvent.change(screen.getByLabelText("Confirm your password"), { target: { value: "any" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(await screen.findByText("rate_limited")).toBeInTheDocument();
  });

  it("falls back to a generic message when the error body has no error field", async () => {
    mockFetchWith(() => ({ ok: false, json: async () => ({}) }));

    render(<AccountSettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    fireEvent.change(screen.getByLabelText("Confirm your password"), { target: { value: "any" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(await screen.findByText("Something went wrong.")).toBeInTheDocument();
  });

  it("renders a network-error message when fetch rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));

    render(<AccountSettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    fireEvent.change(screen.getByLabelText("Confirm your password"), { target: { value: "any" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(await screen.findByText("Network error. Please try again.")).toBeInTheDocument();
  });

  it("shows the in-flight 'Deleting...' state while the request is pending", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    render(<AccountSettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    fireEvent.change(screen.getByLabelText("Confirm your password"), { target: { value: "any" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    const deleting = await screen.findByRole("button", { name: "Deleting..." });
    expect(deleting).toBeDisabled();

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({}) } as Response);
    });

    await waitFor(() => {
      expect(screen.getByText("Account Deleted")).toBeInTheDocument();
    });
  });
});
