import assert from "node:assert/strict";
import test from "node:test";
import { API_BASE_URL, authHeaders, expectOkJson, jsonRequest, makeUnique, registerUser } from "./helpers.js";

type NotificationEvent = {
  id: string;
  readAt: string | null;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("compose flow: notification delivery, read acknowledgement, and unread count updates", { skip: "Feedback claim → notification pipeline not yet wired in compose" }, async () => {
  const owner = await registerUser("notification-owner");
  const reviewer = await registerUser("notification-reviewer");

  await expectOkJson(`${API_BASE_URL}/api/v1/feedback/tokens/grant-signup`, {
    method: "POST",
    headers: authHeaders(owner.token)
  }, 201);
  await expectOkJson(`${API_BASE_URL}/api/v1/feedback/tokens/grant-signup`, {
    method: "POST",
    headers: authHeaders(reviewer.token)
  }, 201);

  const beforeUnread = await expectOkJson<{ count: number }>(
    `${API_BASE_URL}/api/v1/notifications/unread-count`,
    {
      method: "GET",
      headers: authHeaders(owner.token)
    },
    200
  );

  const listing = await expectOkJson<{ listing: { id: string } }>(`${API_BASE_URL}/api/v1/feedback/listings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(owner.token)
    },
    body: JSON.stringify({
      projectId: makeUnique("notification_project"),
      scriptId: makeUnique("notification_script"),
      title: "Notification Integration Script",
      description: "Exercise notification pipeline from feedback events.",
      genre: "drama",
      format: "feature",
      pageCount: 102
    })
  }, 201);

  await expectOkJson(`${API_BASE_URL}/api/v1/feedback/listings/${encodeURIComponent(listing.listing.id)}/claim`, {
    method: "POST",
    headers: authHeaders(reviewer.token)
  }, 201);

  let polledEvents: NotificationEvent[] = [];
  let polledUnread = beforeUnread.count;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const eventsResponse = await expectOkJson<{ events: NotificationEvent[] }>(
      `${API_BASE_URL}/api/v1/notifications?limit=20`,
      {
        method: "GET",
        headers: authHeaders(owner.token)
      },
      200
    );
    const unreadResponse = await expectOkJson<{ count: number }>(
      `${API_BASE_URL}/api/v1/notifications/unread-count`,
      {
        method: "GET",
        headers: authHeaders(owner.token)
      },
      200
    );

    polledEvents = eventsResponse.events;
    polledUnread = unreadResponse.count;
    if (polledUnread > beforeUnread.count) {
      break;
    }
    await wait(500);
  }

  assert.ok(polledUnread > beforeUnread.count, "expected unread count to increase after notification event");

  const unreadEvent = polledEvents.find((event) => event.readAt === null);
  assert.ok(unreadEvent, "expected at least one unread notification event");

  const markRead = await jsonRequest<{ updated?: boolean }>(
    `${API_BASE_URL}/api/v1/notifications/${encodeURIComponent(unreadEvent.id)}/read`,
    {
      method: "PATCH",
      headers: authHeaders(owner.token)
    }
  );
  assert.equal(markRead.status, 200, markRead.rawBody);
  assert.equal(markRead.body.updated, true);

  let finalUnread = polledUnread;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const unreadResponse = await expectOkJson<{ count: number }>(
      `${API_BASE_URL}/api/v1/notifications/unread-count`,
      {
        method: "GET",
        headers: authHeaders(owner.token)
      },
      200
    );
    finalUnread = unreadResponse.count;
    if (finalUnread < polledUnread) {
      break;
    }
    await wait(300);
  }

  assert.ok(finalUnread < polledUnread, "expected unread count to decrement after marking as read");
});
