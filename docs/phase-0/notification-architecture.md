# Notification Architecture (v0)

## Goal

Provide a shared event-driven notification layer for all phases.

## Notification Domains

- Account: welcome, security alerts
- Competition: deadlines, submission updates, placement results
- Discovery: profile views, logline reads, script download alerts
- Marketplace: coverage order status, dispute updates
- Peer exchange: claim accepted, deadline reminder, strike warning
- Industry: mandate matches, list saves, recommendation digests

## Architecture

- Event bus: Redpanda topics (`notification.events.*`)
- Notification service consumes events and writes to `notifications` table.
- Channel workers fan out by policy: email, push, in-app.
- Templates are versioned and locale-aware.

## Core Event Contract

Each event must include:
- `event_id`
- `event_type`
- `occurred_at`
- `actor_user_id` (nullable)
- `target_user_id`
- `resource_type`
- `resource_id`
- `payload` (schema-versioned JSON)

## Reliability Rules

- At-least-once delivery with idempotency key on notification write.
- User-level preferences are checked before channel dispatch.
- Critical legal/security notices are non-optional.

## Initial Topics

- `notification.events.deadline`
- `notification.events.submission`
- `notification.events.download`
- `notification.events.coverage`
- `notification.events.peer_exchange`
- `notification.events.system`
