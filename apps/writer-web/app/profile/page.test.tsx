import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { mockUseAuth } from "../../vitest.setup";
import { ToastProvider } from "../components/toast";
import * as toastModule from "../components/toast";
import { fetcher } from "../lib/fetcher";
import ProfilePage from "./page";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderWithProviders(ui: React.ReactElement) {
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
      <ToastProvider>{ui}</ToastProvider>
    </SWRConfig>
  );
}

describe("ProfilePage", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: {
        id: "writer_01",
        email: "writer@example.com",
        displayName: "Writer One",
        role: "writer",
        emailVerified: true,
      },
      loading: false,
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });


  it("autoloads and updates a profile", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          profile: {
            id: "writer_01",
            displayName: "Writer One",
            bio: "First draft",
            genres: ["Drama"],
            demographics: [],
            representationStatus: "unrepresented",
            headshotUrl: "",
            customProfileUrl: "",
            isSearchable: true,
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          profile: {
            id: "writer_01",
            displayName: "Writer Updated",
            bio: "Updated bio",
            genres: ["Drama", "Thriller"],
            demographics: ["Latinx", "Disabled"],
            representationStatus: "seeking_rep",
            headshotUrl: "https://cdn.example.com/writer-updated.jpg",
            customProfileUrl: "https://profiles.example.com/writer-updated",
            isSearchable: false,
          },
        })
      )
      .mockResolvedValue(jsonResponse({})); // onboarding PATCH + any extra calls
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<ProfilePage />);
    const user = userEvent.setup();

    await screen.findByDisplayValue("Writer One");

    const displayName = screen.getByLabelText("Display name");
    await user.clear(displayName);
    await user.type(displayName, "Writer Updated");
    const bio = screen.getByLabelText("Bio");
    await user.clear(bio);
    await user.type(bio, "Updated bio");
    const demographics = screen.getByLabelText("Demographics (comma separated)");
    await user.type(demographics, "Latinx, Disabled");
    const headshotUrl = screen.getByLabelText("Headshot URL");
    await user.type(headshotUrl, "https://cdn.example.com/writer-updated.jpg");
    const customProfileUrl = screen.getByLabelText("Custom profile URL");
    await user.type(customProfileUrl, "https://profiles.example.com/writer-updated");
    await user.click(screen.getByLabelText("Allow profile in search results"));
    await user.selectOptions(screen.getByLabelText("Representation status"), "seeking_rep");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await screen.findByDisplayValue("Writer Updated");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/profiles/writer_01",
      expect.objectContaining({ cache: "no-store" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/profiles/writer_01",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          displayName: "Writer Updated",
          bio: "Updated bio",
          genres: ["Drama"],
          demographics: ["Latinx", "Disabled"],
          representationStatus: "seeking_rep",
          headshotUrl: "https://cdn.example.com/writer-updated.jpg",
          customProfileUrl: "https://profiles.example.com/writer-updated",
          isSearchable: false,
        }),
      })
    );
  });

  it("shows sign-in prompt and fires no fetch when user is not authenticated", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<ProfilePage />);

    expect(
      screen.getByText("Sign in first to load and edit your profile.")
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls toast.error with the API message when profile fetch returns 404", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue(
      { error: toastError, success: vi.fn(), info: vi.fn() } as ReturnType<typeof toastModule.useToast>
    );

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Profile not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        })
      )
    );

    renderWithProviders(<ProfilePage />);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("HTTP 404");
    });
  });

  it("populates cache from mutation response and renders new profile without a second GET", async () => {
    const user = userEvent.setup();

    const initialProfile = {
      id: "writer_01",
      displayName: "Before Save",
      bio: "",
      genres: [] as string[],
      demographics: [] as string[],
      representationStatus: "unrepresented" as const,
      headshotUrl: "",
      customProfileUrl: "",
      isSearchable: true,
    };
    const updatedProfile = { ...initialProfile, displayName: "After Save" };

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ profile: initialProfile })) // GET
      .mockResolvedValueOnce(jsonResponse({ profile: updatedProfile })) // PUT
      .mockResolvedValue(jsonResponse({})); // onboarding PATCH
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<ProfilePage />);

    await screen.findByDisplayValue("Before Save");

    // Submit without any edits to keep the test focused on cache behaviour.
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    // After the PUT, populateCache writes the response to SWR's cache for
    // profileKey. No re-GET should fire (revalidate: false).
    await screen.findByDisplayValue("After Save");

    const profileGetCalls = fetchMock.mock.calls.filter(
      ([url, init]) =>
        url === "/api/v1/profiles/writer_01" &&
        !(init as RequestInit | undefined)?.method
    );
    const profilePutCalls = fetchMock.mock.calls.filter(
      ([url, init]) =>
        url === "/api/v1/profiles/writer_01" &&
        (init as RequestInit | undefined)?.method === "PUT"
    );

    expect(profileGetCalls).toHaveLength(1); // exactly one GET — no re-fetch after save
    expect(profilePutCalls).toHaveLength(1); // exactly one PUT
  });

  it("frames profile as proof and records export/share activation", async () => {
    const user = userEvent.setup();
    const profile = {
      id: "writer_01",
      displayName: "Writer One",
      bio: "Proof bio",
      genres: ["Drama"],
      demographics: [] as string[],
      representationStatus: "unrepresented" as const,
      headshotUrl: "",
      customProfileUrl: "https://profiles.example.com/writer-one",
      isSearchable: true,
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/v1/profiles/writer_01") return jsonResponse({ profile });
        if (url === "/api/v1/export/csv") return jsonResponse({ ok: true });
        if (url === "/api/v1/onboarding-progress") return jsonResponse({ ok: true });
        return jsonResponse({});
      });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:export"),
      revokeObjectURL: vi.fn(),
    });

    renderWithProviders(<ProfilePage />);

    expect(await screen.findByText("My Proof")).toBeInTheDocument();
    expect(screen.getByText(/exportable proof of your scripts, submissions, placements, and access activity/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Share career page" })).toHaveAttribute("href", "https://profiles.example.com/writer-one");

    await user.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/onboarding-progress",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ exportUsed: true, activationEvent: "export_used" }),
        })
      );
    });
  });
});
