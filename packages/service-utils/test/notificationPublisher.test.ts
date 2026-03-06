import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Kafka } from "kafkajs";
import { _resetKafkaClient } from "../src/kafka.js";
import type { NotificationEventEnvelope } from "@script-manifest/contracts";

const originalEnv = {
  KAFKA_BROKERS: process.env.KAFKA_BROKERS,
  NOTIFICATION_SERVICE_URL: process.env.NOTIFICATION_SERVICE_URL,
};

function validEvent(overrides: Partial<NotificationEventEnvelope> = {}): NotificationEventEnvelope {
  return {
    eventId: "evt-1",
    eventType: "deadline_reminder",
    occurredAt: "2026-03-06T12:00:00.000Z",
    actorUserId: "actor-1",
    targetUserId: "user-123",
    resourceType: "competition",
    resourceId: "comp-9",
    payload: { foo: "bar" },
    ...overrides,
  };
}

async function importPublisherModule(seed: string): Promise<typeof import("../src/notificationPublisher.js")> {
  return import(`../src/notificationPublisher.ts?${seed}`);
}

describe("publishNotificationEvent", () => {
  beforeEach(() => {
    if (originalEnv.KAFKA_BROKERS === undefined) {
      delete process.env.KAFKA_BROKERS;
    } else {
      process.env.KAFKA_BROKERS = originalEnv.KAFKA_BROKERS;
    }

    if (originalEnv.NOTIFICATION_SERVICE_URL === undefined) {
      delete process.env.NOTIFICATION_SERVICE_URL;
    } else {
      process.env.NOTIFICATION_SERVICE_URL = originalEnv.NOTIFICATION_SERVICE_URL;
    }

    _resetKafkaClient();
  });

  afterEach(() => {
    if (originalEnv.KAFKA_BROKERS === undefined) {
      delete process.env.KAFKA_BROKERS;
    } else {
      process.env.KAFKA_BROKERS = originalEnv.KAFKA_BROKERS;
    }

    if (originalEnv.NOTIFICATION_SERVICE_URL === undefined) {
      delete process.env.NOTIFICATION_SERVICE_URL;
    } else {
      process.env.NOTIFICATION_SERVICE_URL = originalEnv.NOTIFICATION_SERVICE_URL;
    }

    _resetKafkaClient();
  });

  it("sends to Kafka topic notification-events when KAFKA_BROKERS is set", async () => {
    process.env.KAFKA_BROKERS = "localhost:9092";

    const sendCalls: unknown[] = [];
    let connectCalls = 0;
    const mockProducer = {
      connect: async () => {
        connectCalls += 1;
      },
      send: async (payload: unknown) => {
        sendCalls.push(payload);
      },
      disconnect: async () => {},
    };

    const originalProducer = Kafka.prototype.producer;
    Kafka.prototype.producer = function producer() {
      return mockProducer as never;
    };

    try {
      const { publishNotificationEvent } = await importPublisherModule("kafka-send");
      const event = validEvent();

      await publishNotificationEvent(event);

      assert.equal(connectCalls, 1);
      assert.equal(sendCalls.length, 1);
      assert.deepEqual(sendCalls[0], {
        topic: "notification-events",
        messages: [{ key: event.targetUserId, value: JSON.stringify(event) }],
      });
    } finally {
      Kafka.prototype.producer = originalProducer;
    }
  });

  it("falls back to HTTP POST when KAFKA_BROKERS is not set", async () => {
    delete process.env.KAFKA_BROKERS;

    const received: { url?: string; method?: string; body?: string } = {};
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }
      received.url = req.url;
      received.method = req.method;
      received.body = Buffer.concat(chunks).toString("utf8");
      res.statusCode = 202;
      res.end("ok");
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    process.env.NOTIFICATION_SERVICE_URL = `http://127.0.0.1:${address.port}`;

    try {
      const { publishNotificationEvent } = await importPublisherModule("http-fallback");
      const event = validEvent();
      await publishNotificationEvent(event);

      assert.equal(received.url, "/internal/events");
      assert.equal(received.method, "POST");
      assert.equal(received.body, JSON.stringify(event));
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it("throws schema validation error in Kafka path for invalid events", async () => {
    process.env.KAFKA_BROKERS = "localhost:9092";
    const originalProducer = Kafka.prototype.producer;
    Kafka.prototype.producer = function producer() {
      return {
        connect: async () => {},
        send: async () => {},
        disconnect: async () => {},
      } as never;
    };

    try {
      const { publishNotificationEvent } = await importPublisherModule("kafka-validate");

      await assert.rejects(
        () => publishNotificationEvent(validEvent({ targetUserId: "" })),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes("targetUserId"));
          return true;
        }
      );
    } finally {
      Kafka.prototype.producer = originalProducer;
    }
  });

  it("throws schema validation error in HTTP fallback path for invalid events", async () => {
    delete process.env.KAFKA_BROKERS;
    let requestCalls = 0;

    const server = createServer(async (_req, res) => {
      requestCalls += 1;
      res.statusCode = 202;
      res.end("ok");
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    process.env.NOTIFICATION_SERVICE_URL = `http://127.0.0.1:${address.port}`;

    try {
      const { publishNotificationEvent } = await importPublisherModule("http-validate");

      await assert.rejects(
        () => publishNotificationEvent(validEvent({ targetUserId: "" })),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes("targetUserId"));
          return true;
        }
      );

      assert.equal(requestCalls, 0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it("connects lazily only on first publish", async () => {
    process.env.KAFKA_BROKERS = "localhost:9092";

    let connectCalls = 0;
    const mockProducer = {
      connect: async () => {
        connectCalls += 1;
      },
      send: async () => {},
      disconnect: async () => {},
    };

    const originalProducer = Kafka.prototype.producer;
    Kafka.prototype.producer = function producer() {
      return mockProducer as never;
    };

    try {
      const { publishNotificationEvent } = await importPublisherModule("lazy-connect");
      assert.equal(connectCalls, 0);

      await publishNotificationEvent(validEvent());
      assert.equal(connectCalls, 1);
    } finally {
      Kafka.prototype.producer = originalProducer;
    }
  });

  it("disconnectProducer disconnects producer if initialized", async () => {
    process.env.KAFKA_BROKERS = "localhost:9092";

    let disconnectCalls = 0;
    const mockProducer = {
      connect: async () => {},
      send: async () => {},
      disconnect: async () => {
        disconnectCalls += 1;
      },
    };

    const originalProducer = Kafka.prototype.producer;
    Kafka.prototype.producer = function producer() {
      return mockProducer as never;
    };

    try {
      const { publishNotificationEvent, disconnectProducer } = await importPublisherModule("disconnect");

      await publishNotificationEvent(validEvent());
      await disconnectProducer();

      assert.equal(disconnectCalls, 1);
    } finally {
      Kafka.prototype.producer = originalProducer;
    }
  });
});
