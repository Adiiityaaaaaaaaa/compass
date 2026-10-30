import { UUID } from 'bson';
import type { IUserData } from '@mongodb-js/compass-user-data';
import type { BuilderQuery, BuilderQuerySchema } from './query-storage-schema';
import type { BuilderQueryStorageInterface } from './storage-interfaces';

/** What the storage needs from wherever the queries are kept. */
export type BuilderQueryUserData = Pick<
  IUserData<typeof BuilderQuerySchema>,
  'readAll' | 'write' | 'updateAttributes' | 'delete'
>;

export class BaseCompassBuilderQueryStorage
  implements BuilderQueryStorageInterface
{
  private readonly userData: BuilderQueryUserData;

  constructor(userData: BuilderQueryUserData) {
    this.userData = userData;
  }

  async loadAll(
    connectionId: string,
    namespace: string
  ): Promise<BuilderQuery[]> {
    try {
      const { data } = await this.userData.readAll();
      return data
        .filter(
          (query) =>
            query._connectionId === connectionId && query._ns === namespace
        )
        .sort((a, b) => a._name.localeCompare(b._name));
    } catch {
      return [];
    }
  }

  /**
   * Saving under a name the collection already has replaces that query's rows
   * and keeps its star, so saving again is how a saved query is updated.
   */
  async saveQuery(
    data: Pick<BuilderQuery, '_name' | '_ns' | '_connectionId' | 'builderState'>
  ): Promise<BuilderQuery> {
    const existing = (await this.loadAll(data._connectionId, data._ns)).find(
      (query) => query._name === data._name
    );
    const now = new Date();
    const query: BuilderQuery = {
      ...data,
      _id: existing?._id ?? new UUID().toString(),
      _isDefault: existing?._isDefault ?? false,
      _dateSaved: existing?._dateSaved ?? now,
      _dateModified: now,
    };
    await this.userData.write(query._id, query);
    return query;
  }

  /**
   * Makes one query the collection's default, taking the star from any other,
   * or leaves the collection with no default when `id` is null.
   */
  async setDefault(
    connectionId: string,
    namespace: string,
    id: string | null
  ): Promise<void> {
    for (const query of await this.loadAll(connectionId, namespace)) {
      const isDefault = query._id === id;
      if (!!query._isDefault !== isDefault) {
        await this.userData.updateAttributes(query._id, {
          _isDefault: isDefault,
        });
      }
    }
  }

  async delete(id: string): Promise<boolean> {
    return await this.userData.delete(id);
  }
}
