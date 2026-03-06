import assert from "node:assert/strict";
import test from "node:test";
import { BaseMemoryRepository, _resetKafkaClient, getKafkaClient } from "@script-manifest/service-utils";
import type { NotificationEventEnvelope } from "@script-manifest/contracts";
import type { FastifyBaseLogger } from "fastify";
import { startConsumer } from "./consumer.js";
import type { NotificationRepository } from "./repository.js";

class MemoryNotificationRepository extends BaseMemoryRepository implements NotificationRepository {
  private readonly events: NotificationEventEnvelope[] = [];

  async pushEvent(event: NotificationEventEnvelope): Promise<void> {
    this.events.push(event);
  }

  async getEventsByTargetUser(targetUserId: string): Promise<NotificationEventEnvelope[]> {
    return this.events.filter((event) => event.targetUserId === targetUserId);
  }

  get pushedEvents(): NotificationEventEnvelope[] {
    return this.events;
  }
}

function createLogger() {
  const warnings: string[] = [];
  const errors: Array<{ context: unknown; message: string }> = [];

  const logger = {
    warn: (message: string) => {
      warnings.push(message);
    },
    error: (context: unknown, message: string) => {
      errors.push({ context, message });
    },
  } as unknown as FastifyBaseLogger;

  return { logger, warnings, errors };
}

type FakeEachMessage = (payload: { message: { value: Buffer; offset: string } }) => Promise<void>;

function setupKafkaMock() {
  process.env.KAFKA_BROKERS = "localhost:9092";
  _resetKafkaClient();

  const calls = {
    connect: 0,
    subscribe: 0,
    run: 0,
    disconnect: 0,
  };

  let eachMessage: FakeEachMessage | null = null;

  const fakeConsumer = {
    connect: async () => {
      calls.connect += 1;
    },
    subscribe: async () => {
      calls.subscribe += 1;
    },
    run: async (params: { eachMessage: FakeEachMessage }) => {
      calls.run += 1;
      eachMessage = params.eachMessage;
    },
    disconnect: async () => {
      calls.disconnect += 1;
    },
  };

  const kafka = getKafkaClient();
  assert.ok(kafka, "expected kafka client when KAFKA_BROKERS is set");
  (kafka as unknown as { consumer: () => typeof fakeConsumer }).consumer = () => fakeConsumer;

  return {
    calls,
    getEachMessage: () => eachMessage,
  };
}

test.afterEach(() => {
  delete process.env.KAFKA_BROKERS;
  _resetKafkaClient();
});

test("startConsumer returns a disconnect function", async () => {
  const repo = new MemoryNotificationRepository();
  const { logger } = createLogger();
  const kafkaMock = setupKafkaMock();

  const stopConsumer = await startConsumer(repo, logger);
  assert.equal(typeof stopConsumer, "function");

  await stopConsumer();
  assert.equal(kafkaMock.calls.connect, 1);
  assert.equal(kafkaMock.calls.subscribe, 1);
  assert.equal(kafkaMock.calls.run, 1);
  assert.equal(kafkaMock.calls.disconnect, 1);
});

test("startConsumer disables consumer when KAFKA_BROKERS is missing", async () => {
  delete process.env.KAFKA_BROKERS;
  _resetKafkaClient();

  const repo = new MemoryNotificationRepository();
  const { logger, warnings } = createLogger();

  const stopConsumer = await startConsumer(repo, logger);
  await stopConsumer();

  assert.deepEqual(warnings, ["KAFKA_BROKERS not set — Kafka consumer disabled"]);
});

test("startConsumer persists valid kafka messages", async () => {
  const repo = new MemoryNotificationRepository();
  const { logger, errors } = createLogger();
  const kafkaMock = setupKafkaMock();

  await startConsumer(repo, logger);
  const eachMessage = kafkaMock.getEachMessage();
  assert.ok(eachMessage, "expected eachMessage handler to be registered");

  const event: NotificationEventEnvelope = {
    eventId: "evt_1",
    eventType: "script_downloaded",
    occurredAt: "2026-02-06T10:00:00Z",
    targetUserId: "writer_01",
    resourceType: "script",
    resourceId: "script_01",
    payload: { source: "kafka" },
  };

  await eachMessage({
    message: {
      value: Buffer.from(JSON.stringify(event)),
      offset: "0",
    },
  });

  assert.equal(repo.pushedEvents.length, 1);
  assert.deepEqual(repo.pushedEvents[0], event);
  assert.equal(errors.length, 0);
});

test("startConsumer logs and skips invalid JSON messages", async () => {
  const repo = new MemoryNotificationRepository();
  const { logger, errors } = createLogger();
  const kafkaMock = setupKafkaMock();

  await startConsumer(repo, logger);
  const eachMessage = kafkaMock.getEachMessage();
  assert.ok(eachMessage, "expected eachMessage handler to be registered");

  await eachMessage({
    message: {
      value: Buffer.from("{not-json"),
      offset: "42",
    },
  });

  assert.equal(repo.pushedEvents.length, 0);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.message, "failed to process notification event from kafka");
});
