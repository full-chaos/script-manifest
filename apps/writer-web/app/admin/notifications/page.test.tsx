import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/toast";
import AdminNotificationsPage from "./page";

describe("AdminNotificationsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/v1/admin/notifications/templates")) {
        return new Response(JSON.stringify({ templates: [] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ broadcasts: [], total: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
  });

  it("renders templates and history empty states", async () => {
    render(
      <ToastProvider>
        <AdminNotificationsPage />
      </ToastProvider>
    );

    expect(await screen.findByText("Notification Management")).toBeInTheDocument();
    expect(screen.getByText("No templates")).toBeInTheDocument();
    expect(screen.getByText("No broadcasts")).toBeInTheDocument();
  });
});
