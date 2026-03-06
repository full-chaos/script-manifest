export class BaseMemoryRepository {
  private nextId = 1;

  async init(): Promise<void> {}

  async healthCheck(): Promise<{ database: boolean }> {
    return { database: true };
  }

  protected createStore<K, V>(entries?: Iterable<readonly [K, V]>): Map<K, V> {
    return new Map(entries);
  }

  protected createId(prefix: string): string {
    const value = `${prefix}_${this.nextId}`;
    this.nextId += 1;
    return value;
  }
}
