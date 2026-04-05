import {
  type SearchSyncEvent,
  SearchSyncEventSchema,
} from "@script-manifest/contracts";
import type { Producer } from "kafkajs";
import { getKafkaClient } from "./kafka.js";

const TOPIC = "search-sync-events";

let producer: Producer | null = null;

async function getProducer(): Promise<Producer | null> {
  const kafka = getKafkaClient();
  if (!kafka) return null;

  if (!producer) {
    producer = kafka.producer();
    await producer.connect();
  }

  return producer;
}

export async function publishSearchSyncEvent(event: SearchSyncEvent): Promise<void> {
  const validated = SearchSyncEventSchema.parse(event);
  const kafkaProducer = await getProducer();

  if (!kafkaProducer) {
    return;
  }

  await kafkaProducer.send({
    topic: TOPIC,
    messages: [{ key: validated.documentId, value: JSON.stringify(validated) }],
  });
}

export async function disconnectSearchSyncProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
  }
}
