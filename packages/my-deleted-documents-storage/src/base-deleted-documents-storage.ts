import { UUID } from 'bson';
import type { IUserData } from '@mongodb-js/compass-user-data';
import { DeletedDocumentSchema } from './deleted-document-schema';
import type {
  DeletedDocumentsStorageInterface,
  NewDeletedDocument,
} from './storage-interfaces';

export class BaseCompassDeletedDocumentsStorage
  implements DeletedDocumentsStorageInterface
{
  // Total number of deleted-document snapshots kept across all namespaces.
  // A single large bulk delete can use up most of this budget at once,
  // evicting older entries sooner than it would otherwise.
  private readonly maxAllowedEntries = 500;

  private readonly userData: IUserData<typeof DeletedDocumentSchema>;

  constructor(userData: IUserData<typeof DeletedDocumentSchema>) {
    this.userData = userData;
  }

  async loadAll(namespace?: string) {
    try {
      const { data } = await this.userData.readAll();
      return data
        .sort((a, b) => b._deletedAt.getTime() - a._deletedAt.getTime())
        .filter((x) => !namespace || x._ns === namespace);
    } catch {
      return [];
    }
  }

  async delete(id: string): Promise<boolean> {
    return await this.userData.delete(id);
  }

  async saveDeleted(data: NewDeletedDocument): Promise<void> {
    await this.saveManyDeleted([data]);
  }

  async saveManyDeleted(entries: NewDeletedDocument[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    const existing = await this.loadAll();
    const overflow = existing.length + entries.length - this.maxAllowedEntries;
    if (overflow > 0) {
      // `existing` is sorted newest-first, so the oldest entries are at the end.
      const toEvict = existing.slice(existing.length - overflow);
      await Promise.all(toEvict.map((entry) => this.delete(entry._id)));
    }

    const _deletedAt = new Date();
    await Promise.all(
      entries.map((data) => {
        const _id = new UUID().toString();
        return this.userData.write(_id, { ...data, _id, _deletedAt });
      })
    );
  }
}
