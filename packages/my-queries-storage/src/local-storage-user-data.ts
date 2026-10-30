import { EJSON } from 'bson';
import type { ReadAllResult, z } from '@mongodb-js/compass-user-data';

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * User data kept in the browser's localStorage, all of it under one key.
 *
 * For Compass Web, which has no file system to keep it in, and whose Atlas
 * user data service only takes the types Atlas itself knows. It belongs to
 * the browser rather than to the person signed in.
 */
export class LocalStorageUserData<T extends z.Schema> {
  private readonly validator: T;
  private readonly key: string;
  private readonly storage: KeyValueStorage;

  constructor(validator: T, key: string, storage: KeyValueStorage) {
    this.validator = validator;
    this.key = key;
    this.storage = storage;
  }

  private readItems(): Record<string, z.input<T>> {
    try {
      // Canonical EJSON, as on disk: relaxed mode writes an Int64 as a plain
      // number, which comes back rounded once it is past 2^53.
      return EJSON.parse(this.storage.getItem(this.key) ?? '{}', {
        relaxed: false,
      }) as Record<string, z.input<T>>;
    } catch {
      return {};
    }
  }

  private writeItems(items: Record<string, z.input<T>>) {
    this.storage.setItem(this.key, EJSON.stringify(items, { relaxed: false }));
  }

  readAll(): Promise<ReadAllResult<T>> {
    const result: ReadAllResult<T> = { data: [], errors: [] };
    for (const item of Object.values(this.readItems())) {
      try {
        result.data.push(this.validator.parse(item) as z.output<T>);
      } catch (error) {
        result.errors.push(error as Error);
      }
    }
    return Promise.resolve(result);
  }

  write(id: string, content: z.input<T>): Promise<boolean> {
    this.validator.parse(content);
    this.writeItems({ ...this.readItems(), [id]: content });
    return Promise.resolve(true);
  }

  updateAttributes(id: string, data: Partial<z.input<T>>): Promise<boolean> {
    const items = this.readItems();
    const updated = { ...items[id], ...data };
    this.validator.parse(updated);
    this.writeItems({ ...items, [id]: updated });
    return Promise.resolve(true);
  }

  delete(id: string): Promise<boolean> {
    const items = this.readItems();
    this.writeItems(
      Object.fromEntries(Object.entries(items).filter(([key]) => key !== id))
    );
    return Promise.resolve(id in items);
  }
}
