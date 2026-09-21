import type { DataService } from '@mongodb-js/compass-connections/provider';
import type { AnyBulkWriteOperation, Document, Filter } from 'mongodb';

export type CopyCollectionMode = 'merge' | 'overwrite' | 'replace';

export type CopyProgress = {
  docsProcessed: number;
  docsWritten: number;
  docsSkipped: number;
};

const BATCH_SIZE = 1000;
const DUPLICATE_KEY_ERROR_CODE = 11000;

// Batches documents into the destination connection using bulkWrite,
// mirroring compass-import-export's ImportWriter but supporting the three
// copy-collection modes: 'merge' (insert only, skip existing _ids),
// 'overwrite' (upsert, replacing documents that already exist) and
// 'replace' (clear the destination first, then insert everything).
export class CollectionCopyWriter {
  private dataService: Pick<DataService, 'bulkWrite' | 'deleteMany'>;
  private ns: string;
  private mode: CopyCollectionMode;
  private batch: Document[];
  docsWritten: number;
  docsProcessed: number;
  docsSkipped: number;

  constructor(
    dataService: Pick<DataService, 'bulkWrite' | 'deleteMany'>,
    ns: string,
    mode: CopyCollectionMode
  ) {
    this.dataService = dataService;
    this.ns = ns;
    this.mode = mode;
    this.batch = [];
    this.docsWritten = 0;
    this.docsProcessed = 0;
    this.docsSkipped = 0;
  }

  async prepare(): Promise<void> {
    if (this.mode === 'replace') {
      await this.dataService.deleteMany(this.ns, {});
    }
  }

  async write(document: Document): Promise<void> {
    this.batch.push(document);
    if (this.batch.length >= BATCH_SIZE) {
      await this._executeBatch();
    }
  }

  async finish(): Promise<void> {
    if (this.batch.length > 0) {
      await this._executeBatch();
    }
  }

  private buildOperation(document: Document): AnyBulkWriteOperation<Document> {
    if (this.mode === 'overwrite' || this.mode === 'replace') {
      return {
        replaceOne: {
          filter: {
            _id: (document as { _id?: unknown })._id,
          } as Filter<Document>,
          replacement: document,
          upsert: true,
        },
      };
    }
    return { insertOne: { document } };
  }

  private async _executeBatch(): Promise<void> {
    const documents = this.batch;
    this.batch = [];
    this.docsProcessed += documents.length;

    try {
      const result = await this.dataService.bulkWrite(
        this.ns,
        documents.map((document) => this.buildOperation(document)),
        { ordered: false }
      );
      this.docsWritten +=
        (result.insertedCount || 0) +
        (result.upsertedCount || 0) +
        (result.modifiedCount || 0);
    } catch (bulkWriteError: any) {
      // With `ordered: false`, a bulkWrite that hits any write error throws,
      // but the driver still attaches the partial result to the error.
      const result = bulkWriteError?.result;
      this.docsWritten +=
        (result?.insertedCount || 0) +
        (result?.upsertedCount || 0) +
        (result?.modifiedCount || 0);

      const writeErrors: { code?: number }[] = result?.getWriteErrors?.() || [];
      // In merge mode, colliding on an existing _id is expected, not fatal.
      const fatalErrors =
        this.mode === 'merge'
          ? writeErrors.filter(
              (error) => error.code !== DUPLICATE_KEY_ERROR_CODE
            )
          : writeErrors;
      this.docsSkipped += writeErrors.length - fatalErrors.length;

      if (fatalErrors.length > 0) {
        throw bulkWriteError;
      }
    }
  }
}

export async function streamCopyCollection({
  sourceDataService,
  sourceNs,
  destDataService,
  destNs,
  mode,
  onProgress,
  signal,
}: {
  sourceDataService: Pick<DataService, 'findCursor'>;
  sourceNs: string;
  destDataService: Pick<DataService, 'bulkWrite' | 'deleteMany'>;
  destNs: string;
  mode: CopyCollectionMode;
  onProgress?: (progress: CopyProgress) => void;
  signal?: AbortSignal;
}): Promise<CopyProgress> {
  const writer = new CollectionCopyWriter(destDataService, destNs, mode);
  await writer.prepare();

  const cursor = sourceDataService.findCursor(sourceNs, {});
  try {
    for await (const document of cursor) {
      if (signal?.aborted) {
        break;
      }
      await writer.write(document);
      onProgress?.({
        docsProcessed: writer.docsProcessed,
        docsWritten: writer.docsWritten,
        docsSkipped: writer.docsSkipped,
      });
    }
    // Flush whatever was already buffered even on abort, so a cancelled
    // copy doesn't silently drop up to a batch's worth of documents that
    // were already read from the source.
    await writer.finish();
  } finally {
    await cursor.close();
  }

  return {
    docsProcessed: writer.docsProcessed,
    docsWritten: writer.docsWritten,
    docsSkipped: writer.docsSkipped,
  };
}

// Same-connection copies can use the server-side $merge/$out stages instead
// of streaming documents through the client: $out fully (and atomically)
// replaces the destination collection, while $merge can either skip or
// replace documents that already exist there. Neither stage can write across
// connections/clusters, which is why cross-connection copies fall back to
// streamCopyCollection above.
export async function copySameConnection({
  dataService,
  sourceNs,
  destDb,
  destColl,
  mode,
}: {
  dataService: Pick<DataService, 'aggregate'>;
  sourceNs: string;
  destDb: string;
  destColl: string;
  mode: CopyCollectionMode;
}): Promise<void> {
  const stage =
    mode === 'replace'
      ? { $out: { db: destDb, coll: destColl } }
      : {
          $merge: {
            into: { db: destDb, coll: destColl },
            whenMatched: mode === 'overwrite' ? 'replace' : 'keepExisting',
            whenNotMatched: 'insert',
          },
        };
  await dataService.aggregate(sourceNs, [stage], {});
}
