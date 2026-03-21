import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NotificationBell } from "./notificationBell";

function mockFetch(responses: Record<string, unknown>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;

    for (const [pattern, body] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return { ok: true, json: async () => body } as Response;
      }
    }

    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });
}

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders bell button", () => {
    mockFetch({ "unread-count": { count: 0 } });
    render(<NotificationBell />);
    expect(screen.getByTestId("notification-bell")).toBeInTheDocument();
  });

  it("shows unread badge when count > 0", async () => {
    mockFetch({ "unread-count": { count: 3 } });
    render(<NotificationBell />);

    await waitFor(() => {
      expect(screen.getByTestId("unread-badge")).toBeInTheDocument();
    });

    expect(screen.getByTestId("unread-badge")).toHaveTextContent("3");
  });

  it("shows 99+ when count exceeds 99", async () => {
    mockFetch({ "unread-count": { count: 150 } });
    render(<NotificationBell />);

    await waitFor(() => {
      expect(screen.getByTestId("unread-badge")).toHaveTextContent("99+");
    });
  });

  it("does not show badge when count is 0", async () => {
    mockFetch({ "unread-count": { count: 0 } });
    render(<NotificationBell />);

    await vi.advanceTimersByTimeAsync(100);
    expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument();
  });

  it("opens dropdown with notifications on click", async () => {
    mockFetch({
      "unread-count": { count: 1 },
      "notifications?": {
        events: [{
          eventId: "evt_1",
          eventType: "deadline_reminder",
          occurredAt: new Date().toISOString(),
          targetUserId: "user_1",
          resourceType: "competition",
          resourceId: "comp_1",
          payload: {},
          readAt: null,
        }]
      },
    });

    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId("notification-bell"));

    await waitFor(() => {
      expect(screen.getByTestId("notification-dropdown")).toBeInTheDocument();
    });

    expect(screen.getByText("Competition deadline approaching")).toBeInTheDocument();
  });

  it("shows empty state when no notifications", async () => {
    mockFetch({
      "unread-count": { count: 0 },
      "notifications?": { events: [] },
    });

    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId("notification-bell"));

    await waitFor(() => {
      expect(screen.getByTestId("empty-notifications")).toBeInTheDocument();
    });

    expect(screen.getByText("No notifications yet")).toBeInTheDocument();
  });

  it("marks notification as read on click", async () => {
    const fetchSpy = mockFetch({
      "unread-count": { count: 1 },
      "notifications?": {
        events: [{
          eventId: "evt_1",
          eventType: "script_access_approved",
          occurredAt: new Date().toISOString(),
          targetUserId: "user_1",
          resourceType: "script",
          resourceId: "script_1",
          payload: {},
          readAt: null,
        }]
      },
      "evt_1/read": { updated: true },
    });

    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId("notification-bell"));

    await waitFor(() => {
      expect(screen.getByTestId("notification-evt_1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("notification-evt_1"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("evt_1/read"),
        expect.objectContaining({ method: "PATCH" })
      );
    });
  });

  it("closes dropdown on outside click", async () => {
    mockFetch({
      "unread-count": { count: 0 },
      "notifications?": { events: [] },
    });

    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId("notification-bell"));

    await waitFor(() => {
      expect(screen.getByTestId("notification-dropdown")).toBeInTheDocument();
    });

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByTestId("notification-dropdown")).not.toBeInTheDocument();
    });
  });
});
