import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { getKafkaClient, _resetKafkaClient } from "../src/kafka.js";

describe("getKafkaClient", () => {
  before(() => { delete process.env.KAFKA_BROKERS; _resetKafkaClient(); });
  after(() => { delete process.env.KAFKA_BROKERS; _resetKafkaClient(); });

  it("returns null when KAFKA_BROKERS is not set", () => {
    assert.strictEqual(getKafkaClient(), null);
  });

  it("returns a Kafka instance when KAFKA_BROKERS is set", () => {
    process.env.KAFKA_BROKERS = "localhost:9092";
    _resetKafkaClient();
    const client = getKafkaClient();
    assert.ok(client !== null);
  });

  it("returns same instance on repeated calls (singleton)", () => {
    process.env.KAFKA_BROKERS = "localhost:9092";
    _resetKafkaClient();
    const c1 = getKafkaClient();
    const c2 = getKafkaClient();
    assert.strictEqual(c1, c2);
  });
});
