"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import type { NotificationEventEnvelope } from "@script-manifest/contracts";

const POLL_INTERVAL_MS = 30_000;

type NotificationItem = NotificationEventEnvelope & { readAt?: string | null };

function formatEventLabel(event: NotificationItem): string {
  const labels: Record<string, string> = {
    deadline_reminder: "Competition deadline approaching",
    script_access_requested: "Script access requested",
    script_access_approved: "Script access approved",
    script_downloaded: "Script downloaded",
    feedback_review_submitted: "New feedback review",
    feedback_dispute_opened: "Dispute opened",
    feedback_dispute_resolved: "Dispute resolved",
    ranking_badge_awarded: "Badge awarded",
    ranking_tier_changed: "Ranking tier changed",
    partner_submission_received: "Submission received",
    partner_results_published: "Results published",
  };
  return labels[event.eventType] ?? event.eventType.replaceAll("_", " ");
}

function timeAgo(isoDate: string): string {
  const deltaMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/notifications/unread-count", { cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as { count?: number };
        setUnreadCount(body.count ?? 0);
      }
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    void fetchUnreadCount();
    const interval = setInterval(() => void fetchUnreadCount(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function fetchNotifications() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/notifications?limit=20", { cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as { events?: NotificationItem[] };
        setNotifications(body.events ?? []);
      }
    } catch { /* non-critical */ } finally {
      setLoading(false);
    }
  }

  async function handleToggle() {
    if (!open) {
      void fetchNotifications();
    }
    setOpen((prev) => !prev);
  }

  async function markRead(eventId: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.eventId === eventId ? { ...n, readAt: new Date().toISOString() } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await fetch(`/api/v1/notifications/${encodeURIComponent(eventId)}/read`, {
        method: "PATCH",
      });
    } catch { /* non-critical */ }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        className="btn btn-secondary p-2! relative"
        onClick={() => void handleToggle()}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        data-testid="notification-bell"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white"
            data-testid="unread-badge"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-border/60 bg-surface shadow-lg z-50"
          data-testid="notification-dropdown"
        >
          <div className="border-b border-border/60 px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && notifications.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-foreground-secondary">Loading…</div>
            )}

            {!loading && notifications.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-foreground-secondary" data-testid="empty-notifications">
                No notifications yet
              </div>
            )}

            {notifications.map((notification) => (
              <button
                key={notification.eventId}
                type="button"
                className={`block w-full border-b border-border/30 px-4 py-3 text-left transition-colors hover:bg-background-secondary ${
                  notification.readAt ? "opacity-60" : ""
                }`}
                onClick={() => {
                  if (!notification.readAt) {
                    void markRead(notification.eventId);
                  }
                }}
                data-testid={`notification-${notification.eventId}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {formatEventLabel(notification)}
                  </span>
                  {!notification.readAt && (
                    <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                  )}
                </div>
                <span className="mt-1 block text-xs text-foreground-secondary">
                  {timeAgo(notification.occurredAt)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
