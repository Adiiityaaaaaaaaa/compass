import { expect } from 'chai';
import sinon from 'sinon';
import {
  CollectionCopyWriter,
  streamCopyCollection,
} from './copy-collection-writer';

function fakeCursor(docs: Record<string, unknown>[]) {
  let i = 0;
  return {
    [Symbol.asyncIterator]() {
      return {
        next() {
          if (i < docs.length) {
            return Promise.resolve({ value: docs[i++], done: false });
          }
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
    close: sinon.stub().resolves(),
  };
}

describe('CollectionCopyWriter', function () {
  it('merge mode: inserts and treats duplicate key errors as skipped, not fatal', async function () {
    const bulkWrite = sinon.stub().rejects(
      Object.assign(new Error('bulk write error'), {
        result: {
          insertedCount: 1,
          getWriteErrors: () => [{ code: 11000, index: 1 }],
        },
      })
    );
    const dataService = { bulkWrite, deleteMany: sinon.stub() };
    const writer = new CollectionCopyWriter(
      dataService as any,
      'db.coll',
      'merge'
    );
    await writer.write({ _id: 1 });
    await writer.write({ _id: 2 });
    await writer.finish();

    expect(bulkWrite.callCount).to.equal(1);
    const [, operations] = bulkWrite.getCall(0).args;
    expect(operations).to.deep.equal([
      { insertOne: { document: { _id: 1 } } },
      { insertOne: { document: { _id: 2 } } },
    ]);
    expect(writer.docsWritten).to.equal(1);
    expect(writer.docsSkipped).to.equal(1);
  });

  it('merge mode: rethrows on a non-duplicate-key write error', async function () {
    const bulkWrite = sinon.stub().rejects(
      Object.assign(new Error('bulk write error'), {
        result: {
          insertedCount: 0,
          getWriteErrors: () => [{ code: 121, index: 0 }],
        },
      })
    );
    const dataService = { bulkWrite, deleteMany: sinon.stub() };
    const writer = new CollectionCopyWriter(
      dataService as any,
      'db.coll',
      'merge'
    );
    await writer.write({ _id: 1 });

    let thrown: unknown;
    try {
      await writer.finish();
    } catch (err) {
      thrown = err;
    }
    expect(thrown).to.be.instanceOf(Error);
  });

  it('overwrite mode: upserts by _id instead of inserting', async function () {
    const bulkWrite = sinon
      .stub()
      .resolves({ insertedCount: 0, upsertedCount: 1, modifiedCount: 0 });
    const dataService = { bulkWrite, deleteMany: sinon.stub() };
    const writer = new CollectionCopyWriter(
      dataService as any,
      'db.coll',
      'overwrite'
    );
    await writer.write({ _id: 1, a: 1 });
    await writer.finish();

    const [, operations] = bulkWrite.getCall(0).args;
    expect(operations).to.deep.equal([
      {
        replaceOne: {
          filter: { _id: 1 },
          replacement: { _id: 1, a: 1 },
          upsert: true,
        },
      },
    ]);
    expect(writer.docsWritten).to.equal(1);
  });

  it('replace mode: clears the destination collection before writing', async function () {
    const bulkWrite = sinon
      .stub()
      .resolves({ insertedCount: 0, upsertedCount: 1, modifiedCount: 0 });
    const deleteMany = sinon.stub().resolves({ deletedCount: 5 });
    const dataService = { bulkWrite, deleteMany };
    const writer = new CollectionCopyWriter(
      dataService as any,
      'db.coll',
      'replace'
    );
    await writer.prepare();

    expect(deleteMany.callCount).to.equal(1);
    expect(deleteMany.getCall(0).args).to.deep.equal(['db.coll', {}]);
  });
});

describe('streamCopyCollection', function () {
  it('streams documents from the source cursor into the destination writer', async function () {
    const docs = [{ _id: 1 }, { _id: 2 }, { _id: 3 }];
    const cursor = fakeCursor(docs);
    const sourceDataService = {
      findCursor: sinon.stub().returns(cursor),
    };
    const bulkWrite = sinon
      .stub()
      .resolves({ insertedCount: 1, upsertedCount: 0, modifiedCount: 0 });
    const destDataService = { bulkWrite, deleteMany: sinon.stub() };

    const result = await streamCopyCollection({
      sourceDataService: sourceDataService as any,
      sourceNs: 'db.source',
      destDataService: destDataService as any,
      destNs: 'db.dest',
      mode: 'merge',
    });

    expect(sourceDataService.findCursor.callCount).to.equal(1);
    expect(sourceDataService.findCursor.getCall(0).args).to.deep.equal([
      'db.source',
      {},
    ]);
    // All 3 documents fit in a single batch (BATCH_SIZE is 1000), so they're
    // flushed together in one bulkWrite call once the source cursor is drained.
    expect(bulkWrite.callCount).to.equal(1);
    expect(result.docsProcessed).to.equal(3);
    expect(cursor.close.callCount).to.equal(1);
  });

  it('stops consuming the source cursor once the abort signal fires', async function () {
    const docs = [{ _id: 1 }, { _id: 2 }, { _id: 3 }];
    const cursor = fakeCursor(docs);
    const sourceDataService = { findCursor: sinon.stub().returns(cursor) };
    const bulkWrite = sinon
      .stub()
      .resolves({ insertedCount: 1, upsertedCount: 0, modifiedCount: 0 });
    const destDataService = { bulkWrite, deleteMany: sinon.stub() };
    const controller = new AbortController();

    let calls = 0;
    const result = await streamCopyCollection({
      sourceDataService: sourceDataService as any,
      sourceNs: 'db.source',
      destDataService: destDataService as any,
      destNs: 'db.dest',
      mode: 'merge',
      signal: controller.signal,
      onProgress: () => {
        calls++;
        if (calls === 1) {
          controller.abort();
        }
      },
    });

    // Only the 1 document read before abort was seen, and it's still
    // flushed (not silently dropped) once the loop exits.
    expect(result.docsProcessed).to.equal(1);
    expect(bulkWrite.callCount).to.equal(1);
  });
});
