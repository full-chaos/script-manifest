import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/toast";
import AdminAuditLogPage from "./page";

describe("AdminAuditLogPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ entries: [], total: 0, page: 1, limit: 50 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
  });

  it("renders empty audit log list", async () => {
    render(
      <ToastProvider>
        <AdminAuditLogPage />
      </ToastProvider>
    );

    expect(await screen.findByText("Audit log")).toBeInTheDocument();
    expect(screen.getByText("No audit log entries found")).toBeInTheDocument();
  });
});
