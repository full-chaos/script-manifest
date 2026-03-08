export const PAYMENT_RETRY_BACKOFF_MS = [60_000, 300_000, 1_800_000, 7_200_000] as const;

export function getInitialRetryAt(now = Date.now()): string {
  return new Date(now + PAYMENT_RETRY_BACKOFF_MS[0]).toISOString();
}

export function getNextRetryAt(attemptNumber: number, now = Date.now()): string | null {
  const delay = PAYMENT_RETRY_BACKOFF_MS[attemptNumber + 1];
  if (delay === undefined) {
    return null;
  }
  return new Date(now + delay).toISOString();
}
