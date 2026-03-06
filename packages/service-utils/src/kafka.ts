import { Kafka } from "kafkajs";

let _kafka: Kafka | null = null;

export function getKafkaClient(): Kafka | null {
  const brokers = process.env.KAFKA_BROKERS;
  if (!brokers) return null;
  if (!_kafka) {
    _kafka = new Kafka({
      clientId: "script-manifest",
      brokers: brokers.split(","),
      retry: { retries: 3 },
    });
  }
  return _kafka;
}

export function _resetKafkaClient(): void {
  _kafka = null;
}
