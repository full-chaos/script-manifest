import Typesense from "typesense";

let _client: Typesense.Client | null = null;

export function getTypesenseClient(): Typesense.Client | null {
  const apiKey = process.env.TYPESENSE_API_KEY;
  if (!apiKey) return null;

  if (!_client) {
    _client = new Typesense.Client({
      nodes: [
        {
          host: process.env.TYPESENSE_HOST ?? "localhost",
          port: Number(process.env.TYPESENSE_PORT ?? 8108),
          protocol: process.env.TYPESENSE_PROTOCOL ?? "http"
        }
      ],
      apiKey,
      connectionTimeoutSeconds: 5,
      retryIntervalSeconds: 0.1,
      numRetries: 3
    });
  }

  return _client;
}

export function _resetTypesenseClient(): void {
  _client = null;
}
