import type { z } from '@mongodb-js/compass-user-data';
import type { DeletedDocumentSchema } from './deleted-document-schema';

export type NewDeletedDocument = Omit<
  z.input<typeof DeletedDocumentSchema>,
  '_id' | '_deletedAt'
>;

export interface DeletedDocumentsStorageInterface {
  loadAll(
    namespace?: string
  ): Promise<z.output<typeof DeletedDocumentSchema>[]>;
  delete(id: string): Promise<boolean>;
  /** Snapshot a single deleted document. */
  saveDeleted(data: NewDeletedDocument): Promise<void>;
  /**
   * Snapshot several deleted documents (a bulk delete) as one batch,
   * evicting older entries in a single pass rather than once per document.
   */
  saveManyDeleted(entries: NewDeletedDocument[]): Promise<void>;
}
