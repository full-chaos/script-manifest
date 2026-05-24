import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import type { ReactElement } from "react";
import { mockUseAuth } from "../../../vitest.setup";
import { fetcher } from "../../lib/fetcher";
import SecuritySettingsPage from "./page";

function renderWithSWR(ui: ReactElement) {
  return render(
    <SWRConfig
      value={{
        fetcher,
        provider: () => new Map(),
        dedupingInterval: 0,
        shouldRetryOnError: false,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      }}
    >
      {ui}
    </SWRConfig>
  );
}

describe("SecuritySettingsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows sign-in prompt without active session", () => {
    renderWithSWR(<SecuritySettingsPage />);

    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "sign in" })).toHaveAttribute("href", "/signin");
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

type FetchHandler = {
  url: string;
  method?: string;
  ok: boolean;
  status?: number;
  json: unknown;
};

function mockSecurityFetch(handlers: FetchHandler[]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const method = (init?.method ?? "GET").toUpperCase();
    const handler = handlers.find(
      (h) => url.includes(h.url) && (!h.method || h.method.toUpperCase() === method),
    );
    if (!handler) {
      return {
        ok: false,
        status: 404,
        text: async () => "{}",
        json: async () => ({}),
      } as Response;
    }
    const text = JSON.stringify(handler.json);
    return {
      ok: handler.ok,
      status: handler.status ?? (handler.ok ? 200 : 400),
      text: async () => text,
      json: async () => handler.json,
    } as Response;
  });
}

describe("SecuritySettingsPage — MFA flows", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mockUseAuth.mockReset();
    mockUseAuth.mockReturnValue(signedInUser);
  });

  afterEach(() => {
    cleanup();
  });

  it("shows 'Loading...' while auth context is still resolving", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    renderWithSWR(<SecuritySettingsPage />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("transitions to disabled state after a successful mfaEnabled=false fetch", async () => {
    mockSecurityFetch([{ url: "/mfa/status", ok: true, json: { mfaEnabled: false } }]);
    renderWithSWR(<SecuritySettingsPage />);

    expect(
      await screen.findByRole("button", { name: "Enable Two-Factor Authentication" }),
    ).toBeInTheDocument();
  });

  it("transitions to enabled state after a successful mfaEnabled=true fetch", async () => {
    mockSecurityFetch([{ url: "/mfa/status", ok: true, json: { mfaEnabled: true } }]);
    renderWithSWR(<SecuritySettingsPage />);

    expect(await screen.findByText("Two-factor authentication is enabled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disable 2FA" })).toBeInTheDocument();
  });

  it("falls back to disabled state with an error banner when status fetch fails", async () => {
    mockSecurityFetch([
      { url: "/mfa/status", ok: false, status: 500, json: { message: "boom" } },
    ]);
    renderWithSWR(<SecuritySettingsPage />);

    expect(await screen.findByText("Failed to load MFA status.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enable Two-Factor Authentication" }),
    ).toBeInTheDocument();
  });

  it("starts setup and renders the otpauth URL + secret on success", async () => {
    mockSecurityFetch([
      { url: "/mfa/status", ok: true, json: { mfaEnabled: false } },
      {
        url: "/mfa/setup",
        method: "POST",
        ok: true,
        json: { secret: "BASE32SECRET", otpauthUrl: "otpauth://totp/SM:writer" },
      },
    ]);
    renderWithSWR(<SecuritySettingsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable Two-Factor Authentication" }),
    );

    expect(await screen.findByText("otpauth://totp/SM:writer")).toBeInTheDocument();
    expect(screen.getByText("BASE32SECRET")).toBeInTheDocument();
    expect(screen.getByText("Step 1: Scan QR Code")).toBeInTheDocument();
  });

  it("maps mfa_already_enabled to a friendly setup error", async () => {
    mockSecurityFetch([
      { url: "/mfa/status", ok: true, json: { mfaEnabled: false } },
      {
        url: "/mfa/setup",
        method: "POST",
        ok: false,
        status: 409,
        json: { error: "mfa_already_enabled" },
      },
    ]);
    renderWithSWR(<SecuritySettingsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable Two-Factor Authentication" }),
    );

    expect(await screen.findByText("MFA is already enabled.")).toBeInTheDocument();
  });

  it("passes through a non-special setup error code", async () => {
    mockSecurityFetch([
      { url: "/mfa/status", ok: true, json: { mfaEnabled: false } },
      {
        url: "/mfa/setup",
        method: "POST",
        ok: false,
        status: 400,
        json: { error: "rate_limited" },
      },
    ]);
    renderWithSWR(<SecuritySettingsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable Two-Factor Authentication" }),
    );

    expect(await screen.findByText("rate_limited")).toBeInTheDocument();
  });

  it("falls back to 'Setup failed.' when the setup error body has no error code", async () => {
    mockSecurityFetch([
      { url: "/mfa/status", ok: true, json: { mfaEnabled: false } },
      {
        url: "/mfa/setup",
        method: "POST",
        ok: false,
        status: 500,
        json: { message: "boom" },
      },
    ]);
    renderWithSWR(<SecuritySettingsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable Two-Factor Authentication" }),
    );

    expect(await screen.findByText("Setup failed.")).toBeInTheDocument();
  });

  it("strips non-digit input and caps the totp field at 6 characters", async () => {
    mockSecurityFetch([
      { url: "/mfa/status", ok: true, json: { mfaEnabled: false } },
      {
        url: "/mfa/setup",
        method: "POST",
        ok: true,
        json: { secret: "S", otpauthUrl: "otpauth://x" },
      },
    ]);
    renderWithSWR(<SecuritySettingsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable Two-Factor Authentication" }),
    );

    const input = (await screen.findByPlaceholderText("000000")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "ab12cd34ef56gh78" } });
    expect(input.value).toBe("123456");
    expect(screen.getByRole("button", { name: "Verify and Enable" })).not.toBeDisabled();
  });

  it("keeps the verify button disabled until 6 digits are entered", async () => {
    mockSecurityFetch([
      { url: "/mfa/status", ok: true, json: { mfaEnabled: false } },
      {
        url: "/mfa/setup",
        method: "POST",
        ok: true,
        json: { secret: "S", otpauthUrl: "otpauth://x" },
      },
    ]);
    renderWithSWR(<SecuritySettingsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable Two-Factor Authentication" }),
    );

    const input = await screen.findByPlaceholderText("000000");
    fireEvent.change(input, { target: { value: "123" } });
    expect(screen.getByRole("button", { name: "Verify and Enable" })).toBeDisabled();
  });

  it("cancel during setup resets to the disabled state", async () => {
    mockSecurityFetch([
      { url: "/mfa/status", ok: true, json: { mfaEnabled: false } },
      {
        url: "/mfa/setup",
        method: "POST",
        ok: true,
        json: { secret: "S", otpauthUrl: "otpauth://x" },
      },
    ]);
    renderWithSWR(<SecuritySettingsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable Two-Factor Authentication" }),
    );
    await screen.findByText("Step 1: Scan QR Code");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("button", { name: "Enable Two-Factor Authentication" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Step 1: Scan QR Code")).not.toBeInTheDocument();
  });

  it("verifies setup and renders the returned backup codes", async () => {
    mockSecurityFetch([
      { url: "/mfa/status", ok: true, json: { mfaEnabled: false } },
      {
        url: "/mfa/setup",
        method: "POST",
        ok: true,
        json: { secret: "S", otpauthUrl: "otpauth://x" },
      },
      {
        url: "/mfa/verify-setup",
        method: "POST",
        ok: true,
        json: { backupCodes: ["AAA-111", "BBB-222"] },
      },
    ]);
    renderWithSWR(<SecuritySettingsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable Two-Factor Authentication" }),
    );
    fireEvent.change(await screen.findByPlaceholderText("000000"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and Enable" }));

    expect(await screen.findByText("AAA-111")).toBeInTheDocument();
    expect(screen.getByText("BBB-222")).toBeInTheDocument();
    expect(screen.getByText("Save your backup codes!")).toBeInTheDocument();
  });

  it("maps invalid_totp_code on verify to a friendly error", async () => {
    mockSecurityFetch([
      { url: "/mfa/status", ok: true, json: { mfaEnabled: false } },
      {
        url: "/mfa/setup",
        method: "POST",
        ok: true,
        json: { secret: "S", otpauthUrl: "otpauth://x" },
      },
      {
        url: "/mfa/verify-setup",
        method: "POST",
        ok: false,
        status: 400,
        json: { error: "invalid_totp_code" },
      },
    ]);
    renderWithSWR(<SecuritySettingsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable Two-Factor Authentication" }),
    );
    fireEvent.change(await screen.findByPlaceholderText("000000"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and Enable" }));

    expect(await screen.findByText("Invalid code. Please try again.")).toBeInTheDocument();
  });

  it("passes through non-special verify error codes", async () => {
    mockSecurityFetch([
      { url: "/mfa/status", ok: true, json: { mfaEnabled: false } },
      {
        url: "/mfa/setup",
        method: "POST",
        ok: true,
        json: { secret: "S", otpauthUrl: "otpauth://x" },
      },
      {
        url: "/mfa/verify-setup",
        method: "POST",
        ok: false,
        status: 400,
        json: { error: "expired" },
      },
    ]);
    renderWithSWR(<SecuritySettingsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable Two-Factor Authentication" }),
    );
    fireEvent.change(await screen.findByPlaceholderText("000000"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and Enable" }));

    expect(await screen.findByText("expired")).toBeInTheDocument();
  });

  it("falls back to 'Verification failed.' for unrecognized verify errors", async () => {
    mockSecurityFetch([
      { url: "/mfa/status", ok: true, json: { mfaEnabled: false } },
      {
        url: "/mfa/setup",
        method: "POST",
        ok: true,
        json: { secret: "S", otpauthUrl: "otpauth://x" },
      },
      {
        url: "/mfa/verify-setup",
        method: "POST",
        ok: false,
        status: 500,
        json: { message: "boom" },
      },
    ]);
    renderWithSWR(<SecuritySettingsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable Two-Factor Authentication" }),
    );
    fireEvent.change(await screen.findByPlaceholderText("000000"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and Enable" }));

    expect(await screen.findByText("Verification failed.")).toBeInTheDocument();
  });

  it("copies backup codes to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    mockSecurityFetch([
      { url: "/mfa/status", ok: true, json: { mfaEnabled: false } },
      { url: "/mfa/setup", method: "POST", ok: true, json: { secret: "S", otpauthUrl: "o" } },
      {
        url: "/mfa/verify-setup",
        method: "POST",
        ok: true,
        json: { backupCodes: ["AAA", "BBB"] },
      },
    ]);
    renderWithSWR(<SecuritySettingsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable Two-Factor Authentication" }),
    );
    fireEvent.change(await screen.findByPlaceholderText("000000"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and Enable" }));

    fireEvent.click(await screen.findByRole("button", { name: "Copy codes" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("AAA\nBBB");
    });
  });

  it("swallows a rejected clipboard write without throwing", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    mockSecurityFetch([
      { url: "/mfa/status", ok: true, json: { mfaEnabled: false } },
      { url: "/mfa/setup", method: "POST", ok: true, json: { secret: "S", otpauthUrl: "o" } },
      {
        url: "/mfa/verify-setup",
        method: "POST",
        ok: true,
        json: { backupCodes: ["XYZ"] },
      },
    ]);
    renderWithSWR(<SecuritySettingsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable Two-Factor Authentication" }),
    );
    fireEvent.change(await screen.findByPlaceholderText("000000"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and Enable" }));

    fireEvent.click(await screen.findByRole("button", { name: "Copy codes" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
    // UI continues to show the codes; no crash.
    expect(screen.getByText("XYZ")).toBeInTheDocument();
  });

  it("downloads backup codes by triggering an anchor click", async () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:url");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      value: createObjectURL,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: revokeObjectURL,
      configurable: true,
      writable: true,
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    mockSecurityFetch([
      { url: "/mfa/status", ok: true, json: { mfaEnabled: false } },
      { url: "/mfa/setup", method: "POST", ok: true, json: { secret: "S", otpauthUrl: "o" } },
      {
        url: "/mfa/verify-setup",
        method: "POST",
        ok: true,
        json: { backupCodes: ["AAA", "BBB"] },
      },
    ]);
    renderWithSWR(<SecuritySettingsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable Two-Factor Authentication" }),
    );
    fireEvent.change(await screen.findByPlaceholderText("000000"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and Enable" }));

    fireEvent.click(await screen.findByRole("button", { name: "Download" }));

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:url");
  });

  it("confirms saved backup codes and moves to the enabled state", async () => {
    mockSecurityFetch([
      { url: "/mfa/status", ok: true, json: { mfaEnabled: false } },
      { url: "/mfa/setup", method: "POST", ok: true, json: { secret: "S", otpauthUrl: "o" } },
      {
        url: "/mfa/verify-setup",
        method: "POST",
        ok: true,
        json: { backupCodes: ["AAA"] },
      },
    ]);
    renderWithSWR(<SecuritySettingsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable Two-Factor Authentication" }),
    );
    fireEvent.change(await screen.findByPlaceholderText("000000"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and Enable" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "I have saved my backup codes" }),
    );

    expect(await screen.findByText("Two-factor authentication is enabled")).toBeInTheDocument();
  });

  it("opens and cancels the disable confirmation form", async () => {
    mockSecurityFetch([{ url: "/mfa/status", ok: true, json: { mfaEnabled: true } }]);
    renderWithSWR(<SecuritySettingsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Disable 2FA" }));
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Authenticator code")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Two-factor authentication is enabled")).toBeInTheDocument();
  });

  it("keeps the destructive disable submit gated on password + 6 digits", async () => {
    mockSecurityFetch([{ url: "/mfa/status", ok: true, json: { mfaEnabled: true } }]);
    renderWithSWR(<SecuritySettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Disable 2FA" }));

    const submit = screen.getByRole("button", { name: "Disable 2FA" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Authenticator code"), {
      target: { value: "abc12def34gh56" },
    });
    expect(submit).not.toBeDisabled();
  });

  it("successfully disables MFA and returns to the disabled state", async () => {
    mockSecurityFetch([
      { url: "/mfa/status", ok: true, json: { mfaEnabled: true } },
      { url: "/mfa/disable", method: "POST", ok: true, status: 204, json: {} },
    ]);
    renderWithSWR(<SecuritySettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Disable 2FA" }));
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Disable 2FA" }));

    expect(
      await screen.findByRole("button", { name: "Enable Two-Factor Authentication" }),
    ).toBeInTheDocument();
  });

  it("shows the friendly invalid_password message when disable rejects with that code", async () => {
    mockSecurityFetch([
      { url: "/mfa/status", ok: true, json: { mfaEnabled: true } },
      {
        url: "/mfa/disable",
        method: "POST",
        ok: false,
        status: 400,
        json: { error: "invalid_password" },
      },
    ]);
    renderWithSWR(<SecuritySettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Disable 2FA" }));
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Disable 2FA" }));

    expect(await screen.findByText("Incorrect password.")).toBeInTheDocument();
  });

  it("shows the friendly invalid_totp_code message when disable rejects with that code", async () => {
    mockSecurityFetch([
      { url: "/mfa/status", ok: true, json: { mfaEnabled: true } },
      {
        url: "/mfa/disable",
        method: "POST",
        ok: false,
        status: 400,
        json: { error: "invalid_totp_code" },
      },
    ]);
    renderWithSWR(<SecuritySettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Disable 2FA" }));
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Disable 2FA" }));

    expect(await screen.findByText("Invalid authentication code.")).toBeInTheDocument();
  });

  it("passes through other disable error codes verbatim", async () => {
    mockSecurityFetch([
      { url: "/mfa/status", ok: true, json: { mfaEnabled: true } },
      {
        url: "/mfa/disable",
        method: "POST",
        ok: false,
        status: 400,
        json: { error: "session_locked" },
      },
    ]);
    renderWithSWR(<SecuritySettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Disable 2FA" }));
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Disable 2FA" }));

    expect(await screen.findByText("session_locked")).toBeInTheDocument();
  });

  it("falls back to 'Failed to disable MFA.' when the disable error body has no code", async () => {
    mockSecurityFetch([
      { url: "/mfa/status", ok: true, json: { mfaEnabled: true } },
      {
        url: "/mfa/disable",
        method: "POST",
        ok: false,
        status: 500,
        json: { message: "boom" },
      },
    ]);
    renderWithSWR(<SecuritySettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Disable 2FA" }));
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Disable 2FA" }));

    expect(await screen.findByText("Failed to disable MFA.")).toBeInTheDocument();
  });
});
