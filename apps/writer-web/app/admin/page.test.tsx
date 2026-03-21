import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/toast";
import AdminDashboardPage from "./page";

describe("AdminDashboardPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          metrics: {
            totalUsers: 120,
            activeUsers30d: 84,
            totalProjects: 40,
            openDisputes: 2,
            pendingAppeals: 3,
            pendingFlags: 1,
            pendingReports: 4
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
  });

  it("renders dashboard metrics", async () => {
    render(
      <ToastProvider>
        <AdminDashboardPage />
      </ToastProvider>
    );

    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Platform Metrics")).toBeInTheDocument();
    expect(screen.getByText("Total Users")).toBeInTheDocument();
  });
});
