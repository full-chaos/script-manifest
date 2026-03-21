import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/toast";
import AdminUserDetailPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "user_01" })
}));

describe("AdminUserDetailPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          user: {
            id: "user_01",
            email: "user@example.com",
            displayName: "User One",
            role: "writer",
            accountStatus: "active",
            emailVerified: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            sessionCount: 3,
            reportCount: 0
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
  });

  it("renders user details", async () => {
    render(
      <ToastProvider>
        <AdminUserDetailPage />
      </ToastProvider>
    );

    expect(await screen.findByText("User One")).toBeInTheDocument();
    expect(screen.getByText("Account Information")).toBeInTheDocument();
  });
});
