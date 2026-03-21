import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/toast";
import AdminUsersPage from "./page";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush })
}));

describe("AdminUsersPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ users: [], total: 0, page: 1, limit: 20 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
  });

  it("renders users table empty state", async () => {
    render(
      <ToastProvider>
        <AdminUsersPage />
      </ToastProvider>
    );

    expect(await screen.findByText("User Management")).toBeInTheDocument();
    expect(screen.getByText("No users found")).toBeInTheDocument();
  });
});
